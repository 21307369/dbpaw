mod tests {
    use super::{
        build_cluster_nodes, build_connection_info, is_cluster_form, list_databases,
        parse_cluster_info_text, parse_cluster_nodes_text, parse_database, redis_mode,
        validate_value_for_write, RedisValue,
    };
    use crate::models::ConnectionForm;
    use redis::ConnectionAddr;

    #[test]
    fn parse_database_accepts_db_prefix() {
        assert_eq!(parse_database(Some("db3")).unwrap(), 3);
        assert_eq!(parse_database(Some(" 4 ")).unwrap(), 4);
        assert_eq!(parse_database(None).unwrap(), 0);
    }

    #[test]
    fn parse_database_rejects_invalid_index() {
        assert!(parse_database(Some("abc")).is_err());
        assert!(parse_database(Some("256")).is_err());
    }

    #[test]
    fn redis_connection_info_preserves_acl_credentials() {
        let form = ConnectionForm {
            driver: "redis".to_string(),
            host: Some("localhost".to_string()),
            port: Some(6379),
            username: Some("app".to_string()),
            password: Some("secret".to_string()),
            ..ConnectionForm::default()
        };
        let info = build_connection_info(&form, 2).unwrap();
        assert_eq!(info.redis.db, 2);
        assert_eq!(info.redis.username.as_deref(), Some("app"));
        assert_eq!(info.redis.password.as_deref(), Some("secret"));
        assert!(matches!(info.addr, ConnectionAddr::Tcp(_, 6379)));
    }

    #[test]
    fn list_databases_marks_selected_index() {
        let form = ConnectionForm {
            driver: "redis".to_string(),
            database: Some("db5".to_string()),
            ..ConnectionForm::default()
        };
        let dbs = list_databases(&form, 16).unwrap();
        assert_eq!(dbs.len(), 16);
        assert!(dbs[5].selected);
    }

    #[test]
    fn comma_separated_hosts_enable_cluster_mode() {
        let form = ConnectionForm {
            driver: "redis".to_string(),
            host: Some("10.0.0.1:6379,10.0.0.2:6380".to_string()),
            ..ConnectionForm::default()
        };
        assert!(is_cluster_form(&form));
        assert_eq!(redis_mode(&form), "cluster");
        let nodes = build_cluster_nodes(&form).unwrap();
        assert_eq!(nodes.len(), 2);
    }

    #[test]
    fn structured_seed_nodes_enable_cluster_mode() {
        let form = ConnectionForm {
            driver: "redis".to_string(),
            mode: Some("cluster".to_string()),
            seed_nodes: Some(vec![
                "10.0.0.1:6379".to_string(),
                "10.0.0.2:6380".to_string(),
            ]),
            ..ConnectionForm::default()
        };
        assert!(is_cluster_form(&form));
        let nodes = build_cluster_nodes(&form).unwrap();
        assert_eq!(nodes.len(), 2);
    }

    #[test]
    fn cluster_mode_rejects_non_zero_database() {
        let form = ConnectionForm {
            driver: "redis".to_string(),
            host: Some("10.0.0.1:6379,10.0.0.2:6380".to_string()),
            database: Some("db1".to_string()),
            ..ConnectionForm::default()
        };
        assert!(build_cluster_nodes(&form).is_err());
    }

    #[test]
    fn password_is_optional_for_connection_info() {
        let form = ConnectionForm {
            driver: "redis".to_string(),
            host: Some("localhost".to_string()),
            port: Some(6379),
            ..ConnectionForm::default()
        };
        let info = build_connection_info(&form, 0).unwrap();
        assert!(info.redis.username.is_none());
        assert!(info.redis.password.is_none());
    }

    #[test]
    fn empty_collection_values_are_rejected_before_write() {
        assert!(validate_value_for_write(&RedisValue::Hash(Default::default())).is_err());
        assert!(validate_value_for_write(&RedisValue::List(vec![])).is_err());
        assert!(validate_value_for_write(&RedisValue::Set(vec![])).is_err());
        assert!(validate_value_for_write(&RedisValue::ZSet(vec![])).is_err());
        assert!(validate_value_for_write(&RedisValue::String(String::new())).is_ok());
    }

    use super::{format_redis_value, tokenize_command};
    use redis::Value;

    // tokenize_command

    #[test]
    fn tokenize_simple_command() {
        assert_eq!(tokenize_command("GET mykey").unwrap(), vec!["GET", "mykey"]);
    }

    #[test]
    fn tokenize_trims_extra_whitespace() {
        assert_eq!(
            tokenize_command("  SET  foo  bar  ").unwrap(),
            vec!["SET", "foo", "bar"]
        );
    }

    #[test]
    fn tokenize_double_quoted_value_with_spaces() {
        assert_eq!(
            tokenize_command(r#"SET key "hello world""#).unwrap(),
            vec!["SET", "key", "hello world"]
        );
    }

    #[test]
    fn tokenize_single_quoted_value() {
        assert_eq!(
            tokenize_command("SET key 'hello world'").unwrap(),
            vec!["SET", "key", "hello world"]
        );
    }

    #[test]
    fn tokenize_backslash_escape_in_double_quotes() {
        assert_eq!(
            tokenize_command(r#"SET key "say \"hi\"""#).unwrap(),
            vec!["SET", "key", r#"say "hi""#]
        );
    }

    #[test]
    fn tokenize_empty_string_returns_empty_vec() {
        assert_eq!(tokenize_command("").unwrap(), Vec::<String>::new());
        assert_eq!(tokenize_command("   ").unwrap(), Vec::<String>::new());
    }

    #[test]
    fn tokenize_unterminated_double_quote_is_error() {
        assert!(tokenize_command(r#"SET key "unclosed"#).is_err());
    }

    #[test]
    fn tokenize_unterminated_single_quote_is_error() {
        assert!(tokenize_command("SET key 'unclosed").is_err());
    }

    // format_redis_value

    #[test]
    fn format_nil() {
        assert_eq!(format_redis_value(Value::Nil), "(nil)");
    }

    #[test]
    fn format_okay() {
        assert_eq!(format_redis_value(Value::Okay), "OK");
    }

    #[test]
    fn format_integer() {
        assert_eq!(format_redis_value(Value::Int(42)), "(integer) 42");
        assert_eq!(format_redis_value(Value::Int(-1)), "(integer) -1");
    }

    #[test]
    fn format_bulk_string_utf8() {
        assert_eq!(
            format_redis_value(Value::BulkString(b"hello".to_vec())),
            "\"hello\""
        );
    }

    #[test]
    fn format_bulk_string_binary() {
        let bytes = vec![0xc3, 0x28]; // invalid UTF-8
        let out = format_redis_value(Value::BulkString(bytes));
        assert!(out.starts_with("(binary "));
        assert!(out.ends_with(" bytes)"));
    }

    #[test]
    fn format_simple_string() {
        assert_eq!(
            format_redis_value(Value::SimpleString("PONG".to_string())),
            "PONG"
        );
    }

    #[test]
    fn format_empty_array() {
        assert_eq!(format_redis_value(Value::Array(vec![])), "(empty array)");
    }

    #[test]
    fn format_array_with_items() {
        let items = vec![
            Value::BulkString(b"a".to_vec()),
            Value::BulkString(b"b".to_vec()),
        ];
        let out = format_redis_value(Value::Array(items));
        assert_eq!(out, "1) \"a\"\n2) \"b\"");
    }

    #[test]
    fn format_nested_array() {
        let inner = Value::Array(vec![Value::Int(1), Value::Int(2)]);
        let outer = Value::Array(vec![inner, Value::Nil]);
        let out = format_redis_value(outer);
        assert_eq!(out, "1) 1) (integer) 1\n2) (integer) 2\n2) (nil)");
    }

    // ── parse_cluster_info_text ───────────────────────────────────────────

    #[test]
    fn cluster_info_text_parses_key_value_pairs() {
        let raw = "cluster_state:ok\ncluster_slots:16384\ncluster_known_nodes:3\n";
        let info = parse_cluster_info_text(raw);
        assert_eq!(info.get("cluster_state").map(String::as_str), Some("ok"));
        assert_eq!(info.get("cluster_slots").map(String::as_str), Some("16384"));
        assert_eq!(
            info.get("cluster_known_nodes").map(String::as_str),
            Some("3")
        );
    }

    #[test]
    fn cluster_info_text_handles_empty_input() {
        let info = parse_cluster_info_text("");
        assert!(info.is_empty());
    }

    #[test]
    fn cluster_info_text_trims_whitespace() {
        let raw = "  cluster_state : ok  \n";
        let info = parse_cluster_info_text(raw);
        assert_eq!(info.get("cluster_state").map(String::as_str), Some("ok"));
    }

    // ── parse_cluster_nodes_text ──────────────────────────────────────────

    #[test]
    fn cluster_nodes_text_parses_master_and_slave() {
        let raw = "abc123 127.0.0.1:6379 myself,master - 0 1 1 connected 0-5460\ndef456 127.0.0.1:6380 slave abc123 0 2 2 connected\n";
        let nodes = parse_cluster_nodes_text(raw);
        assert_eq!(nodes.len(), 2);

        assert_eq!(nodes[0].id, "abc123");
        assert_eq!(nodes[0].addr, "127.0.0.1:6379");
        assert!(nodes[0].flags.contains(&"myself".to_string()));
        assert!(nodes[0].flags.contains(&"master".to_string()));
        assert!(nodes[0].master_id.is_none());
        assert_eq!(nodes[0].link_state, "connected");
        assert_eq!(nodes[0].slot_range.as_deref(), Some("0-5460"));

        assert_eq!(nodes[1].id, "def456");
        assert!(nodes[1].flags.contains(&"slave".to_string()));
        assert_eq!(nodes[1].master_id.as_deref(), Some("abc123"));
        assert!(nodes[1].slot_range.is_none());
    }

    #[test]
    fn cluster_nodes_text_skips_empty_lines() {
        let raw = "\n\nabc123 127.0.0.1:6379 myself,master - 0 1 1 connected 0-5460\n\n";
        let nodes = parse_cluster_nodes_text(raw);
        assert_eq!(nodes.len(), 1);
    }

    #[test]
    fn cluster_nodes_text_skips_malformed_lines() {
        let raw = "too few fields\nabc123 127.0.0.1:6379 myself,master - 0 1 1 connected 0-5460\n";
        let nodes = parse_cluster_nodes_text(raw);
        assert_eq!(nodes.len(), 1);
    }

    #[test]
    fn cluster_nodes_text_handles_empty_input() {
        let nodes = parse_cluster_nodes_text("");
        assert!(nodes.is_empty());
    }
}
