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

| Tool                            | Mode      | What it does                                                                                                 |
| ------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------ |
| `mite_whoami`                   | read-only | Account, your user and role, server mode and enabled tools                                                   |
| `mite_report_projects_by_month` | read-only | Hours and revenue per project and month for a period; filters for customer, project, service, user, billable |

More tools (time entries, master data, more reports, writing with confirmation) are planned — see [the architecture decision](docs/adr/0001-architecture.md).

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
