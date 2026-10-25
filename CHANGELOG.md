# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- MCP server over stdio on the official TypeScript SDK v2.
- Safety layer: `MITE_MODE` (read-only by default, `write`, `admin`) and tool allowlist `MITE_TOOLS`; tools outside mode or allowlist are not registered.
- `mite_whoami`: account, user, role, server mode and enabled tools.
- `mite_report_projects_by_month`: hours and revenue per project and month, grouped on the mite server.
- `mite_list_time_entries`: single time entries for a period with filters and paging (`limit`, `page`, `has_more`).
- `mite_get_time_entry`: one time entry by id.
- `mite_tracker_status`: whether the mite tracker is running, and on which time entry.
- mite API client with polite throttling, retries on 429/5xx and API-key redaction.
