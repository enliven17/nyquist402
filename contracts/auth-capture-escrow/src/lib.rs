#![no_std]

//! Escrow for the x402 `auth-capture` scheme on Stellar.
//!
//! Lifecycle: `authorize` places a hold, `capture` pays it out, `void` releases it,
//! `refund` returns captured funds, and `reclaim` lets the payer recover a hold
//! after the capture deadline. `charge` collects and pays out in one step.
//!
//! Authorization:
//! - `operator` (the facilitator) authorizes every call except `reclaim`.
//! - `payer` authorizes `authorize` and `charge` for args `[payment_info]`, with the
//!   token transfer into the escrow as a sub-invocation.
//! - The consent address (`receiver_authorizer`, or `receiver` when unset) authorizes
//!   `charge`, `capture`, `void` and `refund` for the exact call arguments.

mod events;
mod types;

#[cfg(test)]
mod test;

pub use types::{Error, PaymentInfo, PaymentState};

use soroban_sdk::{
    contract, contractimpl, contracttype, token::TokenClient, vec, xdr::ToXdr, Address, Bytes,
    BytesN, Env, IntoVal,
};

const MAX_FEE_BPS: i128 = 10_000;
/// Conservative ledger close time used to convert a deadline into a TTL.
const LEDGER_SECONDS: u64 = 5;
/// Extra TTL kept beyond the refund deadline (about one day).
const TTL_BUFFER_LEDGERS: u64 = 17_280;

#[contracttype]
enum DataKey {
    Payment(BytesN<32>),
}

#[contract]
pub struct AuthCaptureEscrow;

#[contractimpl]
impl AuthCaptureEscrow {
    /// Moves `max_amount` from the payer into escrow as a capturable hold.
    pub fn authorize(env: Env, payment_info: PaymentInfo) -> Result<BytesN<32>, Error> {
        payment_info.operator.require_auth();
        require_payer_auth(&env, &payment_info);
        validate_payment(&env, &payment_info)?;

        let hash = Self::payment_hash(env.clone(), payment_info.clone());
        ensure_not_collected(&env, &hash)?;
        let amount = payment_info.max_amount;
        save_state(
            &env,
            &hash,
            &payment_info,
            &PaymentState {
                collected: true,
                capturable: amount,
                refundable: 0,
            },
        );
        events::authorized(&env, &hash, &payment_info, amount);

        collect(&env, &payment_info);
        Ok(hash)
    }

    /// Collects `max_amount`, pays out `amount`, and returns the rest to the payer.
    pub fn charge(
        env: Env,
        payment_info: PaymentInfo,
        amount: i128,
        fee_amount: i128,
        fee_receiver: Option<Address>,
    ) -> Result<BytesN<32>, Error> {
        payment_info.operator.require_auth();
        require_payer_auth(&env, &payment_info);
        require_consent(&payment_info);
        validate_payment(&env, &payment_info)?;
        validate_amount(amount, payment_info.max_amount)?;
        validate_fee(&payment_info, amount, fee_amount, &fee_receiver)?;

        let hash = Self::payment_hash(env.clone(), payment_info.clone());
        ensure_not_collected(&env, &hash)?;
        save_state(
            &env,
            &hash,
            &payment_info,
            &PaymentState {
                collected: true,
                capturable: 0,
                refundable: amount,
            },
        );
        events::charged(
            &env,
            &hash,
            &payment_info,
            amount,
            fee_amount,
            &fee_receiver,
        );

        collect(&env, &payment_info);
        distribute(&env, &payment_info, amount, fee_amount, &fee_receiver);
        let unused = payment_info.max_amount - amount;
        if unused > 0 {
            send(&env, &payment_info.token, &payment_info.payer, unused);
        }
        Ok(hash)
    }

    /// Pays `amount` from the hold to the receiver. With `void_remainder`, also returns
    /// the rest of the hold to the payer.
    pub fn capture(
        env: Env,
        payment_info: PaymentInfo,
        amount: i128,
        fee_amount: i128,
        fee_receiver: Option<Address>,
        void_remainder: bool,
    ) -> Result<(), Error> {
        payment_info.operator.require_auth();
        require_consent(&payment_info);
        validate_amount(amount, i128::MAX)?;
        validate_fee(&payment_info, amount, fee_amount, &fee_receiver)?;
        if env.ledger().timestamp() >= payment_info.authorization_expiry {
            return Err(Error::AfterAuthorizationExpiry);
        }

        let hash = Self::payment_hash(env.clone(), payment_info.clone());
        let mut state = load_state(&env, &hash);
        if state.capturable < amount {
            return Err(Error::InsufficientAuthorization);
        }
        state.capturable -= amount;
        state.refundable += amount;
        let remainder = if void_remainder {
            core::mem::take(&mut state.capturable)
        } else {
            0
        };
        save_state(&env, &hash, &payment_info, &state);
        events::captured(&env, &hash, amount, fee_amount, &fee_receiver);
        if remainder > 0 {
            events::voided(&env, &hash, remainder);
        }

        distribute(&env, &payment_info, amount, fee_amount, &fee_receiver);
        if remainder > 0 {
            send(&env, &payment_info.token, &payment_info.payer, remainder);
        }
        Ok(())
    }

    /// Returns the whole remaining hold to the payer.
    pub fn void(env: Env, payment_info: PaymentInfo) -> Result<(), Error> {
        payment_info.operator.require_auth();
        require_consent(&payment_info);

        let hash = Self::payment_hash(env.clone(), payment_info.clone());
        let amount = release_hold(&env, &hash, &payment_info)?;
        events::voided(&env, &hash, amount);
        send(&env, &payment_info.token, &payment_info.payer, amount);
        Ok(())
    }

    /// Lets the payer recover the remaining hold once the capture deadline has passed.
    pub fn reclaim(env: Env, payment_info: PaymentInfo) -> Result<(), Error> {
        payment_info.payer.require_auth();
        if env.ledger().timestamp() < payment_info.authorization_expiry {
            return Err(Error::BeforeAuthorizationExpiry);
        }

        let hash = Self::payment_hash(env.clone(), payment_info.clone());
        let amount = release_hold(&env, &hash, &payment_info)?;
        events::reclaimed(&env, &hash, amount);
        send(&env, &payment_info.token, &payment_info.payer, amount);
        Ok(())
    }

    /// Transfers `amount` from `funder` to the payer and reduces the refundable balance.
    pub fn refund(
        env: Env,
        payment_info: PaymentInfo,
        amount: i128,
        funder: Address,
    ) -> Result<(), Error> {
        payment_info.operator.require_auth();
        let consent = require_consent(&payment_info);
        if funder != consent && funder != payment_info.operator {
            funder.require_auth();
        }
        validate_amount(amount, i128::MAX)?;
        if env.ledger().timestamp() >= payment_info.refund_expiry {
            return Err(Error::AfterRefundExpiry);
        }

        let hash = Self::payment_hash(env.clone(), payment_info.clone());
        let mut state = load_state(&env, &hash);
        if state.refundable < amount {
            return Err(Error::RefundExceedsCapture);
        }
        state.refundable -= amount;
        save_state(&env, &hash, &payment_info, &state);
        events::refunded(&env, &hash, amount, &funder);

        TokenClient::new(&env, &payment_info.token).transfer(&funder, &payment_info.payer, &amount);
        Ok(())
    }

    /// Canonical payment identifier: sha256(network_id || xdr(escrow) || xdr(payment_info)).
    pub fn payment_hash(env: Env, payment_info: PaymentInfo) -> BytesN<32> {
        let mut preimage = Bytes::from_array(&env, &env.ledger().network_id().to_array());
        preimage.append(&env.current_contract_address().to_xdr(&env));
        preimage.append(&payment_info.to_xdr(&env));
        env.crypto().sha256(&preimage).into()
    }

    pub fn payment_state(env: Env, payment_hash: BytesN<32>) -> PaymentState {
        load_state(&env, &payment_hash)
    }
}

fn require_payer_auth(env: &Env, info: &PaymentInfo) {
    info.payer
        .require_auth_for_args(vec![env, info.clone().into_val(env)]);
}

/// Requires the consent address for the current call and returns it. Skipped when it is
/// also the operator, whose authorization was already required in the same frame.
fn require_consent(info: &PaymentInfo) -> Address {
    let consent = info
        .receiver_authorizer
        .clone()
        .unwrap_or_else(|| info.receiver.clone());
    if consent != info.operator {
        consent.require_auth();
    }
    consent
}

fn validate_payment(env: &Env, info: &PaymentInfo) -> Result<(), Error> {
    if info.max_amount <= 0 {
        return Err(Error::ZeroAmount);
    }
    if env.ledger().timestamp() >= info.pre_approval_expiry {
        return Err(Error::AfterPreApprovalExpiry);
    }
    if info.pre_approval_expiry > info.authorization_expiry
        || info.authorization_expiry > info.refund_expiry
    {
        return Err(Error::InvalidExpiries);
    }
    if info.max_fee_bps as i128 > MAX_FEE_BPS {
        return Err(Error::FeeBpsOverflow);
    }
    if info.min_fee_bps > info.max_fee_bps {
        return Err(Error::InvalidFeeBpsRange);
    }
    if info.fee_receiver.is_none() && info.max_fee_bps > 0 {
        return Err(Error::MissingFeeReceiver);
    }
    Ok(())
}

fn validate_amount(amount: i128, max: i128) -> Result<(), Error> {
    if amount <= 0 {
        return Err(Error::ZeroAmount);
    }
    if amount > max {
        return Err(Error::ExceedsMaxAmount);
    }
    Ok(())
}

fn validate_fee(
    info: &PaymentInfo,
    amount: i128,
    fee_amount: i128,
    fee_receiver: &Option<Address>,
) -> Result<(), Error> {
    let min_fee = amount * info.min_fee_bps as i128 / MAX_FEE_BPS;
    let max_fee = amount * info.max_fee_bps as i128 / MAX_FEE_BPS;
    if fee_amount < min_fee || fee_amount > max_fee {
        return Err(Error::FeeAmountOutOfRange);
    }
    if info.fee_receiver.is_some() && *fee_receiver != info.fee_receiver {
        return Err(Error::InvalidFeeReceiver);
    }
    if fee_amount > 0 && fee_receiver.is_none() {
        return Err(Error::MissingFeeReceiver);
    }
    Ok(())
}

fn ensure_not_collected(env: &Env, hash: &BytesN<32>) -> Result<(), Error> {
    if load_state(env, hash).collected {
        return Err(Error::AlreadyCollected);
    }
    Ok(())
}

fn release_hold(env: &Env, hash: &BytesN<32>, info: &PaymentInfo) -> Result<i128, Error> {
    let mut state = load_state(env, hash);
    let amount = core::mem::take(&mut state.capturable);
    if amount == 0 {
        return Err(Error::ZeroAuthorization);
    }
    save_state(env, hash, info, &state);
    Ok(amount)
}

fn load_state(env: &Env, hash: &BytesN<32>) -> PaymentState {
    env.storage()
        .persistent()
        .get(&DataKey::Payment(hash.clone()))
        .unwrap_or_default()
}

fn save_state(env: &Env, hash: &BytesN<32>, info: &PaymentInfo, state: &PaymentState) {
    let key = DataKey::Payment(hash.clone());
    let storage = env.storage().persistent();
    storage.set(&key, state);

    let seconds_left = info.refund_expiry.saturating_sub(env.ledger().timestamp());
    let ledgers = (seconds_left / LEDGER_SECONDS + TTL_BUFFER_LEDGERS)
        .min(env.storage().max_ttl() as u64) as u32;
    storage.extend_ttl(&key, ledgers, ledgers);
}

/// Pulls `max_amount` from the payer and checks the escrow received exactly that much.
fn collect(env: &Env, info: &PaymentInfo) {
    let token = TokenClient::new(env, &info.token);
    let escrow = env.current_contract_address();
    let before = token.balance(&escrow);
    token.transfer(&info.payer, &escrow, &info.max_amount);
    if token.balance(&escrow) != before + info.max_amount {
        soroban_sdk::panic_with_error!(env, Error::TokenCollectionFailed);
    }
}

fn distribute(
    env: &Env,
    info: &PaymentInfo,
    amount: i128,
    fee_amount: i128,
    fee_receiver: &Option<Address>,
) {
    if let Some(fee_receiver) = fee_receiver {
        if fee_amount > 0 {
            send(env, &info.token, fee_receiver, fee_amount);
        }
    }
    if amount > fee_amount {
        send(env, &info.token, &info.receiver, amount - fee_amount);
    }
}

fn send(env: &Env, token: &Address, to: &Address, amount: i128) {
    TokenClient::new(env, token).transfer(&env.current_contract_address(), to, &amount);
}
