# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed

- Tool and parameter descriptions rewritten for agents (when to use, what it returns, limits); no change to names or schemas.

## [1.0.0] - 2026-10-29

First stable release. Tool names, their parameters and the configuration variables now follow semantic versioning: a breaking change needs a new major version.

### Added

- Published on npm: `npx -y mite-mcp-server`.
- Listed in the official MCP Registry as `io.github.Stefan39/mite-mcp-server` (`server.json`), with the npm package and the Claude Desktop bundle.
- Release workflow: every published GitHub release attaches the bundle and publishes to npm (trusted publishing, no stored token) and to the MCP Registry.

## [0.5.0] - 2026-10-29

### Added

- Claude Desktop bundle (`.mcpb`): install with a double click and configure in the extension settings — mite account, API key (stored securely, shown masked), switches "Zeiteinträge schreiben erlauben" and "Stammdaten verwalten" (both off by default) and an optional tool allowlist. CI builds the bundle and attaches it to every published release.
- `MITE_ALLOW_WRITE` and `MITE_ALLOW_ADMIN` (`true`/`false`) as an alternative to `MITE_MODE`; admin includes writing. `MITE_MODE` combined with a switch set to `true` is refused.

### Changed

- Configuration values that are empty or still an unresolved `${…}` placeholder count as unset.

## [0.4.0] - 2026-10-28

### Added

- Elicitation: if the MCP client supports it, every call with a valid `confirm_token` (all `mite_delete_*` tools, and `force: true` on time entries) additionally asks the human with a short summary. Only on accept is the token used and the request sent; decline or cancel executes nothing and leaves the token unused. Clients without elicitation keep the token flow only.

### Fixed

- `mite_tracker_status`: the text no longer reads as if the entry had been running for its total duration; it says the tracker runs since `since` and the entry now has the given minutes in total. Structured content is unchanged.
- Update messages of `mite_update_customer`, `mite_update_project`, `mite_update_service` and `mite_update_time_entry` name the new value of each field (`archived = false (restored)`), so archiving and restoring differ; long values such as `note` are shortened to 80 characters.

## [0.3.0] - 2026-10-28

First release. Version numbers 0.1 and 0.2 were milestones that were never tagged.

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
- mite API client with polite throttling, retries (reads on 429 and 5xx, writes on 429 only, because mite may have processed a write that answered 5xx) and API-key redaction.

[Unreleased]: https://github.com/Stefan39/mite-mcp-server/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/Stefan39/mite-mcp-server/compare/v0.5.0...v1.0.0
[0.5.0]: https://github.com/Stefan39/mite-mcp-server/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/Stefan39/mite-mcp-server/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/Stefan39/mite-mcp-server/releases/tag/v0.3.0
