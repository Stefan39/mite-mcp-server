# mite-mcp-server

[![CI](https://github.com/Stefan39/mite-mcp-server/actions/workflows/ci.yml/badge.svg)](https://github.com/Stefan39/mite-mcp-server/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**English** · [Deutsch](README.de.md)

Ask Claude about your [mite](https://mite.de) time tracking — "How many hours did we spend on each project per month this year, and what did that earn?" — and get the answer from a report mite computes itself, not from hundreds of entries the model has to add up.

> Unofficial. Not affiliated with or endorsed by mite GmbH.

## Why this server

- **Ready-made reports.** mite groups on the server (`group_by`), so a whole year is one request and one small answer.
- **Safe by default.** Starts read-only. Write tools only exist when you switch the mode on, and an allowlist narrows it further. Tools outside mode and allowlist are not even shown to the agent.
- **Your key stays yours.** API key from the environment only, sent as header, removed from every error message, never logged.

## Tools

| Tool                            | Mode      | What it does                                                                                                                |
| ------------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------- |
| `mite_whoami`                   | read-only | Account, your user and role, server mode and enabled tools                                                                  |
| `mite_report_projects_by_month` | read-only | Hours and revenue per project and month for a period; filters for customer, project, service, user, billable                |
| `mite_report`                   | read-only | Hours, revenue and share per 1–3 groupings (customer, project, service, user, day, week, month, year); same filters         |
| `mite_report_budget`            | read-only | Budget, consumption, remaining and percent used per project over its whole life; minutes in hours, cents in currency units  |
| `mite_report_billable_ratio`    | read-only | Billable and non-billable hours and billable share in percent for a period, optionally per customer, project, user or month |
| `mite_list_time_entries`        | read-only | Single time entries for a period, newest first; filters, `limit`/`page`, `has_more`                                         |
| `mite_get_time_entry`           | read-only | One time entry by id                                                                                                        |
| `mite_tracker_status`           | read-only | Whether the tracker is running, and on which entry                                                                          |
| `mite_list_customers`           | read-only | Customers, active or archived (`archived: true`)                                                                            |
| `mite_list_projects`            | read-only | Projects with customer and budget, active or archived                                                                       |
| `mite_list_services`            | read-only | Services, active or archived                                                                                                |
| `mite_list_users`               | read-only | Users and roles (no email, no rates), active or archived                                                                    |
| `mite_delete_time_entry`        | write     | Deletes a time entry in two steps with a confirmation token (see below); locked entries are refused                         |

### Deleting with a confirmation token

`mite_delete_time_entry` never deletes on the first call:

1. Call it with the entry `id` (or with `dry_run: true`). It returns a preview of the entry and a `confirm_token`; nothing is deleted.
2. Call it again with the same `id` and the `confirm_token`. Only then is the entry deleted.

The token is bound to the tool and its arguments, valid for 5 minutes, usable once, and only known to the running server process (a restart invalidates it). Locked entries cannot be deleted; there is no `force` option.

More tools (create/update, master data, more reports) are planned — see [the architecture decision](docs/adr/0001-architecture.md).

## Quickstart (Claude Desktop)

Requirements: Node.js 22 or newer, a mite account with API access enabled (enable it in your mite user settings), and your API key from there.

> The package is not published on npm yet. Until it is, build it from source:
>
> ```bash
> git clone https://github.com/Stefan39/mite-mcp-server.git
> cd mite-mcp-server && npm ci && npm run build
> ```

Add the server to `claude_desktop_config.json` (macOS: `~/Library/Application Support/Claude/`), then restart Claude Desktop:

```json
{
  "mcpServers": {
    "mite": {
      "command": "node",
      "args": ["/absolute/path/to/mite-mcp-server/dist/index.js"],
      "env": {
        "MITE_ACCOUNT": "your-account",
        "MITE_API_KEY": "your-api-key"
      }
    }
  }
}
```

Then ask, for example: _"Show me hours and revenue per project and month for this year."_

## Configuration

| Variable       | Required | Meaning                                                         |
| -------------- | -------- | --------------------------------------------------------------- |
| `MITE_ACCOUNT` | yes      | Account name — the subdomain of `https://<account>.mite.de`     |
| `MITE_API_KEY` | yes      | Your personal mite API key                                      |
| `MITE_MODE`    | no       | `read-only` (default), `write` or `admin`                       |
| `MITE_TOOLS`   | no       | Comma-separated allowlist, e.g. `mite_report_projects_by_month` |

mite still checks every call against the role of your key. The server can only restrict that, never extend it.

## Development

```bash
npm ci
npm run check   # lint, format, typecheck, tests with coverage, build
```

See [CONTRIBUTING.md](CONTRIBUTING.md) and the [architecture decision](docs/adr/0001-architecture.md).

## License

[MIT](LICENSE) © Stefan Jacomeit — [www.jacomeit.de](https://www.jacomeit.de)
