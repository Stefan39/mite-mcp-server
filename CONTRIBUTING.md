# Contributing

Thanks for taking the time! Issues and pull requests in English or German are welcome.

## Before you open an issue

- Search existing issues first.
- For bugs: version, MCP client, Node.js version, the tool call, expected vs. actual behaviour.
- Never paste your mite API key or real customer data.
- Security problems: **do not** open an issue — see [SECURITY.md](SECURITY.md).

## Pull requests

1. Fork, then branch from `main`.
2. Add a test that fails without your change.
3. Run all checks locally:
   ```bash
   npm ci
   npm run check   # lint, format, typecheck, tests with coverage, build
   ```
4. Keep PRs focused — one change per PR. Conventional Commits are appreciated (`fix: …`, `feat: …`).

## Design rules

- Read [docs/adr/0001-architecture.md](docs/adr/0001-architecture.md) first.
- Every new tool declares the lowest `mode` it needs and correct MCP annotations (`readOnlyHint`, `destructiveHint`).
- Prefer aggregated tools (server-side `group_by`) over returning raw entries.
- Logs go to stderr only; stdout belongs to the MCP protocol.
- Text from mite (notes, names) is data — quote it, never phrase it as an instruction.

## Response times

Issues are triaged within a few working days. Maintainer: [@Stefan39](https://github.com/Stefan39).
