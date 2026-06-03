use std::fmt;

/// Error code ranges by module
pub mod codes {
    // Connection 1xxx
    pub const CONN_FAILED: u16 = 1001;
    pub const CONN_TIMEOUT: u16 = 1002;
    pub const CONN_AUTH_FAILED: u16 = 1003;
    pub const CONN_TLS_ERROR: u16 = 1004;
    pub const CONN_POOL_ERROR: u16 = 1005;

    // Query 2xxx
    pub const QUERY_FAILED: u16 = 2001;
    pub const QUERY_SYNTAX: u16 = 2002;
    pub const QUERY_TIMEOUT: u16 = 2003;
    pub const QUERY_CANCELLED: u16 = 2004;

    // Validation 3xxx
    pub const VALIDATION: u16 = 3001;
    pub const VALIDATION_INPUT: u16 = 3002;
    pub const VALIDATION_STATE: u16 = 3003;

    // AI 4xxx
    pub const AI_PROVIDER: u16 = 4001;
    pub const AI_KEY: u16 = 4002;
    pub const AI_REQUEST: u16 = 4003;

    // Other 5xxx
    pub const UNSUPPORTED: u16 = 5001;
    pub const INTERNAL: u16 = 5002;
    pub const NOT_FOUND: u16 = 5003;
}

/// Structured error type with numeric codes
pub enum AppError {
    /// Connection-related errors
    ConnectionFailed {
        code: u16,
        message: String,
        hint: Option<String>,
        source: Option<Box<dyn std::error::Error + Send + Sync>>,
    },
    /// Query execution errors
    Query {
        code: u16,
        message: String,
        source: Option<Box<dyn std::error::Error + Send + Sync>>,
    },
    /// Input validation errors
    Validation {
        code: u16,
        message: String,
    },
    /// AI provider errors
    Ai {
        code: u16,
        message: String,
        source: Option<Box<dyn std::error::Error + Send + Sync>>,
    },
    /// Unsupported operation
    Unsupported {
        code: u16,
        message: String,
    },
    /// Internal/unexpected errors
    Internal {
        code: u16,
        message: String,
        source: Option<Box<dyn std::error::Error + Send + Sync>>,
    },
}

impl fmt::Display for AppError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            AppError::ConnectionFailed { code, message, hint, .. } => {
                write!(f, "[ERR-{code}] {message}")?;
                if let Some(h) = hint {
                    write!(f, " ({h})")?;
                }
                Ok(())
            }
            AppError::Query { code, message, .. } => write!(f, "[ERR-{code}] {message}"),
            AppError::Validation { code, message } => write!(f, "[ERR-{code}] {message}"),
            AppError::Ai { code, message, .. } => write!(f, "[ERR-{code}] {message}"),
            AppError::Unsupported { code, message } => write!(f, "[ERR-{code}] {message}"),
            AppError::Internal { code, message, .. } => write!(f, "[ERR-{code}] {message}"),
        }
    }
}

impl From<AppError> for String {
    fn from(err: AppError) -> Self {
        err.to_string()
    }
}
