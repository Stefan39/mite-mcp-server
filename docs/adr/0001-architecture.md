# ADR 0001: Architecture, tool layout and safety layer

- Status: accepted
- Date: 2026-10-22

## Context

Claude and other agents should be able to control mite and pull reports from it. Agents are bad at summing up hundreds of raw time entries, and write access to time tracking is sensitive: it is the basis for invoices. mite already checks every request against the role of the API key (time tracker, coworker, admin, owner).

Existing MCP servers for mite are small, cover booking or master data only, and offer neither reports nor a safety layer.

## Decision

### Stack and distribution

- TypeScript on the official MCP SDK v2 (`@modelcontextprotocol/server`), zod 4, Node.js ≥ 22.
- Transport stdio first; Streamable HTTP and hosted operation later.
- Distribution via npm (`npx -y mite-mcp-server`), later additionally as an MCP bundle (`.mcpb`) for one-click install in Claude Desktop.

### Tool layout

Tool names are prefixed with `mite_` and use snake_case. Every tool sets MCP annotations so clients can ask the user where appropriate.

| Group                                   | Mode      | Tools                                                                                                                                                                                        |
| --------------------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity                                | read-only | `mite_whoami` ✅                                                                                                                                                                             |
| Reports (aggregated on the mite server) | read-only | `mite_report_projects_by_month` ✅, `mite_report` (generic `group_by`), `mite_report_budget`, `mite_report_billable_ratio`                                                                   |
| Read                                    | read-only | `mite_list_time_entries` (default limit 100, `has_more`), `mite_get_time_entry`, `mite_list_customers`, `mite_list_projects`, `mite_list_services`, `mite_list_users`, `mite_tracker_status` |
| Write                                   | write     | `mite_create_time_entry`, `mite_update_time_entry`, `mite_delete_time_entry` ✅ (confirmation), `mite_start_tracker`, `mite_stop_tracker`                                                    |
| Master data                             | admin     | create, update and archive customers, projects and services; delete only with confirmation ✅                                                                                                |

✅ = implemented. Bookmarks, the changes feed and user management are out of scope for 0.x.

### Safety layer

No second role model next to mite. mite decides through the role of the key; this server only **narrows** what the key could do:

1. **Mode** `MITE_MODE=read-only|write|admin`, default `read-only`. Tools above the mode are not registered at all — the agent never sees them, so an instruction injected through data cannot call them.
2. **Allowlist** `MITE_TOOLS` narrows further. It can never widen the mode.
3. **Confirmation for destructive actions** (implemented for all `mite_delete_*` tools and `force: true` ✅): deleting and bulk changes run in two steps. The first call (or `dry_run: true`) returns a preview and a short-lived confirmation token (HMAC over tool name and arguments, 5 minutes). Only a second call with that token executes. Where the client announces the elicitation capability, the human is asked as well (implemented ✅): a call with a valid token first checks the token without using it, then asks with a short summary; only on accept is the token consumed and the request sent. Decline or cancel executes nothing and leaves the token unused until it expires. Clients without elicitation get the token flow only.
4. **Locked entries** (implemented ✅): `force` is never set automatically, not even after a 423; it is only part of the input schema of `mite_update_time_entry` and `mite_delete_time_entry` in `admin` mode, and `force: true` always needs a `confirm_token`.

### Security and output

- `MITE_ACCOUNT` and `MITE_API_KEY` come from the environment only. The key is sent as header `X-MiteApiKey`, never as query parameter, and is redacted from every error message.
- Logs go to stderr only; stdout belongs to the protocol.
- `User-Agent: mite-mcp-server/<version> (+repo URL)`, as mite asks for.
- Text from mite (notes, names) is untrusted input: quoted in text output and labelled as data.
- Output is limited: aggregates instead of raw lists where possible, default limits for lists.
- The client keeps a minimum gap between requests and retries 429/5xx with backoff (mite documents no rate limit).

## Consequences

- Trying the server is safe: it reads only unless the user opts in to writing.
- Reports work for whole years without the agent reading single entries.
- The token flow costs one extra call when deleting, but no deletion can come from a single (possibly injected) instruction.
- The PHP MiteBundle is not reused; the API client is small.
