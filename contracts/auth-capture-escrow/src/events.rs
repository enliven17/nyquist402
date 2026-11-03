use soroban_sdk::{contractevent, Address, BytesN, Env};

use crate::PaymentInfo;

#[contractevent]
pub struct PaymentAuthorized {
    #[topic]
    pub payment_hash: BytesN<32>,
    pub payment_info: PaymentInfo,
    pub amount: i128,
}

#[contractevent]
pub struct PaymentCharged {
    #[topic]
    pub payment_hash: BytesN<32>,
    pub payment_info: PaymentInfo,
    pub amount: i128,
    pub fee_amount: i128,
    pub fee_receiver: Option<Address>,
}

#[contractevent]
pub struct PaymentCaptured {
    #[topic]
    pub payment_hash: BytesN<32>,
    pub amount: i128,
    pub fee_amount: i128,
    pub fee_receiver: Option<Address>,
}

#[contractevent]
pub struct PaymentVoided {
    #[topic]
    pub payment_hash: BytesN<32>,
    pub amount: i128,
}

#[contractevent]
pub struct PaymentReclaimed {
    #[topic]
    pub payment_hash: BytesN<32>,
    pub amount: i128,
}

#[contractevent]
pub struct PaymentRefunded {
    #[topic]
    pub payment_hash: BytesN<32>,
    pub amount: i128,
    pub funder: Address,
}

pub fn authorized(env: &Env, hash: &BytesN<32>, info: &PaymentInfo, amount: i128) {
    PaymentAuthorized {
        payment_hash: hash.clone(),
        payment_info: info.clone(),
        amount,
    }
    .publish(env);
}

pub fn charged(
    env: &Env,
    hash: &BytesN<32>,
    info: &PaymentInfo,
    amount: i128,
    fee_amount: i128,
    fee_receiver: &Option<Address>,
) {
    PaymentCharged {
        payment_hash: hash.clone(),
        payment_info: info.clone(),
        amount,
        fee_amount,
        fee_receiver: fee_receiver.clone(),
    }
    .publish(env);
}

pub fn captured(
    env: &Env,
    hash: &BytesN<32>,
    amount: i128,
    fee_amount: i128,
    fee_receiver: &Option<Address>,
) {
    PaymentCaptured {
        payment_hash: hash.clone(),
        amount,
        fee_amount,
        fee_receiver: fee_receiver.clone(),
    }
    .publish(env);
}

pub fn voided(env: &Env, hash: &BytesN<32>, amount: i128) {
    PaymentVoided {
        payment_hash: hash.clone(),
        amount,
    }
    .publish(env);
}

pub fn reclaimed(env: &Env, hash: &BytesN<32>, amount: i128) {
    PaymentReclaimed {
        payment_hash: hash.clone(),
        amount,
    }
    .publish(env);
}

pub fn refunded(env: &Env, hash: &BytesN<32>, amount: i128, funder: &Address) {
    PaymentRefunded {
        payment_hash: hash.clone(),
        amount,
        funder: funder.clone(),
    }
    .publish(env);
}
