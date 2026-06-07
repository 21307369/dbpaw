use crate::error::AppError;

pub type RedisResult<T> = Result<T, AppError>;

pub fn validation(message: impl Into<String>) -> AppError {
    AppError::validation(message)
}

pub fn unsupported(message: impl Into<String>) -> AppError {
    AppError::unsupported(message)
}

pub fn command(message: impl Into<String>) -> AppError {
    AppError::query_failed(message)
}

pub fn command_with(source: redis::RedisError) -> AppError {
    AppError::query_failed_with(source.to_string(), source)
}

pub fn scan(message: impl Into<String>) -> AppError {
    AppError::query_failed(message)
}

pub fn to_command_string(err: impl std::fmt::Display) -> String {
    format!("[REDIS_ERROR] {err}")
}

pub fn to_scan_string(err: impl std::fmt::Display) -> String {
    format!("[REDIS_SCAN_ERROR] {err}")
}

pub fn to_validation_string(message: impl AsRef<str>) -> String {
    format!("[VALIDATION_ERROR] {}", message.as_ref())
}

pub fn to_unsupported_string(message: impl AsRef<str>) -> String {
    format!("[UNSUPPORTED] {}", message.as_ref())
}
