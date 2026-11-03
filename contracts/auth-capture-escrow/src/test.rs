extern crate std;

use soroban_sdk::{
    testutils::{
        Address as _, AuthorizedFunction, AuthorizedInvocation, Ledger, MockAuth, MockAuthInvoke,
    },
    token::{StellarAssetClient, TokenClient},
    vec, Address, BytesN, Env, IntoVal, Symbol,
};

use crate::{AuthCaptureEscrow, AuthCaptureEscrowClient, Error, PaymentInfo, PaymentState};

const NOW: u64 = 1_800_000_000;
const MAX: i128 = 1_000;

struct Setup {
    env: Env,
    escrow: AuthCaptureEscrowClient<'static>,
    token: TokenClient<'static>,
    operator: Address,
    payer: Address,
    receiver: Address,
    authorizer: Address,
    fee_receiver: Address,
}

impl Setup {
    fn new() -> Self {
        let env = Env::default();
        env.ledger().set_timestamp(NOW);
        let admin = Address::generate(&env);
        let token_address = env.register_stellar_asset_contract_v2(admin).address();
        let payer = Address::generate(&env);
        StellarAssetClient::new(&env, &token_address)
            .mock_all_auths()
            .mint(&payer, &(MAX * 10));
        let escrow_address = env.register(AuthCaptureEscrow, ());
        Setup {
            escrow: AuthCaptureEscrowClient::new(&env, &escrow_address),
            token: TokenClient::new(&env, &token_address),
            operator: Address::generate(&env),
            receiver: Address::generate(&env),
            authorizer: Address::generate(&env),
            fee_receiver: Address::generate(&env),
            payer,
            env,
        }
    }

    fn info(&self) -> PaymentInfo {
        PaymentInfo {
            operator: self.operator.clone(),
            payer: self.payer.clone(),
            receiver: self.receiver.clone(),
            receiver_authorizer: Some(self.authorizer.clone()),
            token: self.token.address.clone(),
            max_amount: MAX,
            pre_approval_expiry: NOW + 60,
            authorization_expiry: NOW + 3_600,
            refund_expiry: NOW + 86_400,
            min_fee_bps: 100,
            max_fee_bps: 100,
            fee_receiver: Some(self.fee_receiver.clone()),
            salt: BytesN::from_array(&self.env, &[7; 32]),
        }
    }

    fn balance(&self, a: &Address) -> i128 {
        self.token.balance(a)
    }

    fn state(&self, info: &PaymentInfo) -> PaymentState {
        self.escrow.payment_state(&self.escrow.payment_hash(info))
    }

    fn authorize(&self, info: &PaymentInfo) {
        self.env.mock_all_auths();
        self.escrow.authorize(info);
    }

    fn warp(&self, t: u64) {
        self.env.ledger().set_timestamp(t);
    }
}

fn invocation(
    env: &Env,
    contract: &Address,
    name: &str,
    args: soroban_sdk::Vec<soroban_sdk::Val>,
    subs: std::vec::Vec<AuthorizedInvocation>,
) -> AuthorizedInvocation {
    AuthorizedInvocation {
        function: AuthorizedFunction::Contract((contract.clone(), Symbol::new(env, name), args)),
        sub_invocations: subs,
    }
}

// Lifecycle

#[test]
fn authorize_holds_max_amount() {
    let s = Setup::new();
    let info = s.info();
    s.authorize(&info);
    assert_eq!(s.balance(&s.escrow.address), MAX);
    assert_eq!(s.balance(&s.payer), MAX * 9);
    assert_eq!(
        s.state(&info),
        PaymentState {
            collected: true,
            capturable: MAX,
            refundable: 0
        }
    );
}

#[test]
fn partial_captures_then_void() {
    let s = Setup::new();
    let info = s.info();
    s.authorize(&info);
    let fee = Some(s.fee_receiver.clone());

    s.escrow.capture(&info, &300, &3, &fee, &false);
    s.escrow.capture(&info, &200, &2, &fee, &false);
    assert_eq!(s.balance(&s.receiver), 495);
    assert_eq!(s.balance(&s.fee_receiver), 5);
    assert_eq!(
        s.state(&info),
        PaymentState {
            collected: true,
            capturable: 500,
            refundable: 500
        }
    );

    s.escrow.void(&info);
    assert_eq!(s.balance(&s.payer), MAX * 9 + 500);
    assert_eq!(s.balance(&s.escrow.address), 0);
    assert_eq!(s.escrow.try_void(&info), Err(Ok(Error::ZeroAuthorization)));
}

#[test]
fn capture_with_void_remainder_settles_in_one_call() {
    let s = Setup::new();
    let info = s.info();
    s.authorize(&info);
    s.escrow
        .capture(&info, &600, &6, &Some(s.fee_receiver.clone()), &true);
    assert_eq!(s.balance(&s.receiver), 594);
    assert_eq!(s.balance(&s.payer), MAX * 9 + 400);
    assert_eq!(s.balance(&s.escrow.address), 0);
    assert_eq!(
        s.state(&info),
        PaymentState {
            collected: true,
            capturable: 0,
            refundable: 600
        }
    );
}

#[test]
fn capture_cannot_exceed_hold() {
    let s = Setup::new();
    let info = s.info();
    s.authorize(&info);
    let fee = Some(s.fee_receiver.clone());
    s.escrow.capture(&info, &900, &9, &fee, &false);
    assert_eq!(
        s.escrow.try_capture(&info, &200, &2, &fee, &false),
        Err(Ok(Error::InsufficientAuthorization))
    );
}

#[test]
fn capture_fails_after_deadline_and_reclaim_opens() {
    let s = Setup::new();
    let info = s.info();
    s.authorize(&info);
    assert_eq!(
        s.escrow.try_reclaim(&info),
        Err(Ok(Error::BeforeAuthorizationExpiry))
    );

    s.warp(info.authorization_expiry);
    let fee = Some(s.fee_receiver.clone());
    assert_eq!(
        s.escrow.try_capture(&info, &100, &1, &fee, &false),
        Err(Ok(Error::AfterAuthorizationExpiry))
    );

    s.escrow.reclaim(&info);
    assert_eq!(s.balance(&s.payer), MAX * 10);
    assert_eq!(
        s.escrow.try_reclaim(&info),
        Err(Ok(Error::ZeroAuthorization))
    );
}

#[test]
fn charge_pays_amount_and_returns_unused() {
    let s = Setup::new();
    let info = s.info();
    s.env.mock_all_auths();
    s.escrow
        .charge(&info, &750, &7, &Some(s.fee_receiver.clone()));
    assert_eq!(s.balance(&s.payer), MAX * 10 - 750);
    assert_eq!(s.balance(&s.receiver), 743);
    assert_eq!(s.balance(&s.fee_receiver), 7);
    assert_eq!(s.balance(&s.escrow.address), 0);
    assert_eq!(
        s.state(&info),
        PaymentState {
            collected: true,
            capturable: 0,
            refundable: 750
        }
    );
}

#[test]
fn refund_from_receiver_and_bounds() {
    let s = Setup::new();
    let mut info = s.info();
    info.receiver_authorizer = None;
    s.authorize(&info);
    s.escrow
        .capture(&info, &500, &5, &Some(s.fee_receiver.clone()), &true);

    s.escrow.refund(&info, &200, &s.receiver);
    assert_eq!(s.balance(&s.payer), MAX * 9 + 500 + 200);
    assert_eq!(s.state(&info).refundable, 300);
    assert_eq!(
        s.escrow.try_refund(&info, &301, &s.receiver),
        Err(Ok(Error::RefundExceedsCapture))
    );

    s.warp(info.refund_expiry);
    assert_eq!(
        s.escrow.try_refund(&info, &100, &s.receiver),
        Err(Ok(Error::AfterRefundExpiry))
    );
}

#[test]
fn second_collect_is_rejected() {
    let s = Setup::new();
    let info = s.info();
    s.authorize(&info);
    assert_eq!(
        s.escrow.try_authorize(&info),
        Err(Ok(Error::AlreadyCollected))
    );
    assert_eq!(
        s.escrow
            .try_charge(&info, &100, &1, &Some(s.fee_receiver.clone())),
        Err(Ok(Error::AlreadyCollected))
    );
}

// Validation

#[test]
fn collect_validation() {
    let s = Setup::new();
    s.env.mock_all_auths();

    let mut info = s.info();
    info.authorization_expiry = info.refund_expiry + 1;
    assert_eq!(
        s.escrow.try_authorize(&info),
        Err(Ok(Error::InvalidExpiries))
    );

    let mut info = s.info();
    info.max_fee_bps = 10_001;
    assert_eq!(
        s.escrow.try_authorize(&info),
        Err(Ok(Error::FeeBpsOverflow))
    );

    let mut info = s.info();
    info.min_fee_bps = 200;
    assert_eq!(
        s.escrow.try_authorize(&info),
        Err(Ok(Error::InvalidFeeBpsRange))
    );

    let mut info = s.info();
    info.fee_receiver = None;
    assert_eq!(
        s.escrow.try_authorize(&info),
        Err(Ok(Error::MissingFeeReceiver))
    );

    let mut info = s.info();
    info.max_amount = 0;
    assert_eq!(s.escrow.try_authorize(&info), Err(Ok(Error::ZeroAmount)));

    let info = s.info();
    s.warp(info.pre_approval_expiry);
    assert_eq!(
        s.escrow.try_authorize(&info),
        Err(Ok(Error::AfterPreApprovalExpiry))
    );
}

#[test]
fn fee_validation() {
    let s = Setup::new();
    let info = s.info();
    s.authorize(&info);
    let fee = Some(s.fee_receiver.clone());
    assert_eq!(
        s.escrow.try_capture(&info, &500, &4, &fee, &false),
        Err(Ok(Error::FeeAmountOutOfRange))
    );
    assert_eq!(
        s.escrow.try_capture(&info, &500, &6, &fee, &false),
        Err(Ok(Error::FeeAmountOutOfRange))
    );
    let other = Some(Address::generate(&s.env));
    assert_eq!(
        s.escrow.try_capture(&info, &500, &5, &other, &false),
        Err(Ok(Error::InvalidFeeReceiver))
    );
    assert_eq!(
        s.escrow.try_capture(&info, &0, &0, &fee, &false),
        Err(Ok(Error::ZeroAmount))
    );
}

#[test]
fn payment_hash_depends_on_every_field() {
    let s = Setup::new();
    let info = s.info();
    let mut other = s.info();
    other.salt = BytesN::from_array(&s.env, &[8; 32]);
    assert_eq!(s.escrow.payment_hash(&info), s.escrow.payment_hash(&info));
    assert_ne!(s.escrow.payment_hash(&info), s.escrow.payment_hash(&other));
    let mut other = s.info();
    other.receiver_authorizer = None;
    assert_ne!(s.escrow.payment_hash(&info), s.escrow.payment_hash(&other));
}

// Authorization trees. These are the shapes clients and servers sign.

#[test]
fn payer_signs_payment_info_with_transfer_sub_invocation() {
    let s = Setup::new();
    let info = s.info();
    s.authorize(&info);

    let expected = invocation(
        &s.env,
        &s.escrow.address,
        "authorize",
        vec![&s.env, info.clone().into_val(&s.env)],
        std::vec![invocation(
            &s.env,
            &s.token.address,
            "transfer",
            (s.payer.clone(), s.escrow.address.clone(), MAX).into_val(&s.env),
            std::vec![],
        )],
    );
    let auths = s.env.auths();
    assert!(auths.contains(&(s.payer.clone(), expected)));
    assert!(auths.iter().any(|(a, _)| *a == s.operator));
    assert_eq!(auths.len(), 2);
}

#[test]
fn charge_payer_entry_does_not_cover_amount() {
    let s = Setup::new();
    let info = s.info();
    s.env.mock_all_auths();
    let fee = Some(s.fee_receiver.clone());
    s.escrow.charge(&info, &750, &7, &fee);

    let payer_entry = invocation(
        &s.env,
        &s.escrow.address,
        "charge",
        vec![&s.env, info.clone().into_val(&s.env)],
        std::vec![invocation(
            &s.env,
            &s.token.address,
            "transfer",
            (s.payer.clone(), s.escrow.address.clone(), MAX).into_val(&s.env),
            std::vec![],
        )],
    );
    let consent_entry = invocation(
        &s.env,
        &s.escrow.address,
        "charge",
        (info.clone(), 750_i128, 7_i128, fee.clone()).into_val(&s.env),
        std::vec![],
    );
    let auths = s.env.auths();
    assert!(auths.contains(&(s.payer.clone(), payer_entry)));
    assert!(auths.contains(&(s.authorizer.clone(), consent_entry)));
}

#[test]
fn consent_entry_covers_exact_capture_args() {
    let s = Setup::new();
    let info = s.info();
    s.authorize(&info);
    let fee = Some(s.fee_receiver.clone());
    s.escrow.capture(&info, &600, &6, &fee, &true);

    let expected = invocation(
        &s.env,
        &s.escrow.address,
        "capture",
        (info.clone(), 600_i128, 6_i128, fee, true).into_val(&s.env),
        std::vec![],
    );
    assert!(s.env.auths().contains(&(s.authorizer.clone(), expected)));
}

#[test]
fn capture_without_consent_fails() {
    let s = Setup::new();
    let info = s.info();
    s.authorize(&info);
    let fee = Some(s.fee_receiver.clone());
    let args = (info.clone(), 600_i128, 6_i128, fee.clone(), false).into_val(&s.env);
    s.env.mock_auths(&[MockAuth {
        address: &s.operator,
        invoke: &MockAuthInvoke {
            contract: &s.escrow.address,
            fn_name: "capture",
            args,
            sub_invokes: &[],
        },
    }]);
    assert!(s.escrow.try_capture(&info, &600, &6, &fee, &false).is_err());
    assert_eq!(s.state(&info).capturable, MAX);
}

#[test]
fn consent_for_other_amount_fails() {
    let s = Setup::new();
    let info = s.info();
    s.authorize(&info);
    let fee = Some(s.fee_receiver.clone());
    let signed = (info.clone(), 100_i128, 1_i128, fee.clone(), false).into_val(&s.env);
    let submitted = (info.clone(), 900_i128, 9_i128, fee.clone(), false).into_val(&s.env);
    s.env.mock_auths(&[
        MockAuth {
            address: &s.operator,
            invoke: &MockAuthInvoke {
                contract: &s.escrow.address,
                fn_name: "capture",
                args: submitted,
                sub_invokes: &[],
            },
        },
        MockAuth {
            address: &s.authorizer,
            invoke: &MockAuthInvoke {
                contract: &s.escrow.address,
                fn_name: "capture",
                args: signed,
                sub_invokes: &[],
            },
        },
    ]);
    assert!(s.escrow.try_capture(&info, &900, &9, &fee, &false).is_err());
}

#[test]
fn separate_funder_signs_refund_rooted_entry() {
    let s = Setup::new();
    let info = s.info();
    s.authorize(&info);
    s.escrow
        .capture(&info, &500, &5, &Some(s.fee_receiver.clone()), &true);

    let funder = Address::generate(&s.env);
    StellarAssetClient::new(&s.env, &s.token.address).mint(&funder, &100);
    s.escrow.refund(&info, &100, &funder);

    let funder_entry = invocation(
        &s.env,
        &s.escrow.address,
        "refund",
        (info.clone(), 100_i128, funder.clone()).into_val(&s.env),
        std::vec![invocation(
            &s.env,
            &s.token.address,
            "transfer",
            (funder.clone(), s.payer.clone(), 100_i128).into_val(&s.env),
            std::vec![],
        )],
    );
    let consent_entry = invocation(
        &s.env,
        &s.escrow.address,
        "refund",
        (info.clone(), 100_i128, funder.clone()).into_val(&s.env),
        std::vec![],
    );
    let auths = s.env.auths();
    assert!(auths.contains(&(funder.clone(), funder_entry)));
    assert!(auths.contains(&(s.authorizer.clone(), consent_entry)));
    assert_eq!(s.balance(&funder), 0);
}

#[test]
fn receiver_as_funder_uses_one_entry() {
    let s = Setup::new();
    let mut info = s.info();
    info.receiver_authorizer = None;
    s.authorize(&info);
    s.escrow
        .capture(&info, &500, &5, &Some(s.fee_receiver.clone()), &true);
    s.escrow.refund(&info, &100, &s.receiver);

    let expected = invocation(
        &s.env,
        &s.escrow.address,
        "refund",
        (info.clone(), 100_i128, s.receiver.clone()).into_val(&s.env),
        std::vec![invocation(
            &s.env,
            &s.token.address,
            "transfer",
            (s.receiver.clone(), s.payer.clone(), 100_i128).into_val(&s.env),
            std::vec![],
        )],
    );
    assert!(s.env.auths().contains(&(s.receiver.clone(), expected)));
}

#[test]
fn operator_cannot_be_consent_address() {
    let s = Setup::new();
    s.env.mock_all_auths();
    let mut info = s.info();
    info.receiver_authorizer = Some(s.operator.clone());
    assert_eq!(
        s.escrow.try_authorize(&info),
        Err(Ok(Error::InvalidConsentAddress))
    );
    let mut info = s.info();
    info.receiver_authorizer = None;
    info.receiver = s.operator.clone();
    assert_eq!(
        s.escrow.try_authorize(&info),
        Err(Ok(Error::InvalidConsentAddress))
    );
}

#[test]
fn escrow_cannot_be_a_party() {
    let s = Setup::new();
    s.env.mock_all_auths();
    let mut info = s.info();
    info.receiver = s.escrow.address.clone();
    assert_eq!(s.escrow.try_authorize(&info), Err(Ok(Error::InvalidParty)));
    let mut info = s.info();
    info.fee_receiver = Some(s.escrow.address.clone());
    assert_eq!(s.escrow.try_authorize(&info), Err(Ok(Error::InvalidParty)));
}

#[test]
fn refund_rejects_operator_or_escrow_as_funder() {
    let s = Setup::new();
    let info = s.info();
    s.authorize(&info);
    s.escrow
        .capture(&info, &500, &5, &Some(s.fee_receiver.clone()), &true);
    assert_eq!(
        s.escrow.try_refund(&info, &100, &s.operator),
        Err(Ok(Error::InvalidFunder))
    );
    assert_eq!(
        s.escrow.try_refund(&info, &100, &s.escrow.address),
        Err(Ok(Error::InvalidFunder))
    );
}

#[test]
fn reclaim_requires_payer() {
    let s = Setup::new();
    let info = s.info();
    s.authorize(&info);
    s.warp(info.authorization_expiry);
    s.env.mock_auths(&[MockAuth {
        address: &s.operator,
        invoke: &MockAuthInvoke {
            contract: &s.escrow.address,
            fn_name: "reclaim",
            args: vec![&s.env, info.clone().into_val(&s.env)],
            sub_invokes: &[],
        },
    }]);
    assert!(s.escrow.try_reclaim(&info).is_err());
}

// Invariants

#[test]
fn escrow_balance_matches_total_capturable() {
    let s = Setup::new();
    let a = s.info();
    let mut b = s.info();
    b.salt = BytesN::from_array(&s.env, &[9; 32]);
    s.authorize(&a);
    s.authorize(&b);
    let fee = Some(s.fee_receiver.clone());

    s.escrow.capture(&a, &400, &4, &fee, &false);
    s.escrow.void(&b);
    s.escrow.capture(&a, &100, &1, &fee, &false);

    let held = s.state(&a).capturable + s.state(&b).capturable;
    assert_eq!(s.balance(&s.escrow.address), held);
    assert_eq!(held, 500);
}

/// Random sequences of operations across several payments. After every step the escrow
/// balance equals the sum of holds, and no payment pays out more than it collected.
#[test]
fn random_operations_preserve_invariants() {
    let s = Setup::new();
    s.env.mock_all_auths();
    let fee = Some(s.fee_receiver.clone());
    let infos: std::vec::Vec<PaymentInfo> = (0..4u8)
        .map(|i| {
            let mut info = s.info();
            info.salt = BytesN::from_array(&s.env, &[i; 32]);
            s.escrow.authorize(&info);
            info
        })
        .collect();
    StellarAssetClient::new(&s.env, &s.token.address).mint(&s.receiver, &(MAX * 10));

    let mut seed: u64 = 0x9e3779b97f4a7c15;
    let mut next = |n: u64| {
        seed = seed
            .wrapping_mul(6364136223846793005)
            .wrapping_add(1442695040888963407);
        (seed >> 33) % n
    };
    for _ in 0..300 {
        let info = &infos[next(4) as usize];
        let amount = next(400) as i128 + 1;
        let fee_amount = amount / 100;
        match next(4) {
            0 => {
                let _ = s
                    .escrow
                    .try_capture(info, &amount, &fee_amount, &fee, &(next(5) == 0));
            }
            1 => {
                let _ = s.escrow.try_refund(info, &amount, &s.receiver);
            }
            2 if next(10) == 0 => {
                let _ = s.escrow.try_void(info);
            }
            _ => {}
        }
        let held: i128 = infos.iter().map(|i| s.state(i).capturable).sum();
        assert_eq!(s.balance(&s.escrow.address), held);
        for i in &infos {
            let st = s.state(i);
            assert!(st.capturable >= 0 && st.refundable >= 0);
            assert!(st.capturable + st.refundable <= MAX);
        }
    }
}
