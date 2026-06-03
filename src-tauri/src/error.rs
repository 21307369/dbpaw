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
#[derive(Debug)]
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

impl std::error::Error for AppError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            AppError::ConnectionFailed { source, .. } => {
                source.as_ref().map(|e| e.as_ref() as &(dyn std::error::Error + 'static))
            }
            AppError::Query { source, .. } => {
                source.as_ref().map(|e| e.as_ref() as &(dyn std::error::Error + 'static))
            }
            AppError::Ai { source, .. } => {
                source.as_ref().map(|e| e.as_ref() as &(dyn std::error::Error + 'static))
            }
            AppError::Internal { source, .. } => {
                source.as_ref().map(|e| e.as_ref() as &(dyn std::error::Error + 'static))
            }
            _ => None,
        }
    }
}

impl AppError {
    pub fn conn_failed(message: impl Into<String>, hint: impl Into<String>) -> Self {
        AppError::ConnectionFailed {
            code: codes::CONN_FAILED,
            message: message.into(),
            hint: Some(hint.into()),
            source: None,
        }
    }

    pub fn conn_failed_with(
        message: impl Into<String>,
        hint: impl Into<String>,
        source: impl std::error::Error + Send + Sync + 'static,
    ) -> Self {
        AppError::ConnectionFailed {
            code: codes::CONN_FAILED,
            message: message.into(),
            hint: Some(hint.into()),
            source: Some(Box::new(source)),
        }
    }

    pub fn conn_timeout(message: impl Into<String>) -> Self {
        AppError::ConnectionFailed {
            code: codes::CONN_TIMEOUT,
            message: message.into(),
            hint: None,
            source: None,
        }
    }

    pub fn conn_auth_failed(message: impl Into<String>) -> Self {
        AppError::ConnectionFailed {
            code: codes::CONN_AUTH_FAILED,
            message: message.into(),
            hint: Some("Check username and password".to_string()),
            source: None,
        }
    }

    pub fn conn_tls_error(message: impl Into<String>) -> Self {
        AppError::ConnectionFailed {
            code: codes::CONN_TLS_ERROR,
            message: message.into(),
            hint: Some("TLS handshake failed - try disabling SSL".to_string()),
            source: None,
        }
    }

    pub fn query_failed(message: impl Into<String>) -> Self {
        AppError::Query {
            code: codes::QUERY_FAILED,
            message: message.into(),
            source: None,
        }
    }

    pub fn query_failed_with(
        message: impl Into<String>,
        source: impl std::error::Error + Send + Sync + 'static,
    ) -> Self {
        AppError::Query {
            code: codes::QUERY_FAILED,
            message: message.into(),
            source: Some(Box::new(source)),
        }
    }

    pub fn query_syntax(message: impl Into<String>) -> Self {
        AppError::Query {
            code: codes::QUERY_SYNTAX,
            message: message.into(),
            source: None,
        }
    }

    pub fn query_timeout(message: impl Into<String>) -> Self {
        AppError::Query {
            code: codes::QUERY_TIMEOUT,
            message: message.into(),
            source: None,
        }
    }

    pub fn validation(message: impl Into<String>) -> Self {
        AppError::Validation {
            code: codes::VALIDATION,
            message: message.into(),
        }
    }

    pub fn ai_provider(message: impl Into<String>) -> Self {
        AppError::Ai {
            code: codes::AI_PROVIDER,
            message: message.into(),
            source: None,
        }
    }

    pub fn ai_key(message: impl Into<String>) -> Self {
        AppError::Ai {
            code: codes::AI_KEY,
            message: message.into(),
            source: None,
        }
    }

    pub fn unsupported(message: impl Into<String>) -> Self {
        AppError::Unsupported {
            code: codes::UNSUPPORTED,
            message: message.into(),
        }
    }

    pub fn internal(message: impl Into<String>) -> Self {
        AppError::Internal {
            code: codes::INTERNAL,
            message: message.into(),
            source: None,
        }
    }

    pub fn internal_with(
        message: impl Into<String>,
        source: impl std::error::Error + Send + Sync + 'static,
    ) -> Self {
        AppError::Internal {
            code: codes::INTERNAL,
            message: message.into(),
            source: Some(Box::new(source)),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_conn_failed_display() {
        let err = AppError::conn_failed("connection refused", "check host and port");
        assert_eq!(err.to_string(), "[ERR-1001] connection refused (check host and port)");
    }

    #[test]
    fn test_conn_failed_no_hint() {
        let err = AppError::ConnectionFailed {
            code: codes::CONN_FAILED,
            message: "timeout".to_string(),
            hint: None,
            source: None,
        };
        assert_eq!(err.to_string(), "[ERR-1001] timeout");
    }

    #[test]
    fn test_query_failed_display() {
        let err = AppError::query_failed("syntax error near SELECT");
        assert_eq!(err.to_string(), "[ERR-2001] syntax error near SELECT");
    }

    #[test]
    fn test_validation_display() {
        let err = AppError::validation("host cannot be empty");
        assert_eq!(err.to_string(), "[ERR-3001] host cannot be empty");
    }

    #[test]
    fn test_unsupported_display() {
        let err = AppError::unsupported("Routines not supported for this driver");
        assert_eq!(err.to_string(), "[ERR-5001] Routines not supported for this driver");
    }

    #[test]
    fn test_from_app_error_to_string() {
        let err = AppError::conn_auth_failed("invalid credentials");
        let s: String = err.into();
        assert!(s.starts_with("[ERR-1003]"));
        assert!(s.contains("invalid credentials"));
    }

    #[test]
    fn test_conn_timeout() {
        let err = AppError::conn_timeout("connection timed out");
        assert_eq!(err.to_string(), "[ERR-1002] connection timed out");
    }

    #[test]
    fn test_conn_tls_error() {
        let err = AppError::conn_tls_error("handshake failed");
        let s = err.to_string();
        assert!(s.contains("[ERR-1004]"));
        assert!(s.contains("TLS handshake failed"));
    }

    #[test]
    fn test_query_timeout() {
        let err = AppError::query_timeout("query execution timed out");
        assert_eq!(err.to_string(), "[ERR-2003] query execution timed out");
    }

    #[test]
    fn test_internal_error() {
        let err = AppError::internal("unexpected state");
        assert_eq!(err.to_string(), "[ERR-5002] unexpected state");
    }
}
