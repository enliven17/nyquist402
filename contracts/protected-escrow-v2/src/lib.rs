#![no_std]

//! Versioned, fee-capable protected escrow. Every claim owns a reservation; reclaim
//! and early return can only spend unclaimed funds. No unrestricted capture or
//! charge entry point exists. Both parties authorize all funding terms.

mod events;
mod types;

use types::Payment;
pub use types::{Claim, ClaimStatus, Error, FeeQuote, PaymentState, PaymentTerms};

use soroban_sdk::{
    contract, contractimpl, contracttype, token::TokenClient, vec, xdr::ToXdr, Address, Bytes,
    BytesN, Env, IntoVal, Symbol,
};

#[cfg(test)]
mod test;

const BPS: i128 = 10_000;
const LEDGER_SECONDS: u64 = 5;
const TTL_BUFFER: u64 = 17_280;

#[contracttype]
enum Key {
    DefaultArbiter,
    Quote(BytesN<32>),
    Payment(BytesN<32>),
    Claim(BytesN<32>, u32),
}

#[contract]
pub struct ProtectedEscrow;

#[contractimpl]
impl ProtectedEscrow {
    /// A deployment has one immutable project default; each payment pins it.
    pub fn __constructor(env: Env, default_arbiter: Address) -> Result<(), Error> {
        if default_arbiter == env.current_contract_address() {
            return Err(Error::InvalidPolicy);
        }
        env.storage()
            .instance()
            .set(&Key::DefaultArbiter, &default_arbiter);
        Ok(())
    }

    pub fn version() -> u32 {
        2
    }

    pub fn quote_scope(env: Env, mut terms: PaymentTerms) -> BytesN<32> {
        terms.custom_quote = None;
        terms.default_quote = None;
        let mut bytes = Bytes::from_slice(&env, b"nyquist402:quote-scope:v2");
        bytes.append(&Bytes::from_array(
            &env,
            &env.ledger().network_id().to_array(),
        ));
        bytes.append(&env.current_contract_address().to_xdr(&env));
        bytes.append(&terms.to_xdr(&env));
        env.crypto().sha256(&bytes).into()
    }

    pub fn register_quote(env: Env, quote: FeeQuote) -> Result<BytesN<32>, Error> {
        quote.arbiter.require_auth();
        if quote.fee < 0 || quote.valid_until <= env.ledger().timestamp() {
            return Err(Error::InvalidQuote);
        }
        let id: BytesN<32> = env.crypto().sha256(&quote.clone().to_xdr(&env)).into();
        let key = Key::Quote(id.clone());
        env.storage().persistent().set(&key, &quote);
        extend(&env, &key, quote.valid_until);
        Ok(id)
    }

    pub fn fee_quote(env: Env, id: BytesN<32>) -> Result<FeeQuote, Error> {
        env.storage()
            .persistent()
            .get(&Key::Quote(id))
            .ok_or(Error::InvalidQuote)
    }

    pub fn default_arbiter(env: Env) -> Address {
        env.storage().instance().get(&Key::DefaultArbiter).unwrap()
    }

    pub fn payment_hash(env: Env, terms: PaymentTerms) -> BytesN<32> {
        let mut bytes = Bytes::from_slice(&env, b"nyquist402:protected:v2");
        bytes.append(&Bytes::from_array(
            &env,
            &env.ledger().network_id().to_array(),
        ));
        bytes.append(&env.current_contract_address().to_xdr(&env));
        bytes.append(&terms.to_xdr(&env));
        env.crypto().sha256(&bytes).into()
    }

    pub fn authorize(env: Env, terms: PaymentTerms) -> Result<BytesN<32>, Error> {
        let (arbiter, retain_until) = validate_terms(&env, &terms)?;
        terms
            .payer
            .require_auth_for_args(vec![&env, terms.clone().into_val(&env)]);
        terms.seller.require_auth();
        let id = Self::payment_hash(env.clone(), terms.clone());
        if env.storage().persistent().has(&Key::Payment(id.clone())) {
            return Err(Error::AlreadyFunded);
        }
        let p = Payment {
            state: PaymentState {
                available: terms.max_amount,
                reserved: 0,
                paid_to_seller: 0,
                returned_to_buyer: 0,
                next_claim_id: 0,
                protocol_available: terms.protocol_reserve,
                protocol_reserved: 0,
                protocol_paid: 0,
                protocol_returned: 0,
                arbitration_available: terms.arbitration_reserve,
                arbitration_reserved: 0,
                arbitration_paid: 0,
                arbitration_returned: 0,
            },
            terms: terms.clone(),
            arbiter: arbiter.clone(),
            retain_until,
        };
        save_payment(&env, &id, &p);
        let token = TokenClient::new(&env, &terms.token);
        let escrow = env.current_contract_address();
        let total = terms
            .max_amount
            .checked_add(terms.protocol_reserve)
            .and_then(|v| v.checked_add(terms.arbitration_reserve))
            .ok_or(Error::Overflow)?;
        let expected = token
            .balance(&escrow)
            .checked_add(total)
            .ok_or(Error::Overflow)?;
        token.transfer(&terms.payer, &escrow, &total);
        if token.balance(&escrow) != expected {
            return Err(Error::TokenCollectionFailed);
        }
        events::PaymentFunded {
            payment_id: id.clone(),
            terms,
            arbiter,
        }
        .publish(&env);
        Ok(id)
    }

    pub fn payment_terms(env: Env, payment_id: BytesN<32>) -> Result<PaymentTerms, Error> {
        Ok(load_payment(&env, &payment_id)?.terms)
    }

    pub fn payment_state(env: Env, payment_id: BytesN<32>) -> Result<PaymentState, Error> {
        Ok(load_payment(&env, &payment_id)?.state)
    }

    pub fn claim_state(env: Env, payment_id: BytesN<32>, claim_id: u32) -> Result<Claim, Error> {
        load_claim(&env, &payment_id, claim_id)
    }

    /// Reserve disjoint budget for a seller's immutable delivery claim.
    pub fn claim(
        env: Env,
        payment_id: BytesN<32>,
        amount: i128,
        delivery: BytesN<32>,
    ) -> Result<u32, Error> {
        let mut p = load_payment(&env, &payment_id)?;
        p.terms.seller.require_auth();
        if env.ledger().timestamp() >= p.terms.delivery_deadline {
            return Err(Error::SessionClosed);
        }
        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }
        if amount > p.state.available {
            return Err(Error::InsufficientAvailable);
        }
        let protocol_capacity = fraction(amount, p.terms.protocol_bps);
        let arbitration_capacity = if p.arbiter == p.terms.default_arbiter {
            p.terms.default_fee
        } else {
            p.terms.custom_fee.max(p.terms.default_fee)
        };
        if protocol_capacity > p.state.protocol_available
            || arbitration_capacity > p.state.arbitration_available
        {
            return Err(Error::InsufficientFeeCapacity);
        }
        p.state.protocol_available -= protocol_capacity;
        p.state.protocol_reserved = p
            .state
            .protocol_reserved
            .checked_add(protocol_capacity)
            .ok_or(Error::Overflow)?;
        p.state.arbitration_available -= arbitration_capacity;
        p.state.arbitration_reserved = p
            .state
            .arbitration_reserved
            .checked_add(arbitration_capacity)
            .ok_or(Error::Overflow)?;
        let claim_id = p.state.next_claim_id;
        p.state.next_claim_id = claim_id.checked_add(1).ok_or(Error::Overflow)?;
        p.state.available -= amount;
        p.state.reserved = p
            .state
            .reserved
            .checked_add(amount)
            .ok_or(Error::Overflow)?;
        let review_until = env
            .ledger()
            .timestamp()
            .checked_add(p.terms.review_seconds)
            .ok_or(Error::Overflow)?;
        let values: soroban_sdk::Vec<soroban_sdk::Val> = vec![
            &env,
            payment_id.clone().into_val(&env),
            claim_id.into_val(&env),
            amount.into_val(&env),
            delivery.clone().into_val(&env),
            review_until.into_val(&env),
        ];
        let commitment = env.crypto().sha256(&values.to_xdr(&env)).into();
        let claim = Claim {
            amount,
            delivery,
            commitment,
            review_until,
            status: ClaimStatus::Review,
            opened_by: None,
            buyer_evidence: None,
            seller_evidence: None,
            revision: 0,
            response_until: 0,
            custom_until: 0,
            fallback_at: 0,
            seller_award: 0,
            protocol_reserved: protocol_capacity,
            arbitration_reserved: arbitration_capacity,
            protocol_paid: 0,
            arbitration_paid: 0,
        };
        save_payment(&env, &payment_id, &p);
        save_claim(&env, &payment_id, claim_id, &claim, &p);
        events::ClaimRecorded {
            payment_id,
            claim_id,
            claim,
        }
        .publish(&env);
        Ok(claim_id)
    }

    pub fn accept(
        env: Env,
        payment_id: BytesN<32>,
        claim_id: u32,
        commitment: BytesN<32>,
    ) -> Result<(), Error> {
        let p = load_payment(&env, &payment_id)?;
        p.terms.payer.require_auth();
        let claim = load_claim(&env, &payment_id, claim_id)?;
        require_review(&claim)?;
        if claim.commitment != commitment {
            return Err(Error::StaleClaim);
        }
        let amount = claim.amount;
        finish_claim(&env, &payment_id, claim_id, p, claim, amount, "accept")
    }

    /// Permissionless review-expiry settlement; session expiry cannot replace it.
    pub fn settle(env: Env, payment_id: BytesN<32>, claim_id: u32) -> Result<(), Error> {
        let p = load_payment(&env, &payment_id)?;
        let claim = load_claim(&env, &payment_id, claim_id)?;
        require_review(&claim)?;
        if env.ledger().timestamp() < claim.review_until {
            return Err(Error::ReviewPending);
        }
        let amount = claim.amount;
        finish_claim(
            &env,
            &payment_id,
            claim_id,
            p,
            claim,
            amount,
            "review_expired",
        )
    }

    pub fn dispute(
        env: Env,
        payment_id: BytesN<32>,
        claim_id: u32,
        party: Address,
        evidence: BytesN<32>,
    ) -> Result<(), Error> {
        let p = load_payment(&env, &payment_id)?;
        require_party(&p, &party)?;
        let mut claim = load_claim(&env, &payment_id, claim_id)?;
        require_review(&claim)?;
        if env.ledger().timestamp() >= claim.review_until {
            return Err(Error::ReviewExpired);
        }
        let response_until = env
            .ledger()
            .timestamp()
            .checked_add(p.terms.response_seconds)
            .ok_or(Error::Overflow)?
            .max(claim.review_until);
        let custom_until = if p.arbiter == p.terms.default_arbiter {
            response_until
        } else {
            response_until
                .checked_add(p.terms.arbiter_seconds)
                .ok_or(Error::Overflow)?
        };
        claim.fallback_at = custom_until
            .checked_add(p.terms.default_seconds)
            .ok_or(Error::Overflow)?;
        claim.custom_until = custom_until;
        claim.response_until = response_until;
        claim.status = ClaimStatus::Disputed;
        claim.opened_by = Some(party.clone());
        record_evidence(&p, &mut claim, &party, evidence)?;
        save_claim(&env, &payment_id, claim_id, &claim, &p);
        events::CaseUpdated {
            payment_id,
            claim_id,
            claim,
        }
        .publish(&env);
        Ok(())
    }

    pub fn submit_evidence(
        env: Env,
        payment_id: BytesN<32>,
        claim_id: u32,
        party: Address,
        evidence: BytesN<32>,
    ) -> Result<(), Error> {
        let p = load_payment(&env, &payment_id)?;
        require_party(&p, &party)?;
        let mut claim = load_claim(&env, &payment_id, claim_id)?;
        require_disputed(&claim)?;
        if env.ledger().timestamp() >= claim.response_until {
            return Err(Error::EvidenceClosed);
        }
        record_evidence(&p, &mut claim, &party, evidence)?;
        save_claim(&env, &payment_id, claim_id, &claim, &p);
        events::CaseUpdated {
            payment_id,
            claim_id,
            claim,
        }
        .publish(&env);
        Ok(())
    }

    pub fn case_arbiter(
        env: Env,
        payment_id: BytesN<32>,
        claim_id: u32,
    ) -> Result<Option<Address>, Error> {
        let p = load_payment(&env, &payment_id)?;
        let claim = load_claim(&env, &payment_id, claim_id)?;
        Ok(active_arbiter(&env, &p, &claim))
    }

    pub fn rule(
        env: Env,
        payment_id: BytesN<32>,
        claim_id: u32,
        seller_amount: i128,
        expected_revision: u32,
    ) -> Result<(), Error> {
        let p = load_payment(&env, &payment_id)?;
        let claim = load_claim(&env, &payment_id, claim_id)?;
        require_disputed(&claim)?;
        if env.ledger().timestamp() < claim.response_until {
            return Err(Error::ResponsePending);
        }
        if claim.revision != expected_revision {
            return Err(Error::StaleClaim);
        }
        active_arbiter(&env, &p, &claim)
            .ok_or(Error::RulingExpired)?
            .require_auth();
        finish_claim(
            &env,
            &payment_id,
            claim_id,
            p,
            claim,
            seller_amount,
            "ruling",
        )
    }

    /// Deterministic, jointly signed allocation if all ruling windows expire.
    pub fn finalize_fallback(env: Env, payment_id: BytesN<32>, claim_id: u32) -> Result<(), Error> {
        let p = load_payment(&env, &payment_id)?;
        let claim = load_claim(&env, &payment_id, claim_id)?;
        require_disputed(&claim)?;
        if env.ledger().timestamp() < claim.fallback_at {
            return Err(Error::FallbackNotReady);
        }
        let bps = p.terms.fallback_seller_bps as i128;
        // Avoid amount * bps overflowing for otherwise valid i128 token amounts.
        let seller_amount = claim.amount / BPS * bps + claim.amount % BPS * bps / BPS;
        finish_claim(
            &env,
            &payment_id,
            claim_id,
            p,
            claim,
            seller_amount,
            "fallback",
        )
    }

    /// Only unclaimed funds expire with the session; reservations do not.
    pub fn reclaim(env: Env, payment_id: BytesN<32>) -> Result<(), Error> {
        let p = load_payment(&env, &payment_id)?;
        p.terms.payer.require_auth();
        if env.ledger().timestamp() < p.terms.delivery_deadline {
            return Err(Error::SessionOpen);
        }
        return_available(&env, &payment_id, p, "reclaim")
    }

    pub fn void_unclaimed(env: Env, payment_id: BytesN<32>) -> Result<(), Error> {
        let p = load_payment(&env, &payment_id)?;
        p.terms.seller.require_auth();
        return_available(&env, &payment_id, p, "void")
    }
}

fn validate_terms(env: &Env, t: &PaymentTerms) -> Result<(Address, u64), Error> {
    let escrow = env.current_contract_address();
    if t.max_amount <= 0
        || t.fund_by >= t.delivery_deadline
        || t.review_seconds == 0
        || t.response_seconds == 0
        || t.arbiter_seconds == 0
        || t.default_seconds == 0
        || t.fallback_seller_bps > BPS as u32
        || t.payer == t.seller
        || t.payer == escrow
        || t.seller == escrow
        || t.token == escrow
        || t.default_arbiter != ProtectedEscrow::default_arbiter(env.clone())
    {
        return Err(Error::InvalidPolicy);
    }
    if env.ledger().timestamp() >= t.fund_by {
        return Err(Error::FundingExpired);
    }
    let arbiter = match (&t.buyer_arbiter, &t.seller_arbiter) {
        (Some(buyer), Some(seller)) if buyer == seller => buyer.clone(),
        _ => t.default_arbiter.clone(),
    };
    if arbiter == escrow
        || arbiter == t.payer
        || arbiter == t.seller
        || t.default_arbiter == t.payer
        || t.default_arbiter == t.seller
    {
        return Err(Error::InvalidPolicy);
    }
    validate_fees(env, t, &arbiter)?;
    let retain_until = [
        t.review_seconds,
        t.response_seconds,
        t.arbiter_seconds,
        t.default_seconds,
    ]
    .into_iter()
    .try_fold(t.delivery_deadline, |time, duration| {
        time.checked_add(duration)
    })
    .ok_or(Error::InvalidPolicy)?;
    Ok((arbiter, retain_until))
}

fn require_party(p: &Payment, party: &Address) -> Result<(), Error> {
    if *party != p.terms.payer && *party != p.terms.seller {
        return Err(Error::NotParty);
    }
    party.require_auth();
    Ok(())
}

fn require_review(claim: &Claim) -> Result<(), Error> {
    match claim.status {
        ClaimStatus::Review => Ok(()),
        ClaimStatus::Disputed => Err(Error::DisputeActive),
        ClaimStatus::Settled => Err(Error::AlreadySettled),
    }
}

fn require_disputed(claim: &Claim) -> Result<(), Error> {
    match claim.status {
        ClaimStatus::Disputed => Ok(()),
        ClaimStatus::Review => Err(Error::NotDisputed),
        ClaimStatus::Settled => Err(Error::AlreadySettled),
    }
}

fn active_arbiter(env: &Env, p: &Payment, claim: &Claim) -> Option<Address> {
    if claim.status != ClaimStatus::Disputed || env.ledger().timestamp() >= claim.fallback_at {
        None
    } else if env.ledger().timestamp() < claim.custom_until {
        Some(p.arbiter.clone())
    } else {
        Some(p.terms.default_arbiter.clone())
    }
}

fn record_evidence(
    p: &Payment,
    claim: &mut Claim,
    party: &Address,
    evidence: BytesN<32>,
) -> Result<(), Error> {
    claim.revision = claim.revision.checked_add(1).ok_or(Error::Overflow)?;
    if *party == p.terms.payer {
        claim.buyer_evidence = Some(evidence);
    } else {
        claim.seller_evidence = Some(evidence);
    }
    Ok(())
}

/// All claim payout paths consume only that claim's reservation, exactly once.
fn finish_claim(
    env: &Env,
    id: &BytesN<32>,
    claim_id: u32,
    mut p: Payment,
    mut claim: Claim,
    seller_amount: i128,
    reason: &str,
) -> Result<(), Error> {
    if claim.status == ClaimStatus::Settled {
        return Err(Error::AlreadySettled);
    }
    if seller_amount < 0 || seller_amount > claim.amount {
        return Err(Error::InvalidAmount);
    }
    let buyer_amount = claim.amount - seller_amount;
    p.state.reserved = p
        .state
        .reserved
        .checked_sub(claim.amount)
        .filter(|x| *x >= 0)
        .ok_or(Error::InsufficientAvailable)?;
    p.state.paid_to_seller = p
        .state
        .paid_to_seller
        .checked_add(seller_amount)
        .ok_or(Error::Overflow)?;
    p.state.returned_to_buyer = p
        .state
        .returned_to_buyer
        .checked_add(buyer_amount)
        .ok_or(Error::Overflow)?;
    let protocol_fee = fraction(seller_amount, p.terms.protocol_bps);
    let ruling_arbiter = if reason == "ruling" {
        active_arbiter(env, &p, &claim)
    } else {
        None
    };
    let arbitration_fee = match &ruling_arbiter {
        Some(a) if *a == p.terms.default_arbiter => p.terms.default_fee,
        Some(_) => p.terms.custom_fee,
        None => 0,
    };
    if protocol_fee > claim.protocol_reserved || arbitration_fee > claim.arbitration_reserved {
        return Err(Error::InsufficientFeeCapacity);
    }
    p.state.protocol_reserved -= claim.protocol_reserved;
    p.state.arbitration_reserved -= claim.arbitration_reserved;
    let protocol_return = claim.protocol_reserved - protocol_fee;
    let arbitration_return = claim.arbitration_reserved - arbitration_fee;
    p.state.protocol_paid = p
        .state
        .protocol_paid
        .checked_add(protocol_fee)
        .ok_or(Error::Overflow)?;
    p.state.arbitration_paid = p
        .state
        .arbitration_paid
        .checked_add(arbitration_fee)
        .ok_or(Error::Overflow)?;
    p.state.protocol_returned = p
        .state
        .protocol_returned
        .checked_add(protocol_return)
        .ok_or(Error::Overflow)?;
    p.state.arbitration_returned = p
        .state
        .arbitration_returned
        .checked_add(arbitration_return)
        .ok_or(Error::Overflow)?;
    claim.protocol_paid = protocol_fee;
    claim.arbitration_paid = arbitration_fee;
    claim.status = ClaimStatus::Settled;
    claim.seller_award = seller_amount;
    save_payment(env, id, &p);
    save_claim(env, id, claim_id, &claim, &p);
    send(env, &p.terms.token, &p.terms.seller, seller_amount);
    send(env, &p.terms.token, &p.terms.payer, buyer_amount);
    send(
        env,
        &p.terms.token,
        &p.terms.protocol_recipient,
        protocol_fee,
    );
    if let Some(arbiter) = ruling_arbiter {
        send(env, &p.terms.token, &arbiter, arbitration_fee);
    }
    send(
        env,
        &p.terms.token,
        &p.terms.payer,
        protocol_return
            .checked_add(arbitration_return)
            .ok_or(Error::Overflow)?,
    );
    events::ClaimFinalized {
        payment_id: id.clone(),
        claim_id,
        seller_amount,
        buyer_amount,
        reason: Symbol::new(env, reason),
    }
    .publish(env);
    Ok(())
}

/// Reclaim and cancellation share this path: neither can spend reservations.
fn return_available(env: &Env, id: &BytesN<32>, mut p: Payment, reason: &str) -> Result<(), Error> {
    let amount = p.state.available;
    if amount == 0 && p.state.protocol_available == 0 && p.state.arbitration_available == 0 {
        return Err(if p.state.reserved > 0 {
            Error::FundsReserved
        } else {
            Error::NothingToReclaim
        });
    }
    let protocol_return = p.state.protocol_available;
    let arbitration_return = p.state.arbitration_available;
    p.state.protocol_available = 0;
    p.state.arbitration_available = 0;
    p.state.protocol_returned = p
        .state
        .protocol_returned
        .checked_add(protocol_return)
        .ok_or(Error::Overflow)?;
    p.state.arbitration_returned = p
        .state
        .arbitration_returned
        .checked_add(arbitration_return)
        .ok_or(Error::Overflow)?;
    p.state.available = 0;
    p.state.returned_to_buyer = p
        .state
        .returned_to_buyer
        .checked_add(amount)
        .ok_or(Error::Overflow)?;
    save_payment(env, id, &p);
    send(
        env,
        &p.terms.token,
        &p.terms.payer,
        amount
            .checked_add(protocol_return)
            .and_then(|v| v.checked_add(arbitration_return))
            .ok_or(Error::Overflow)?,
    );
    events::FundsReturned {
        payment_id: id.clone(),
        amount,
        reason: Symbol::new(env, reason),
    }
    .publish(env);
    Ok(())
}

fn send(env: &Env, token: &Address, recipient: &Address, amount: i128) {
    if amount > 0 {
        TokenClient::new(env, token).transfer(&env.current_contract_address(), recipient, &amount);
    }
}

fn load_payment(env: &Env, id: &BytesN<32>) -> Result<Payment, Error> {
    env.storage()
        .persistent()
        .get(&Key::Payment(id.clone()))
        .ok_or(Error::PaymentNotFound)
}

fn load_claim(env: &Env, id: &BytesN<32>, claim_id: u32) -> Result<Claim, Error> {
    env.storage()
        .persistent()
        .get(&Key::Claim(id.clone(), claim_id))
        .ok_or(Error::ClaimNotFound)
}

fn extend(env: &Env, key: &Key, retain_until: u64) {
    let remaining = retain_until.saturating_sub(env.ledger().timestamp());
    let ledgers =
        (remaining / LEDGER_SECONDS + TTL_BUFFER).min(env.storage().max_ttl() as u64) as u32;
    env.storage().persistent().extend_ttl(key, ledgers, ledgers);
}

fn save_payment(env: &Env, id: &BytesN<32>, p: &Payment) {
    let key = Key::Payment(id.clone());
    env.storage().persistent().set(&key, p);
    extend(env, &key, p.retain_until);
    let max = env.storage().max_ttl();
    env.storage().instance().extend_ttl(max, max);
}

fn save_claim(env: &Env, id: &BytesN<32>, claim_id: u32, claim: &Claim, p: &Payment) {
    let key = Key::Claim(id.clone(), claim_id);
    env.storage().persistent().set(&key, claim);
    extend(env, &key, p.retain_until);
}

fn fraction(amount: i128, bps: u32) -> i128 {
    let bps = i128::from(bps);
    amount / BPS * bps + amount % BPS * bps / BPS
}
fn validate_fees(env: &Env, t: &PaymentTerms, arbiter: &Address) -> Result<(), Error> {
    if t.protocol_reserve < 0
        || t.arbitration_reserve < 0
        || t.protocol_bps > 10_000
        || t.custom_fee < 0
        || t.default_fee < 0
        || t.case_fee_cap < 0
        || t.custom_fee > t.case_fee_cap
        || t.default_fee > t.case_fee_cap
        || t.protocol_recipient == env.current_contract_address()
        || t.protocol_reserve < fraction(t.max_amount, t.protocol_bps)
        || t.max_amount
            .checked_add(t.protocol_reserve)
            .and_then(|v| v.checked_add(t.arbitration_reserve))
            .is_none()
    {
        return Err(Error::InvalidPolicy);
    }
    let scope = ProtectedEscrow::quote_scope(env.clone(), t.clone());
    let check = |id: &Option<BytesN<32>>, expected: &Address, fee: i128| -> Result<(), Error> {
        if fee == 0 && id.is_none() {
            return Ok(());
        }
        let q = ProtectedEscrow::fee_quote(env.clone(), id.clone().ok_or(Error::InvalidQuote)?)?;
        if q.scope != scope
            || q.arbiter != *expected
            || q.fee != fee
            || q.valid_until < t.fund_by
            || q.valid_until <= env.ledger().timestamp()
        {
            return Err(Error::InvalidQuote);
        }
        Ok(())
    };
    check(&t.default_quote, &t.default_arbiter, t.default_fee)?;
    if *arbiter != t.default_arbiter {
        check(&t.custom_quote, arbiter, t.custom_fee)?;
    } else if t.custom_fee != 0 || t.custom_quote.is_some() {
        return Err(Error::InvalidPolicy);
    }
    Ok(())
}
