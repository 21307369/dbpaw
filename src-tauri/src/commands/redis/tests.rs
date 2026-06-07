mod tests {
    use super::*;

    #[test]
    fn cache_key_standalone_with_database() {
        assert_eq!(cache_key(1, Some("db0"), false), "1:db0");
    }

    #[test]
    fn cache_key_standalone_no_database() {
        assert_eq!(cache_key(1, None, false), "1:");
    }

    #[test]
    fn cache_key_cluster_with_database() {
        assert_eq!(cache_key(42, Some("db1"), true), "42:cluster");
    }

    #[test]
    fn cache_key_cluster_no_database() {
        assert_eq!(cache_key(42, None, true), "42:cluster");
    }

    #[test]
    fn cache_key_standalone_custom_db() {
        assert_eq!(cache_key(99, Some("mydb"), false), "99:mydb");
    }

    #[test]
    fn io_error_broken_pipe() {
        assert!(is_io_error("[REDIS_ERROR] broken pipe"));
    }

    #[test]
    fn io_error_connection_reset() {
        assert!(is_io_error("[REDIS_ERROR] connection reset by peer"));
    }

    #[test]
    fn io_error_connection_refused() {
        assert!(is_io_error("[REDIS_ERROR] connection refused"));
    }

    #[test]
    fn io_error_not_redis_error() {
        assert!(!is_io_error("some other error"));
    }

    #[test]
    fn io_error_redis_but_not_io() {
        assert!(!is_io_error("[REDIS_ERROR] ERR wrong number of arguments"));
    }

    #[tokio::test]
    async fn retry_once_retries_redis_io_error() {
        let mut attempts = 0;
        let mut retries = 0;

        let result = retry_once_on_redis_io_error(
            || {
                attempts += 1;
                async move {
                    if attempts == 1 {
                        Err("[REDIS_ERROR] connection reset by peer".to_string())
                    } else {
                        Ok("ok")
                    }
                }
            },
            || {
                retries += 1;
                async {}
            },
        )
        .await;

        assert_eq!(result, Ok("ok"));
        assert_eq!(attempts, 2);
        assert_eq!(retries, 1);
    }

    #[tokio::test]
    async fn retry_once_does_not_retry_non_io_error() {
        let mut attempts = 0;
        let mut retries = 0;

        let result = retry_once_on_redis_io_error(
            || {
                attempts += 1;
                async { Err::<(), _>("[REDIS_ERROR] ERR wrong number of arguments".to_string()) }
            },
            || {
                retries += 1;
                async {}
            },
        )
        .await;

        assert_eq!(
            result,
            Err("[REDIS_ERROR] ERR wrong number of arguments".to_string())
        );
        assert_eq!(attempts, 1);
        assert_eq!(retries, 0);
    }

    #[tokio::test]
    async fn retry_once_returns_second_io_error_without_third_attempt() {
        let mut attempts = 0;
        let mut retries = 0;

        let result = retry_once_on_redis_io_error(
            || {
                attempts += 1;
                async { Err::<(), _>("[REDIS_ERROR] broken pipe".to_string()) }
            },
            || {
                retries += 1;
                async {}
            },
        )
        .await;

        assert_eq!(result, Err("[REDIS_ERROR] broken pipe".to_string()));
        assert_eq!(attempts, 2);
        assert_eq!(retries, 1);
    }

    #[test]
    fn clamp_none_returns_default() {
        assert_eq!(clamp_redis_command_logs_limit(None), 100);
    }

    #[test]
    fn clamp_within_range() {
        assert_eq!(clamp_redis_command_logs_limit(Some(50)), 50);
    }

    #[test]
    fn clamp_below_minimum() {
        assert_eq!(clamp_redis_command_logs_limit(Some(0)), 1);
    }

    #[test]
    fn clamp_above_maximum() {
        assert_eq!(clamp_redis_command_logs_limit(Some(200)), 100);
    }
}
