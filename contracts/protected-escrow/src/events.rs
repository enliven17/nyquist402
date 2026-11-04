use soroban_sdk::{contractevent, Address, BytesN, Symbol};

use crate::{Claim, PaymentTerms};

#[contractevent]
pub struct PaymentFunded {
    #[topic]
    pub payment_id: BytesN<32>,
    pub terms: PaymentTerms,
    pub arbiter: Address,
}

#[contractevent]
pub struct ClaimRecorded {
    #[topic]
    pub payment_id: BytesN<32>,
    #[topic]
    pub claim_id: u32,
    pub claim: Claim,
}

#[contractevent]
pub struct CaseUpdated {
    #[topic]
    pub payment_id: BytesN<32>,
    #[topic]
    pub claim_id: u32,
    pub claim: Claim,
}

#[contractevent]
pub struct ClaimFinalized {
    #[topic]
    pub payment_id: BytesN<32>,
    #[topic]
    pub claim_id: u32,
    pub seller_amount: i128,
    pub buyer_amount: i128,
    pub reason: Symbol,
}

#[contractevent]
pub struct FundsReturned {
    #[topic]
    pub payment_id: BytesN<32>,
    pub amount: i128,
    pub reason: Symbol,
}
