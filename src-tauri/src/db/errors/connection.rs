use crate::error::AppError;

/// Build a `[CONN_FAILED]` error message with a context-aware hint derived from the
/// underlying error text, so users are not misled by a generic credential warning
/// when the actual problem is TLS incompatibility, a network issue, etc.
pub(crate) fn conn_failed_error(e: &dyn std::fmt::Display) -> AppError {
    let raw = e.to_string();
    let lower = raw.to_ascii_lowercase();

    let hint = if lower.contains("dpi-1047")
        || lower.contains("cannot locate a 64-bit oracle client")
    {
        "hint: Oracle Instant Client is not installed — download it from \
         https://www.oracle.com/database/technologies/instant-client/downloads.html \
         and add the directory containing libclntsh to your library path \
         (macOS: DYLD_LIBRARY_PATH; Linux: LD_LIBRARY_PATH)"
    } else if lower.contains("handshake")
        || lower.contains("fatal alert")
        || lower.contains("tls")
        || lower.contains("ssl")
        || lower.contains("certificate")
    {
        "hint: TLS/SSL handshake failed — the server may use a TLS version or cipher suite \
         incompatible with the client (TLS 1.2+ required); try disabling SSL in the connection settings"
    } else if lower.contains("access denied")
        || lower.contains("authentication")
        || lower.contains("password")
        || lower.contains("login failed")
        || lower.contains("invalid password")
        || lower.contains("1045")
    {
        "hint: authentication failed — verify the username/password are correct; \
         if they contain special characters they must be URL-encoded"
    } else if lower.contains("connection refused")
        || lower.contains("timed out")
        || lower.contains("timeout")
        || lower.contains("broken pipe")
        || lower.contains("network unreachable")
    {
        "hint: could not reach the server — check host, port, firewall rules, and SSH tunnel settings"
    } else if lower.contains("name resolution")
        || lower.contains("no such host")
        || lower.contains("failed to lookup")
        || lower.contains("dns")
    {
        "hint: hostname could not be resolved — check that the host address is correct"
    } else {
        "hint: check host, port, credentials, and SSL settings"
    };

    AppError::conn_failed(raw, hint)
}

#[cfg(test)]
mod tests {
    use super::conn_failed_error;

    #[test]
    fn conn_failed_error_oracle_client_hint() {
        let err = conn_failed_error(
            &"DPI-1047: Cannot locate a 64-bit Oracle Client library: \"dlopen(libclntsh.dylib, 0x0001): tried: '/usr/local/lib/libclntsh.dylib' (no such file)\"",
        );
        let msg = err.to_string();
        assert!(msg.starts_with("[ERR-1001]"));
        assert!(msg.contains("Oracle Instant Client is not installed"));
        assert!(msg.contains("DYLD_LIBRARY_PATH"));
        assert!(!msg.contains("TLS/SSL handshake failed"));
    }

    #[test]
    fn conn_failed_error_tls_hint() {
        let err = conn_failed_error(
            &"error communicating with database: received fatal alert: HandshakeFailure",
        );
        let msg = err.to_string();
        assert!(msg.starts_with("[ERR-1001]"));
        assert!(msg.contains("TLS/SSL handshake failed"));
        assert!(!msg.contains("username/password"));
    }

    #[test]
    fn conn_failed_error_auth_hint() {
        let err = conn_failed_error(&"Access denied for user 'root'@'localhost'");
        let msg = err.to_string();
        assert!(msg.contains("authentication failed"));
        assert!(msg.contains("URL-encoded"));
    }

    #[test]
    fn conn_failed_error_connection_refused_hint() {
        let err = conn_failed_error(&"Connection refused (os error 111)");
        let msg = err.to_string();
        assert!(msg.contains("could not reach the server"));
    }

    #[test]
    fn conn_failed_error_timeout_hint() {
        let err = conn_failed_error(&"connection timed out");
        let msg = err.to_string();
        assert!(msg.contains("could not reach the server"));
    }

    #[test]
    fn conn_failed_error_dns_hint() {
        let err = conn_failed_error(&"failed to lookup address information: no such host");
        let msg = err.to_string();
        assert!(msg.contains("hostname could not be resolved"));
    }

    #[test]
    fn conn_failed_error_generic_hint() {
        let err = conn_failed_error(&"some unknown database error");
        let msg = err.to_string();
        assert!(msg.starts_with("[ERR-1001]"));
        assert!(msg.contains("hint:"));
        assert!(!msg.contains("username/password"));
    }
}
