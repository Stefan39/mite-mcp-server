# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- MCP server over stdio on the official TypeScript SDK v2.
- Safety layer: `MITE_MODE` (read-only by default, `write`, `admin`) and tool allowlist `MITE_TOOLS`; tools outside mode or allowlist are not registered.
- `mite_whoami`: account, user, role, server mode and enabled tools.
- `mite_report_projects_by_month`: hours and revenue per project and month, grouped on the mite server.
- `mite_report`: hours, revenue and share of hours grouped by 1 to 3 of customer, project, service, user, day, week, month, year, aggregated on the mite server.
- `mite_report_budget`: budget, consumption, remaining budget and percent used per project over the whole project life (minutes in hours, cents in currency units).
- `mite_report_billable_ratio`: billable and non-billable hours and the billable share in percent, in total or per customer, project, user or month.
- `mite_list_time_entries`: single time entries for a period with filters and paging (`limit`, `page`, `has_more`).
- `mite_get_time_entry`: one time entry by id.
- `mite_tracker_status`: whether the mite tracker is running, and on which time entry.
- `mite_list_customers`, `mite_list_projects`, `mite_list_services`, `mite_list_users`: master data, active or archived (`archived: true`); no email or hourly rates.
- `mite_create_time_entry`, `mite_update_time_entry` (both with `dry_run`), `mite_start_tracker`, `mite_stop_tracker`: write tools in mode `write`, no confirmation token. Updating a locked entry fails with a clear error.
- `mite_delete_time_entry` (mode `write`): deletes a time entry in two steps; the first call (or `dry_run: true`) returns a preview and a `confirm_token` (HMAC-SHA256, valid for 5 minutes, usable once). Locked entries are refused.
- `mite_create_*`, `mite_update_*` and `mite_delete_*` for customers, projects and services (mode `admin`, one shared factory): create and update support `dry_run`, `archived: true|false` on update archives or restores, delete uses the two-step `confirm_token` flow. A deletion refused by mite is returned as a readable error.
- Mode `admin`: `mite_update_time_entry` and `mite_delete_time_entry` accept `force: true` to change or delete a locked entry. A call with `force: true` always needs a `confirm_token` (also on update); the first call or `dry_run: true` returns a preview stating that the entry is locked, plus a token. Outside mode `admin` the parameter is not in the input schema, and `force` is never set automatically, not even after a 423.
- mite API client with polite throttling, retries on 429/5xx and API-key redaction.
