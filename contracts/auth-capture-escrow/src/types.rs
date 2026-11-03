use soroban_sdk::{contracterror, contracttype, Address, BytesN};

/// Terms of a single payment. Every field is committed to the payment hash.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PaymentInfo {
    /// Submits collect and lifecycle calls (the facilitator in the delegated model).
    pub operator: Address,
    /// Funds the payment and authorizes the collect call.
    pub payer: Address,
    /// Receives captured funds minus fees.
    pub receiver: Address,
    /// Consents to server-side operations (charge, capture, void, refund). None disables them.
    pub receiver_authorizer: Option<Address>,
    /// SEP-41 token contract.
    pub token: Address,
    /// Amount the payer authorizes, in token base units.
    pub max_amount: i128,
    /// Unix seconds. Collect must happen before this.
    pub pre_approval_expiry: u64,
    /// Unix seconds. Capture must happen before this; reclaim opens at this time.
    pub authorization_expiry: u64,
    /// Unix seconds. Refund must happen before this.
    pub refund_expiry: u64,
    /// Fee bounds in basis points, applied to each charged or captured amount.
    pub min_fee_bps: u32,
    pub max_fee_bps: u32,
    /// Fee recipient. None lets the operator choose one per call (requires zero fee bounds).
    pub fee_receiver: Option<Address>,
    /// Client entropy. Keeps payment hashes unique.
    pub salt: BytesN<32>,
}

/// Balances tracked per payment hash.
#[contracttype]
#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct PaymentState {
    pub collected: bool,
    pub capturable: i128,
    pub refundable: i128,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    ZeroAmount = 1,
    ExceedsMaxAmount = 2,
    AfterPreApprovalExpiry = 3,
    InvalidExpiries = 4,
    FeeBpsOverflow = 5,
    InvalidFeeBpsRange = 6,
    FeeAmountOutOfRange = 7,
    MissingFeeReceiver = 8,
    InvalidFeeReceiver = 9,
    AlreadyCollected = 10,
    AfterAuthorizationExpiry = 11,
    InsufficientAuthorization = 12,
    ZeroAuthorization = 13,
    BeforeAuthorizationExpiry = 14,
    AfterRefundExpiry = 15,
    RefundExceedsCapture = 16,
    TokenCollectionFailed = 17,
}
