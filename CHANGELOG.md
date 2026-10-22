# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- MCP server over stdio on the official TypeScript SDK v2.
- Safety layer: `MITE_MODE` (read-only by default, `write`, `admin`) and tool allowlist `MITE_TOOLS`; tools outside mode or allowlist are not registered.
- `mite_whoami`: account, user, role, server mode and enabled tools.
- `mite_report_projects_by_month`: hours and revenue per project and month, grouped on the mite server.
- mite API client with polite throttling, retries on 429/5xx and API-key redaction.
