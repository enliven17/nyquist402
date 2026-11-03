#![no_std]

//! Escrow for the x402 `auth-capture` scheme on Stellar.
//!
//! Lifecycle: `authorize` places a hold, `capture` pays it out, `void` releases it,
//! `refund` returns captured funds, and `reclaim` lets the payer recover a hold
//! after the capture deadline. `charge` collects and pays out in one step.

mod types;

pub use types::{Error, PaymentInfo, PaymentState};

use soroban_sdk::{contract, contractimpl, xdr::ToXdr, Bytes, BytesN, Env};

#[contract]
pub struct AuthCaptureEscrow;

#[contractimpl]
impl AuthCaptureEscrow {
    /// Canonical payment identifier: sha256(network_id || escrow_address || xdr(payment_info)).
    pub fn payment_hash(env: Env, payment_info: PaymentInfo) -> BytesN<32> {
        let mut preimage = Bytes::from_array(&env, &env.ledger().network_id().to_array());
        preimage.append(&env.current_contract_address().to_xdr(&env));
        preimage.append(&payment_info.to_xdr(&env));
        env.crypto().sha256(&preimage).into()
    }
}
