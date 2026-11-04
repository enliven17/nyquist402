extern crate std;

use soroban_sdk::{
    testutils::{
        Address as _, AuthorizedFunction, AuthorizedInvocation, IssuerFlags, Ledger, MockAuth,
        MockAuthInvoke, StellarAssetIssuer,
    },
    token::{StellarAssetClient, TokenClient},
    vec, Address, BytesN, Env, IntoVal, Symbol,
};

use crate::{ClaimStatus, Error, PaymentTerms, ProtectedEscrow, ProtectedEscrowClient};

const NOW: u64 = 1_800_000_000;
const MAX: i128 = 1_000;

struct Setup {
    env: Env,
    escrow: ProtectedEscrowClient<'static>,
    token: TokenClient<'static>,
    payer: Address,
    seller: Address,
    custom: Address,
    default: Address,
    issuer: StellarAssetIssuer,
}

impl Setup {
    fn new() -> Self {
        let env = Env::default();
        env.ledger().set_timestamp(NOW);
        let payer = Address::generate(&env);
        let default = Address::generate(&env);
        let asset = env.register_stellar_asset_contract_v2(Address::generate(&env));
        let token_address = asset.address();
        StellarAssetClient::new(&env, &token_address)
            .mock_all_auths()
            .mint(&payer, &(MAX * 10));
        let contract = env.register(ProtectedEscrow, (&default,));
        Self {
            escrow: ProtectedEscrowClient::new(&env, &contract),
            token: TokenClient::new(&env, &token_address),
            seller: Address::generate(&env),
            custom: Address::generate(&env),
            default,
            issuer: asset.issuer(),
            payer,
            env,
        }
    }

    fn terms(&self) -> PaymentTerms {
        PaymentTerms {
            payer: self.payer.clone(),
            seller: self.seller.clone(),
            token: self.token.address.clone(),
            agreement: self.delivery(8),
            max_amount: MAX,
            fund_by: NOW + 60,
            delivery_deadline: NOW + 3_600,
            buyer_arbiter: Some(self.custom.clone()),
            seller_arbiter: Some(self.custom.clone()),
            default_arbiter: self.default.clone(),
            review_seconds: 60,
            response_seconds: 30,
            arbiter_seconds: 60,
            default_seconds: 60,
            fallback_seller_bps: 2_500,
            salt: BytesN::from_array(&self.env, &[7; 32]),
        }
    }

    fn fund(&self) -> BytesN<32> {
        self.env.mock_all_auths();
        self.escrow.authorize(&self.terms())
    }

    fn warp(&self, timestamp: u64) {
        self.env.ledger().set_timestamp(timestamp);
    }

    fn delivery(&self, n: u8) -> BytesN<32> {
        BytesN::from_array(&self.env, &[n; 32])
    }

    fn claim(&self, id: &BytesN<32>, amount: i128) -> u32 {
        self.escrow.claim(id, &amount, &self.delivery(1))
    }

    fn accept(&self, id: &BytesN<32>, claim: u32) {
        let c = self.escrow.claim_state(id, &claim);
        self.escrow.accept(id, &claim, &c.commitment);
    }
}

#[test]
fn reclaim_returns_unused_three_while_disputed_four_stays_locked() {
    let s = Setup::new();
    let id = s.fund();
    let paid = s.claim(&id, 300);
    s.accept(&id, paid);
    s.warp(NOW + 3_590);
    let disputed = s.claim(&id, 400);
    s.escrow.dispute(&id, &disputed, &s.payer, &s.delivery(2));

    s.warp(s.terms().delivery_deadline);
    s.escrow.reclaim(&id);
    assert_eq!(s.token.balance(&s.seller), 300);
    assert_eq!(s.token.balance(&s.payer), 9_300);
    assert_eq!(s.token.balance(&s.escrow.address), 400);
    let state = s.escrow.payment_state(&id);
    assert_eq!((state.available, state.reserved), (0, 400));
    assert_eq!(
        s.escrow.claim_state(&id, &disputed).status,
        ClaimStatus::Disputed
    );
    assert_eq!(s.escrow.try_reclaim(&id), Err(Ok(Error::FundsReserved)));
    assert_eq!(
        s.escrow.try_settle(&id, &disputed),
        Err(Ok(Error::DisputeActive))
    );
    assert_eq!(
        s.escrow.try_void_unclaimed(&id),
        Err(Ok(Error::FundsReserved))
    );

    let case = s.escrow.claim_state(&id, &disputed);
    s.warp(case.response_until);
    s.escrow.rule(&id, &disputed, &250, &case.revision);
    assert_eq!(s.token.balance(&s.seller), 550);
    assert_eq!(s.token.balance(&s.payer), 9_450);
    assert_eq!(s.token.balance(&s.escrow.address), 0);
}

#[test]
fn session_expiry_does_not_bypass_pending_review() {
    let s = Setup::new();
    let id = s.fund();
    s.warp(NOW + 3_590);
    let claim = s.claim(&id, 400);
    s.warp(s.terms().delivery_deadline);
    s.escrow.reclaim(&id);
    assert_eq!(s.token.balance(&s.escrow.address), 400);
    assert_eq!(
        s.escrow.try_settle(&id, &claim),
        Err(Ok(Error::ReviewPending))
    );
    let c = s.escrow.claim_state(&id, &claim);
    s.warp(c.review_until);
    s.escrow.settle(&id, &claim);
    assert_eq!(s.token.balance(&s.seller), 400);
}

#[test]
fn claims_reserve_disjoint_budget_and_settle_independently() {
    let s = Setup::new();
    let id = s.fund();
    let first = s.claim(&id, 300);
    let second = s.claim(&id, 400);
    assert_ne!(first, second);
    assert_eq!(
        s.escrow.try_claim(&id, &301, &s.delivery(3)),
        Err(Ok(Error::InsufficientAvailable))
    );
    s.accept(&id, first);
    s.escrow.dispute(&id, &second, &s.seller, &s.delivery(4));
    assert_eq!(s.token.balance(&s.seller), 300);
    assert_eq!(s.escrow.payment_state(&id).reserved, 400);
    assert_eq!(
        s.escrow
            .try_accept(&id, &second, &s.escrow.claim_state(&id, &second).commitment),
        Err(Ok(Error::DisputeActive))
    );
    assert_eq!(
        s.escrow.try_settle(&id, &first),
        Err(Ok(Error::AlreadySettled))
    );
}

#[test]
fn agreed_custom_arbiter_escalates_then_signed_fallback_is_permissionless() {
    let s = Setup::new();
    let id = s.fund();
    let claim = s.claim(&id, 400);
    s.escrow.dispute(&id, &claim, &s.payer, &s.delivery(2));
    let c = s.escrow.claim_state(&id, &claim);
    assert_eq!(s.escrow.case_arbiter(&id, &claim), Some(s.custom.clone()));
    assert_eq!(
        s.escrow.try_rule(&id, &claim, &400, &c.revision),
        Err(Ok(Error::ResponsePending))
    );
    s.warp(c.custom_until);
    assert_eq!(s.escrow.case_arbiter(&id, &claim), Some(s.default.clone()));
    assert_eq!(
        s.escrow.try_finalize_fallback(&id, &claim),
        Err(Ok(Error::FallbackNotReady))
    );
    s.warp(c.fallback_at);
    assert_eq!(s.escrow.case_arbiter(&id, &claim), None);
    assert_eq!(
        s.escrow.try_rule(&id, &claim, &400, &c.revision),
        Err(Ok(Error::RulingExpired))
    );
    s.env.mock_auths(&[]);
    s.escrow.finalize_fallback(&id, &claim);
    assert_eq!(s.token.balance(&s.seller), 100);
    assert_eq!(s.token.balance(&s.payer), 9_300);
    assert_eq!(
        s.escrow.try_finalize_fallback(&id, &claim),
        Err(Ok(Error::AlreadySettled))
    );
}

#[test]
fn conflicting_preferences_select_pinned_default_without_extra_escalation_delay() {
    let s = Setup::new();
    s.env.mock_all_auths();
    let mut terms = s.terms();
    terms.seller_arbiter = None;
    let id = s.escrow.authorize(&terms);
    let claim = s.claim(&id, 400);
    s.escrow.dispute(&id, &claim, &s.seller, &s.delivery(2));
    let c = s.escrow.claim_state(&id, &claim);
    assert_eq!(s.escrow.case_arbiter(&id, &claim), Some(s.default.clone()));
    assert_eq!(c.fallback_at, c.response_until + terms.default_seconds);
}

#[test]
fn evidence_revision_and_acceptance_commitment_prevent_stale_settlement() {
    let s = Setup::new();
    let id = s.fund();
    let claim = s.claim(&id, 400);
    assert_eq!(
        s.escrow.try_accept(&id, &claim, &s.delivery(9)),
        Err(Ok(Error::StaleClaim))
    );
    s.escrow.dispute(&id, &claim, &s.payer, &s.delivery(2));
    let before = s.escrow.claim_state(&id, &claim);
    s.escrow
        .submit_evidence(&id, &claim, &s.seller, &s.delivery(3));
    let after = s.escrow.claim_state(&id, &claim);
    assert_eq!(after.revision, before.revision + 1);
    s.warp(after.response_until);
    assert_eq!(
        s.escrow.try_rule(&id, &claim, &400, &before.revision),
        Err(Ok(Error::StaleClaim))
    );
    assert_eq!(
        s.escrow
            .try_submit_evidence(&id, &claim, &s.payer, &s.delivery(4)),
        Err(Ok(Error::EvidenceClosed))
    );
    s.escrow.rule(&id, &claim, &250, &after.revision);
    assert_eq!(s.token.balance(&s.seller), 250);
    assert_eq!(s.escrow.payment_state(&id).available, 600);
    assert_eq!(
        s.escrow.try_rule(&id, &claim, &400, &after.revision),
        Err(Ok(Error::AlreadySettled))
    );
}

#[test]
fn outsiders_cannot_create_cases_and_expired_claims_cannot_be_disputed() {
    let s = Setup::new();
    let id = s.fund();
    let claim = s.claim(&id, 400);
    assert_eq!(
        s.escrow.try_dispute(&id, &claim, &s.custom, &s.delivery(2)),
        Err(Ok(Error::NotParty))
    );
    s.warp(s.escrow.claim_state(&id, &claim).review_until);
    assert_eq!(
        s.escrow.try_dispute(&id, &claim, &s.payer, &s.delivery(2)),
        Err(Ok(Error::ReviewExpired))
    );
    s.escrow.settle(&id, &claim);
    assert_eq!(
        s.escrow.try_dispute(&id, &claim, &s.payer, &s.delivery(2)),
        Err(Ok(Error::AlreadySettled))
    );
}

#[test]
fn signed_policy_validates_default_deadlines_amounts_and_duplicate_funding() {
    let s = Setup::new();
    s.env.mock_all_auths();
    let mut terms = s.terms();
    terms.default_arbiter = s.custom.clone();
    assert_eq!(
        s.escrow.try_authorize(&terms),
        Err(Ok(Error::InvalidPolicy))
    );
    terms = s.terms();
    terms.fallback_seller_bps = 10_001;
    assert_eq!(
        s.escrow.try_authorize(&terms),
        Err(Ok(Error::InvalidPolicy))
    );
    terms = s.terms();
    terms.review_seconds = 0;
    assert_eq!(
        s.escrow.try_authorize(&terms),
        Err(Ok(Error::InvalidPolicy))
    );
    terms = s.terms();
    terms.delivery_deadline = u64::MAX;
    assert_eq!(
        s.escrow.try_authorize(&terms),
        Err(Ok(Error::InvalidPolicy))
    );
    let id = s.fund();
    assert_eq!(
        s.escrow.try_authorize(&s.terms()),
        Err(Ok(Error::AlreadyFunded))
    );
    assert_eq!(
        s.escrow.try_claim(&id, &0, &s.delivery(1)),
        Err(Ok(Error::InvalidAmount))
    );
    assert_eq!(
        s.escrow.try_claim(&id, &-1, &s.delivery(1)),
        Err(Ok(Error::InvalidAmount))
    );
    assert_eq!(s.escrow.try_reclaim(&id), Err(Ok(Error::SessionOpen)));
}

#[test]
fn funding_requires_buyer_and_seller_over_the_same_terms_and_transfer() {
    let s = Setup::new();
    s.env.mock_all_auths();
    let terms = s.terms();
    s.escrow.authorize(&terms);
    let args = vec![&s.env, terms.clone().into_val(&s.env)];
    let root = |subs| AuthorizedInvocation {
        function: AuthorizedFunction::Contract((
            s.escrow.address.clone(),
            Symbol::new(&s.env, "authorize"),
            args.clone(),
        )),
        sub_invocations: subs,
    };
    let transfer = AuthorizedInvocation {
        function: AuthorizedFunction::Contract((
            s.token.address.clone(),
            Symbol::new(&s.env, "transfer"),
            (s.payer.clone(), s.escrow.address.clone(), MAX).into_val(&s.env),
        )),
        sub_invocations: std::vec![],
    };
    let auths = s.env.auths();
    assert!(auths.contains(&(s.payer.clone(), root(std::vec![transfer]))));
    assert!(auths.contains(&(s.seller.clone(), root(std::vec![]))));
}

#[test]
fn funding_with_only_buyer_authorization_fails_without_moving_tokens() {
    let s = Setup::new();
    let terms = s.terms();
    s.env.mock_auths(&[MockAuth {
        address: &s.payer,
        invoke: &MockAuthInvoke {
            contract: &s.escrow.address,
            fn_name: "authorize",
            args: (terms.clone(),).into_val(&s.env),
            sub_invokes: &[MockAuthInvoke {
                contract: &s.token.address,
                fn_name: "transfer",
                args: (s.payer.clone(), s.escrow.address.clone(), MAX).into_val(&s.env),
                sub_invokes: &[],
            }],
        },
    }]);
    assert!(s.escrow.try_authorize(&terms).is_err());
    assert_eq!(s.token.balance(&s.payer), MAX * 10);
    assert_eq!(s.token.balance(&s.escrow.address), 0);
}

#[test]
fn ruling_requires_current_arbiter_but_neither_losing_party_nor_operator() {
    let s = Setup::new();
    let id = s.fund();
    let claim = s.claim(&id, 400);
    s.escrow.dispute(&id, &claim, &s.payer, &s.delivery(2));
    let c = s.escrow.claim_state(&id, &claim);
    s.warp(c.custom_until);
    let args = (id.clone(), claim, 250_i128, c.revision).into_val(&s.env);
    let invoke = MockAuthInvoke {
        contract: &s.escrow.address,
        fn_name: "rule",
        args,
        sub_invokes: &[],
    };
    s.env.mock_auths(&[MockAuth {
        address: &s.custom,
        invoke: &invoke,
    }]);
    assert!(s.escrow.try_rule(&id, &claim, &250, &c.revision).is_err());
    assert_eq!(s.token.balance(&s.seller), 0);
    s.env.mock_auths(&[MockAuth {
        address: &s.default,
        invoke: &invoke,
    }]);
    s.escrow.rule(&id, &claim, &250, &c.revision);
    assert_eq!(s.token.balance(&s.seller), 250);
    assert_eq!(s.token.balance(&s.payer), 9_150);
}

#[test]
fn seller_cannot_accept_and_buyer_cannot_invent_a_delivery_claim() {
    let s = Setup::new();
    let id = s.fund();
    let claim = s.claim(&id, 400);
    s.env.mock_auths(&[]);
    assert!(s.escrow.try_claim(&id, &100, &s.delivery(3)).is_err());
    assert!(s
        .escrow
        .try_accept(&id, &claim, &s.escrow.claim_state(&id, &claim).commitment)
        .is_err());
    assert!(s
        .escrow
        .try_dispute(&id, &claim, &s.payer, &s.delivery(3))
        .is_err());
    assert_eq!(s.escrow.payment_state(&id).reserved, 400);
}

#[test]
fn fallback_fraction_handles_maximum_i128_without_overflow() {
    let s = Setup::new();
    s.env.mock_all_auths();
    let admin = StellarAssetClient::new(&s.env, &s.token.address);
    admin.mint(&s.payer, &(i128::MAX - MAX * 10));
    let mut terms = s.terms();
    terms.max_amount = i128::MAX;
    let id = s.escrow.authorize(&terms);
    let claim = s.claim(&id, i128::MAX);
    s.escrow.dispute(&id, &claim, &s.seller, &s.delivery(2));
    s.warp(s.escrow.claim_state(&id, &claim).fallback_at);
    s.escrow.finalize_fallback(&id, &claim);
    let expected = i128::MAX / 10_000 * 2_500 + i128::MAX % 10_000 * 2_500 / 10_000;
    assert_eq!(s.token.balance(&s.seller), expected);
    assert_eq!(s.token.balance(&s.payer), i128::MAX - expected);
    assert_eq!(s.token.balance(&s.escrow.address), 0);
}

#[test]
fn unclaimed_void_and_claim_expiry_cannot_release_another_reservation() {
    let s = Setup::new();
    let id = s.fund();
    let claim = s.claim(&id, 400);
    s.escrow.void_unclaimed(&id);
    assert_eq!(s.token.balance(&s.payer), 9_600);
    assert_eq!(s.token.balance(&s.escrow.address), 400);
    s.warp(s.terms().delivery_deadline);
    assert_eq!(
        s.escrow.try_claim(&id, &1, &s.delivery(4)),
        Err(Ok(Error::SessionClosed))
    );
    s.escrow.settle(&id, &claim);
    assert_eq!(s.token.balance(&s.seller), 400);
}

#[test]
fn payment_identity_binds_service_agreement_policy_and_contract() {
    let s = Setup::new();
    let terms = s.terms();
    let id = s.escrow.payment_hash(&terms);
    let mut changed = terms.clone();
    changed.agreement = s.delivery(42);
    assert_ne!(s.escrow.payment_hash(&changed), id);
    changed = terms.clone();
    changed.fallback_seller_bps += 1;
    assert_ne!(s.escrow.payment_hash(&changed), id);
    changed = terms.clone();
    changed.review_seconds += 1;
    assert_ne!(s.escrow.payment_hash(&changed), id);
    changed = terms.clone();
    changed.buyer_arbiter = None;
    assert_ne!(s.escrow.payment_hash(&changed), id);
    let other = s.env.register(ProtectedEscrow, (&s.default,));
    assert_ne!(
        ProtectedEscrowClient::new(&s.env, &other).payment_hash(&terms),
        id
    );
    s.env.mock_all_auths();
    s.escrow.authorize(&terms);
    assert_eq!(s.escrow.payment_terms(&id), terms);
}

#[test]
fn claims_acceptance_and_reclaim_require_the_correct_party() {
    let s = Setup::new();
    let id = s.fund();
    let claim = s.claim(&id, 400);
    assert_eq!(s.env.auths().len(), 1);
    assert_eq!(s.env.auths()[0].0, s.seller);
    s.accept(&id, claim);
    assert_eq!(s.env.auths().len(), 1);
    assert_eq!(s.env.auths()[0].0, s.payer);
    s.warp(s.terms().delivery_deadline);
    s.env.mock_auths(&[]);
    assert!(s.escrow.try_reclaim(&id).is_err());
    assert_eq!(s.token.balance(&s.escrow.address), 600);
    s.env.mock_all_auths();
    s.escrow.reclaim(&id);
    assert_eq!(s.env.auths().len(), 1);
    assert_eq!(s.env.auths()[0].0, s.payer);
}

#[test]
fn invalid_ruling_rolls_back_and_cannot_allocate_other_claims() {
    let s = Setup::new();
    let id = s.fund();
    let first = s.claim(&id, 300);
    let second = s.claim(&id, 400);
    s.escrow.dispute(&id, &first, &s.payer, &s.delivery(2));
    let c = s.escrow.claim_state(&id, &first);
    s.warp(c.response_until);
    assert_eq!(
        s.escrow.try_rule(&id, &first, &301, &c.revision),
        Err(Ok(Error::InvalidAmount))
    );
    assert_eq!(
        s.escrow.try_rule(&id, &first, &-1, &c.revision),
        Err(Ok(Error::InvalidAmount))
    );
    assert_eq!(s.escrow.payment_state(&id).reserved, 700);
    assert_eq!(
        s.escrow.claim_state(&id, &first).status,
        ClaimStatus::Disputed
    );
    assert_eq!(s.token.balance(&s.seller), 0);
    s.escrow.rule(&id, &first, &100, &c.revision);
    assert_eq!(s.escrow.payment_state(&id).reserved, 400);
    s.escrow.settle(&id, &second);
    assert_eq!(s.token.balance(&s.seller), 500);
}

#[test]
fn mixed_operations_preserve_conservation_and_isolation_across_payments() {
    let s = Setup::new();
    s.env.mock_all_auths();
    let mut ids = std::vec::Vec::new();
    let mut claims = std::vec::Vec::new();
    for n in 1..=3_u8 {
        let mut terms = s.terms();
        terms.salt = s.delivery(n);
        let id = s.escrow.authorize(&terms);
        for amount in [150, 200, 250] {
            claims.push((id.clone(), s.claim(&id, amount)));
        }
        ids.push(id);
    }
    let mut random = 0x402_cafe_u64;
    for step in 0..180 {
        random = random
            .wrapping_mul(6_364_136_223_846_793_005)
            .wrapping_add(1);
        s.warp(NOW + step);
        let (id, claim_id) = &claims[(random as usize / 8) % claims.len()];
        let c = s.escrow.claim_state(id, claim_id);
        match random % 8 {
            0 => {
                let _ = s.escrow.try_accept(id, claim_id, &c.commitment);
            }
            1 => {
                let _ = s.escrow.try_dispute(id, claim_id, &s.payer, &s.delivery(8));
            }
            2 => {
                let _ = s
                    .escrow
                    .try_dispute(id, claim_id, &s.seller, &s.delivery(9));
            }
            3 => {
                let _ = s
                    .escrow
                    .try_submit_evidence(id, claim_id, &s.seller, &s.delivery(10));
            }
            4 => {
                let _ = s.escrow.try_settle(id, claim_id);
            }
            5 => {
                let _ = s.escrow.try_finalize_fallback(id, claim_id);
            }
            6 => {
                let _ = s
                    .escrow
                    .try_rule(id, claim_id, &(c.amount / 2), &c.revision);
            }
            _ => {
                let _ = s.escrow.try_reclaim(id);
                if s.escrow.payment_state(id).available >= 17 {
                    claims.push((id.clone(), s.claim(id, 17)));
                }
            }
        }
        let (mut held, mut paid, mut returned) = (0, 0, 0);
        for id in &ids {
            let p = s.escrow.payment_state(id);
            assert_eq!(
                p.available + p.reserved + p.paid_to_seller + p.returned_to_buyer,
                MAX
            );
            assert!(p.available >= 0 && p.reserved >= 0);
            held += p.available + p.reserved;
            paid += p.paid_to_seller;
            returned += p.returned_to_buyer;
        }
        assert_eq!(s.token.balance(&s.escrow.address), held);
        assert_eq!(s.token.balance(&s.seller), paid);
        assert_eq!(s.token.balance(&s.payer), MAX * 7 + returned);
    }
    s.warp(NOW + 5_000);
    for (id, claim_id) in &claims {
        match s.escrow.claim_state(id, claim_id).status {
            ClaimStatus::Review => s.escrow.settle(id, claim_id),
            ClaimStatus::Disputed => s.escrow.finalize_fallback(id, claim_id),
            ClaimStatus::Settled => {}
        }
    }
    for id in &ids {
        assert_eq!(s.escrow.payment_state(id).reserved, 0);
        s.escrow.reclaim(id);
    }
    assert_eq!(s.token.balance(&s.escrow.address), 0);
    assert_eq!(
        s.token.balance(&s.payer) + s.token.balance(&s.seller),
        MAX * 10
    );
}

#[test]
fn failed_second_transfer_rolls_back_split_award_and_claim_state() {
    let s = Setup::new();
    let id = s.fund();
    let claim_id = s.claim(&id, 400);
    s.escrow.dispute(&id, &claim_id, &s.payer, &s.delivery(2));
    let before_claim = s.escrow.claim_state(&id, &claim_id);
    let before_payment = s.escrow.payment_state(&id);
    s.warp(before_claim.response_until);
    let asset = StellarAssetClient::new(&s.env, &s.token.address);
    s.issuer.set_flag(IssuerFlags::RevocableFlag);
    asset.set_authorized(&s.payer, &false);
    assert!(s
        .escrow
        .try_rule(&id, &claim_id, &250, &before_claim.revision)
        .is_err());
    assert_eq!(s.token.balance(&s.seller), 0);
    assert_eq!(s.token.balance(&s.escrow.address), MAX);
    assert_eq!(s.escrow.payment_state(&id), before_payment);
    assert_eq!(s.escrow.claim_state(&id, &claim_id), before_claim);
    asset.set_authorized(&s.payer, &true);
    s.escrow.rule(&id, &claim_id, &250, &before_claim.revision);
    assert_eq!(s.token.balance(&s.seller), 250);
    assert_eq!(s.token.balance(&s.escrow.address), 600);
}

#[test]
fn review_expiry_settlement_requires_no_party_or_operator_authorization() {
    let s = Setup::new();
    let id = s.fund();
    let claim_id = s.claim(&id, 400);
    s.warp(s.escrow.claim_state(&id, &claim_id).review_until);
    s.env.mock_auths(&[]);
    s.escrow.settle(&id, &claim_id);
    assert!(s.env.auths().is_empty());
    assert_eq!(s.token.balance(&s.seller), 400);
}

#[test]
fn signed_fallback_endpoints_return_or_pay_the_entire_reservation() {
    for bps in [0, 10_000] {
        let s = Setup::new();
        s.env.mock_all_auths();
        let mut terms = s.terms();
        terms.fallback_seller_bps = bps;
        let id = s.escrow.authorize(&terms);
        let claim_id = s.claim(&id, 400);
        s.escrow.dispute(&id, &claim_id, &s.seller, &s.delivery(2));
        s.warp(s.escrow.claim_state(&id, &claim_id).fallback_at);
        s.env.mock_auths(&[]);
        s.escrow.finalize_fallback(&id, &claim_id);
        let paid = if bps == 0 { 0 } else { 400 };
        assert_eq!(s.token.balance(&s.seller), paid);
        assert_eq!(s.token.balance(&s.payer), 9_400 - paid);
        assert_eq!(s.escrow.payment_state(&id).reserved, 0);
    }
}

#[test]
fn javascript_codec_matches_rust_payment_identity() {
    use soroban_sdk::{xdr, xdr::ToXdr, Bytes, TryFromVal};
    let env = Env::default();
    let account = |byte| {
        Address::try_from_val(
            &env,
            &xdr::ScAddress::Account(xdr::AccountId(xdr::PublicKey::PublicKeyTypeEd25519(
                xdr::Uint256([byte; 32]),
            ))),
        )
        .unwrap()
    };
    let contract_address = |byte| {
        Address::try_from_val(
            &env,
            &xdr::ScAddress::Contract(xdr::ContractId(xdr::Hash([byte; 32]))),
        )
        .unwrap()
    };
    let network = Bytes::from_slice(&env, b"Test SDF Network ; September 2015");
    env.ledger()
        .with_mut(|ledger| ledger.network_id = env.crypto().sha256(&network).to_array());
    let escrow_address = contract_address(5);
    env.register_at(&escrow_address, ProtectedEscrow, (&account(4),));
    let terms = PaymentTerms {
        payer: account(1),
        seller: account(2),
        token: contract_address(6),
        agreement: BytesN::from_array(&env, &[8; 32]),
        max_amount: 100_000_000,
        fund_by: 1_800_000_060,
        delivery_deadline: 1_800_000_360,
        buyer_arbiter: Some(account(3)),
        seller_arbiter: Some(account(3)),
        default_arbiter: account(4),
        review_seconds: 120,
        response_seconds: 60,
        arbiter_seconds: 90,
        default_seconds: 90,
        fallback_seller_bps: 2500,
        salt: BytesN::from_array(&env, &[7; 32]),
    };
    let hex = |bytes: Bytes| {
        bytes
            .iter()
            .map(|b| std::format!("{b:02x}"))
            .collect::<std::string::String>()
    };
    let encoded = hex(terms.clone().to_xdr(&env));
    let payment_id = hex(ProtectedEscrowClient::new(&env, &escrow_address)
        .payment_hash(&terms)
        .into());
    assert_eq!(
        encoded,
        std::include_str!("../../../web/tests/fixtures/protected-encoding.json")
            .split("\"termsXdrHex\": \"")
            .nth(1)
            .unwrap()
            .split('"')
            .next()
            .unwrap()
    );
    assert_eq!(
        payment_id,
        "e8ba1ab8386807e8ddc2386cfa73740f89e3da19f437b3e6ea870bb4ce04738b"
    );
}
