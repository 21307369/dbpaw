use crate::models::ConnectionForm;
use quick_xml::events::Event;
use quick_xml::Reader;

/// Maps Navicat ConnType to DbPaw driver names.
fn map_conn_type_to_driver(conn_type: &str) -> Option<&'static str> {
    match conn_type.to_uppercase().as_str() {
        "MYSQL" => Some("mysql"),
        "MARIADB" => Some("mariadb"),
        "POSTGRESQL" => Some("postgres"),
        "ORACLE" => Some("oracle"),
        "SQLITE" => Some("sqlite"),
        "MSSQL" => Some("mssql"),
        "MONGODB" => Some("mongodb"),
        "REDIS" => Some("redis"),
        "CLICKHOUSE" => Some("clickhouse"),
        _ => None,
    }
}

fn attr_value(attrs: &[quick_xml::events::attributes::Attribute], key: &str) -> Option<String> {
    attrs
        .iter()
        .find(|a| a.key.as_ref() == key.as_bytes())
        .and_then(|a| std::str::from_utf8(&a.value).ok())
        .map(|s| s.to_string())
}

/// Parse Navicat .ncx XML into ConnectionForm list.
/// Returns (parsed_forms, skipped_count).
pub fn parse_navicat_ncx(content: &str) -> Result<(Vec<ConnectionForm>, usize), String> {
    let mut reader = Reader::from_str(content);
    reader.config_mut().trim_text(true);

    let mut forms = Vec::new();
    let mut skipped = 0usize;
    let mut buf = Vec::new();

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Empty(ref e)) | Ok(Event::Start(ref e)) => {
                let name = e.name();
                let tag_name = std::str::from_utf8(name.as_ref()).unwrap_or("");
                if tag_name == "Connection" {
                    let attrs = e.attributes().collect::<Result<Vec<_>, _>>().map_err(
                        |e| format!("Navicat NCX: failed to read attributes: {e}"),
                    )?;

                    let conn_type = attr_value(&attrs, "ConnType").unwrap_or_default();
                    let driver = match map_conn_type_to_driver(&conn_type) {
                        Some(d) => d.to_string(),
                        None => {
                            skipped += 1;
                            continue;
                        }
                    };

                    let name = attr_value(&attrs, "ConnectionName");
                    let host = attr_value(&attrs, "Host");
                    let port = attr_value(&attrs, "Port").and_then(|s| s.parse::<i64>().ok());
                    let database = attr_value(&attrs, "DatabaseName");
                    let username = attr_value(&attrs, "UserName");
                    let ssl = attr_value(&attrs, "SSL")
                        .map(|s| s.to_lowercase() == "true" || s == "1");
                    let ssh_host = attr_value(&attrs, "SSHHost");
                    let ssh_port =
                        attr_value(&attrs, "SSHPort").and_then(|s| s.parse::<i64>().ok());
                    let ssh_username = attr_value(&attrs, "SSHUserName");
                    let ssh_key_path = attr_value(&attrs, "SSHKeyFile");

                    let ssh_enabled = ssh_host.as_deref().map(|h| !h.is_empty());

                    forms.push(ConnectionForm {
                        driver,
                        name,
                        host,
                        port,
                        database,
                        username,
                        ssl,
                        ssh_enabled,
                        ssh_host,
                        ssh_port,
                        ssh_username,
                        ssh_key_path,
                        ..Default::default()
                    });
                }
            }
            Ok(Event::Eof) => break,
            Err(e) => return Err(format!("Navicat NCX parse failed: {e}")),
            _ => {}
        }
        buf.clear();
    }

    Ok((forms, skipped))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_navicat_basic() {
        let xml = r#"<?xml version="1.0" encoding="UTF-8"?>
<Connections>
  <Connection ConnectionName="My PG" ConnType="POSTGRESQL" Host="localhost" Port="5432" DatabaseName="mydb" UserName="admin" />
</Connections>"#;
        let (forms, skipped) = parse_navicat_ncx(xml).unwrap();
        assert_eq!(skipped, 0);
        assert_eq!(forms.len(), 1);
        assert_eq!(forms[0].driver, "postgres");
        assert_eq!(forms[0].name.as_deref(), Some("My PG"));
    }

    #[test]
    fn test_parse_navicat_with_ssh() {
        let xml = r#"<?xml version="1.0" encoding="UTF-8"?>
<Connections>
  <Connection ConnectionName="SSH MySQL" ConnType="MYSQL" Host="db.internal" Port="3306" DatabaseName="app" UserName="root" SSHHost="bastion.example.com" SSHPort="22" SSHUserName="ec2-user" SSHKeyFile="/path/to/key" />
</Connections>"#;
        let (forms, _) = parse_navicat_ncx(xml).unwrap();
        assert_eq!(forms.len(), 1);
        assert_eq!(forms[0].ssh_host.as_deref(), Some("bastion.example.com"));
        assert_eq!(forms[0].ssh_port, Some(22));
        assert_eq!(forms[0].ssh_enabled, Some(true));
    }

    #[test]
    fn test_parse_navicat_skips_unsupported() {
        let xml = r#"<?xml version="1.0" encoding="UTF-8"?>
<Connections>
  <Connection ConnectionName="DB2" ConnType="DB2" Host="localhost" />
  <Connection ConnectionName="SQLite" ConnType="SQLITE" />
</Connections>"#;
        let (forms, skipped) = parse_navicat_ncx(xml).unwrap();
        assert_eq!(skipped, 1); // DB2 not in Navicat mapping
        assert_eq!(forms.len(), 1);
        assert_eq!(forms[0].driver, "sqlite");
    }

    #[test]
    fn test_parse_navicat_empty() {
        let xml = r#"<?xml version="1.0" encoding="UTF-8"?>
<Connections></Connections>"#;
        let (forms, skipped) = parse_navicat_ncx(xml).unwrap();
        assert_eq!(skipped, 0);
        assert_eq!(forms.len(), 0);
    }
}
