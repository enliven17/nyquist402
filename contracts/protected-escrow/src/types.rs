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
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PaymentState {
    pub available: i128,
    pub reserved: i128,
    pub paid_to_seller: i128,
    pub returned_to_buyer: i128,
    pub next_claim_id: u32,
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
}
