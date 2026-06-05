use chrono::{DateTime, NaiveDate, NaiveDateTime, NaiveTime, Utc};

// Centralised formatting for temporal values so that every driver emits the same
// human-friendly representation. The `%.f` specifier outputs fractional seconds
// only when they are non-zero (e.g. `15` vs `15.123456`).

/// Format a `NaiveDateTime` as `YYYY-MM-DD HH:MM:SS[.f]`.
pub(crate) fn format_naive_datetime(dt: &NaiveDateTime) -> String {
    dt.format("%Y-%m-%d %H:%M:%S%.f").to_string()
}

/// Format a `NaiveDate` as `YYYY-MM-DD`.
pub(crate) fn format_naive_date(d: &NaiveDate) -> String {
    d.format("%Y-%m-%d").to_string()
}

/// Format a `NaiveTime` as `HH:MM:SS[.f]`.
pub(crate) fn format_naive_time(t: &NaiveTime) -> String {
    t.format("%H:%M:%S%.f").to_string()
}

/// Format a `DateTime<Utc>` as `YYYY-MM-DD HH:MM:SS[.f]+HH:MM`.
pub(crate) fn format_datetime_utc(dt: &DateTime<Utc>) -> String {
    dt.format("%Y-%m-%d %H:%M:%S%.f%:z").to_string()
}

#[cfg(test)]
mod tests {
    #[test]
    fn format_naive_datetime_without_fractional_seconds() {
        use chrono::NaiveDateTime;
        let dt = NaiveDateTime::parse_from_str("2026-05-12 06:52:15", "%Y-%m-%d %H:%M:%S").unwrap();
        assert_eq!(super::format_naive_datetime(&dt), "2026-05-12 06:52:15");
    }

    #[test]
    fn format_naive_datetime_with_fractional_seconds() {
        use chrono::NaiveDateTime;
        let dt =
            NaiveDateTime::parse_from_str("2026-05-12 06:52:15.123456", "%Y-%m-%d %H:%M:%S%.f")
                .unwrap();
        assert_eq!(
            super::format_naive_datetime(&dt),
            "2026-05-12 06:52:15.123456"
        );
    }

    #[test]
    fn format_naive_date_basic() {
        use chrono::NaiveDate;
        let d = NaiveDate::from_ymd_opt(2026, 5, 12).unwrap();
        assert_eq!(super::format_naive_date(&d), "2026-05-12");
    }

    #[test]
    fn format_naive_time_without_fractional_seconds() {
        use chrono::NaiveTime;
        let t = NaiveTime::from_hms_opt(6, 52, 15).unwrap();
        assert_eq!(super::format_naive_time(&t), "06:52:15");
    }

    #[test]
    fn format_naive_time_with_fractional_seconds() {
        use chrono::NaiveTime;
        let t = NaiveTime::from_hms_micro_opt(6, 52, 15, 123456).unwrap();
        assert_eq!(super::format_naive_time(&t), "06:52:15.123456");
    }

    #[test]
    fn format_datetime_utc_without_fractional_seconds() {
        use chrono::{TimeZone, Utc};
        let dt = Utc.with_ymd_and_hms(2026, 5, 12, 6, 52, 15).unwrap();
        assert_eq!(super::format_datetime_utc(&dt), "2026-05-12 06:52:15+00:00");
    }

    #[test]
    fn format_datetime_utc_with_fractional_seconds() {
        use chrono::{DateTime, NaiveDate, Utc};
        let dt = DateTime::<Utc>::from_naive_utc_and_offset(
            NaiveDate::from_ymd_opt(2026, 5, 12)
                .unwrap()
                .and_hms_micro_opt(6, 52, 15, 123456)
                .unwrap(),
            Utc,
        );
        assert_eq!(
            super::format_datetime_utc(&dt),
            "2026-05-12 06:52:15.123456+00:00"
        );
    }
}
