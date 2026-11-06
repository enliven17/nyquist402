use soroban_sdk::{contracterror, contracttype, Address, BytesN};

/// Full agreement authenticated by both parties before funding.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PaymentTerms {
    pub payer: Address,
    pub seller: Address,
    pub token: Address,
    /// Commitment to the API offer's delivery criteria and pricing agreement.
    pub agreement: BytesN<32>,
    pub max_amount: i128,
    pub fund_by: u64,
    pub delivery_deadline: u64,
    pub buyer_arbiter: Option<Address>,
    pub seller_arbiter: Option<Address>,
    pub default_arbiter: Address,
    pub review_seconds: u64,
    pub response_seconds: u64,
    pub arbiter_seconds: u64,
    pub default_seconds: u64,
    /// Pre-agreed seller share only if neither arbiter rules. No implicit default.
    pub fallback_seller_bps: u32,
    pub salt: BytesN<32>,
    pub protocol_reserve: i128,
    pub arbitration_reserve: i128,
    pub protocol_bps: u32,
    pub protocol_recipient: Address,
    pub custom_fee: i128,
    pub default_fee: i128,
    pub case_fee_cap: i128,
    pub custom_quote: Option<BytesN<32>>,
    pub default_quote: Option<BytesN<32>>,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PaymentState {
    pub available: i128,
    pub reserved: i128,
    pub paid_to_seller: i128,
    pub returned_to_buyer: i128,
    pub next_claim_id: u32,
    pub protocol_available: i128,
    pub protocol_reserved: i128,
    pub protocol_paid: i128,
    pub protocol_returned: i128,
    pub arbitration_available: i128,
    pub arbitration_reserved: i128,
    pub arbitration_paid: i128,
    pub arbitration_returned: i128,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ClaimStatus {
    Review,
    Disputed,
    Settled,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Claim {
    pub amount: i128,
    pub delivery: BytesN<32>,
    pub commitment: BytesN<32>,
    pub review_until: u64,
    pub status: ClaimStatus,
    pub opened_by: Option<Address>,
    pub buyer_evidence: Option<BytesN<32>>,
    pub seller_evidence: Option<BytesN<32>>,
    pub revision: u32,
    pub response_until: u64,
    pub custom_until: u64,
    pub fallback_at: u64,
    pub seller_award: i128,
    pub protocol_reserved: i128,
    pub arbitration_reserved: i128,
    pub protocol_paid: i128,
    pub arbitration_paid: i128,
}

#[contracttype]
#[derive(Clone)]
pub(crate) struct Payment {
    pub terms: PaymentTerms,
    pub state: PaymentState,
    pub arbiter: Address,
    pub retain_until: u64,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    InvalidPolicy = 1,
    InvalidAmount = 2,
    FundingExpired = 3,
    AlreadyFunded = 4,
    PaymentNotFound = 5,
    ClaimNotFound = 6,
    SessionClosed = 7,
    SessionOpen = 8,
    InsufficientAvailable = 9,
    FundsReserved = 10,
    NothingToReclaim = 11,
    ReviewPending = 12,
    ReviewExpired = 13,
    DisputeActive = 14,
    AlreadySettled = 15,
    NotParty = 16,
    StaleClaim = 17,
    ResponsePending = 18,
    EvidenceClosed = 19,
    NotDisputed = 20,
    RulingExpired = 21,
    FallbackNotReady = 22,
    Overflow = 23,
    TokenCollectionFailed = 24,
    InvalidQuote = 25,
    InsufficientFeeCapacity = 26,
}

/// An arbiter authenticates this immutable quote onchain before funding.
/// Scope binds all terms except the two quote identifiers, plus network/deployment.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct FeeQuote {
    pub scope: BytesN<32>,
    pub arbiter: Address,
    pub fee: i128,
    pub valid_until: u64,
    pub salt: BytesN<32>,
}
