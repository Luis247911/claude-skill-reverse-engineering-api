# reverse-engineering-kit

Turns the network traffic of a webapp UI into a typed TypeScript API client by observing how the UI actually talks to its backend. It is not a scraper, an automation framework, or a way to access systems you do not own.

## When to use this

- You operate an internal webapp without a documented API and want to script against it.
- A vendor's SaaS tool has a UI but no public API, and you want to automate parts of *your own* tenant.
- A customer project gives you written access to a system whose backend was never specified.
- A legacy tool exists, no OpenAPI was ever written, and you need a stable integration.

## When NOT to use this

- The platform already publishes a documented API. Use an MCP server for that platform, or generate a client from its OpenAPI spec.
- You want to automate a third-party platform without authorization. The kit will not stop you, but you should stop yourself.
- You need to bypass authentication, captchas, rate limits, or other access controls. None of that is implemented here, and adding it is outside the kit's scope.

## How this differs from MCP builders and OpenAPI generators

| Approach | Input | Works when |
|----------|-------|------------|
| MCP server builder | Documented API spec | Vendor publishes a spec |
| OpenAPI / Swagger generator | OpenAPI document | Backend team maintains an OpenAPI document |
| `reverse-engineering-kit` | Network traffic from a real session | Neither of the above exists |

The first two trust a written contract. This kit trusts only what the UI actually does on the wire. That is the right tool when no contract was ever written down, and the wrong tool when one was.

## Three concrete scenarios

- You use an internal ATS that never exposed an API. You have an HR CSV and want to import candidates programmatically. Capture the "create candidate" UI action, generate a typed `createCandidate()` client, run it against the same ATS you log in to every day.
- Your team built an admin UI on top of a legacy backend. You want to write a weekly cleanup job. Capture the relevant admin actions, generate a small client, schedule the job.
- A SaaS tool you pay for in Pro plan offers a UI but no API. You want to export your own data on a schedule. Capture the export flow once, generate a client, run the export from CI.

## Pipeline

```
Scope -> Capture -> Classify -> (PayloadDiff || Trace || Model) -> Workflow -> Verify -> Generate
```

Each phase has typed inputs and outputs. Capture sources are pre-recorded HAR, pasted cURL, or a live Chrome DevTools MCP session. The orchestrator sanitises captures before anything else runs (headers, cookies, JWT-shaped values, emails). See `docs/ARCHITECTURE.md` for module-level detail.

The underlying 30-step methodology lives in `methode.txt` (German).

## Output per run

For each run the orchestrator writes five files under `out/<run-id>/`:

- `client.ts`: `ApiClient` class with one method per detected mutation
- `types.ts`: request and response interfaces inferred from sample payloads and responses
- `errors.ts`: `ApiError` hierarchy plus `classifyApiError(status, body)`
- `api-map.md`: endpoint summary, payload fields, workflow ordering
- `tests/client.spec.ts`: vitest cases with a mocked `fetch`

## Quick start

```bash
npm install
npm test
```

End-to-end against an open sandbox (real network, no auth):

```bash
npx tsx scripts/e2e-dummyjson.ts
```

That run hits `dummyjson.com` six times (3x POST /posts/add, 2x PUT /posts/1, 1x DELETE /posts/1), writes a sanitised HAR to `captures/<run-id>/raw.har`, generates a client into `out/<run-id>/`, and smoke-tests one generated method against the live sandbox.

The same pipeline runs inside Claude Code via the `reverse-engineering-api` skill, which adds a wizard for scope, source, and verification.

## Privacy and GitHub mode

This repo is dual-use. The kit source is public; your runs stay local.

| Path | Tracked in Git | Reason |
|------|----------------|--------|
| `src/`, `tests/`, `docs/`, `samples/public/`, `scripts/` | Yes | Kit source, demos, methodology |
| `captures/` | No (except `.gitkeep`) | Live captures may contain auth, tenant data, real records |
| `out/` | No (except `.gitkeep`) | Generated clients embed endpoint paths and field names from private systems |
| `scope/` | No (except `.gitkeep`) | Run-specific scope notes may name internal projects or customers |
| `*.har` outside `samples/public/` | No | HAR files always carry headers and bodies |

The sanitiser (`src/capture/sanitizer.ts`) replaces `Authorization`, `Cookie`, `Set-Cookie`, `X-CSRF-Token`, `X-Api-Key`, JWT-shaped values, and emails before any capture is written to disk. See `docs/PRIVACY.md` for the full contract and pre-push checklist.

## Repo layout

| Path | Purpose | Git? |
|------|---------|------|
| `src/` | Kit source: analyzers, generators, capture adapters | tracked |
| `tests/` | Unit and e2e tests against public fixtures | tracked |
| `samples/public/` | Curated demo HARs against open sandboxes | tracked |
| `scripts/` | Demo and e2e runners | tracked |
| `docs/` | Architecture, privacy, methodology | tracked |
| `captures/` | Your live capture runs | ignored |
| `out/` | Generated clients per run | ignored |
| `scope/` | Your per-run scope notes | ignored |

## License

MIT. See `LICENSE`.
