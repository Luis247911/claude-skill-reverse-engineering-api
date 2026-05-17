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

## Setup

```bash
git clone https://github.com/Luis247911/claude-skill-reverse-engineering-api.git
cd claude-skill-reverse-engineering-api
npm install
npm test
```

## Workflow: from your webapp to a typed client

You have a webapp that has no documented API. You log in, do something in the UI, and want to script the same action. Pick the path that matches what you have.

### Path A: HAR file (no Claude Code needed)

The most direct path. Works on any operating system, no MCP setup.

1. **Open the webapp** in Chrome (or any Chromium browser) and log in.
2. **Open DevTools** (F12), go to the **Network** tab, click the round record button if it is not red.
3. **Clear the network log** (the ⊘ icon).
4. **Do the one UI action** you want to model. Just that one. Do it 2-3 times with slightly different inputs so the kit can tell required fields from optional ones.
5. **Right-click any row in the Network panel → "Save all as HAR with content"**. Save to `captures/my-run.har`.
6. **Create a small driver script** at `scripts/my-run.ts`:

```ts
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadHar } from "../src/capture/har-loader.js";
import { analyze, generate } from "../src/core/orchestrator.js";

const runId = "my-run";
const exchanges = loadHar(readFileSync(`captures/${runId}.har`, "utf-8"));

const result = analyze({
  exchanges,
  metadata: {
    runId,
    scope: "create candidate and attach to job",
    startedAt: new Date().toISOString(),
    targetBaseUrl: "https://app.your-tool.example",
    captureSource: "har",
  },
});

const out = generate(result);
const dir = resolve("out", runId);
mkdirSync(resolve(dir, "tests"), { recursive: true });
writeFileSync(resolve(dir, "client.ts"), out.clientTs);
writeFileSync(resolve(dir, "types.ts"), out.typesTs);
writeFileSync(resolve(dir, "errors.ts"), out.errorsTs);
writeFileSync(resolve(dir, "api-map.md"), out.apiMapMd);
writeFileSync(resolve(dir, "tests", "client.spec.ts"), out.testsTs);
console.log(`Wrote ${result.mutations.length} mutations to ${dir}`);
```

7. **Run it:**

```bash
npx tsx scripts/my-run.ts
```

The five files land in `out/my-run/`. Both the HAR and the output are gitignored.

### Path B: cURL strings copied from DevTools

Same as Path A but you copy individual requests instead of exporting the whole HAR.

1. In DevTools → Network, right-click the request that does the actual mutation → **Copy → Copy as cURL (bash)**.
2. Repeat 2-3 times for the same action with different inputs.
3. Replace step 6 of Path A with:

```ts
import { parseCurl } from "../src/capture/curl-parser.js";

const exchanges = [
  parseCurl(`curl 'https://app.your-tool.example/api/candidates' ...`, "req-1"),
  parseCurl(`curl 'https://app.your-tool.example/api/candidates' ...`, "req-2"),
  parseCurl(`curl 'https://app.your-tool.example/api/candidates' ...`, "req-3"),
];
```

### Path C: live capture inside Claude Code (Chrome DevTools MCP)

If you use Claude Code with the Chrome DevTools MCP server, the skill drives the browser for you.

1. Open Claude Code in this repo or any project, with the Chrome DevTools MCP enabled.
2. Type `/reverse-engineer`. The skill wizard asks for scope, target URL, and capture source. Pick "live (Chrome MCP)".
3. The wizard opens the target page, you log in, you do the UI action. The skill captures every network exchange, sanitises it, runs the analysis pipeline, and writes the client into `out/<run-id>/`.

## Using the generated client in your own project

Copy `out/<run-id>/client.ts`, `types.ts`, and `errors.ts` into your application. Then:

```ts
import { ApiClient } from "./api/client.js";

const api = new ApiClient({
  baseUrl: "https://app.your-tool.example",
  defaultHeaders: {
    // Whatever your webapp uses. The kit does not capture your session.
    Authorization: `Bearer ${process.env.APP_TOKEN}`,
    "X-CSRF-Token": process.env.APP_CSRF ?? "",
  },
});

const candidate = await api.createCandidate({
  firstName: "Max",
  lastName: "Muster",
  email: "max@example.com",
});
```

The kit does not capture or replay your auth for you. You bring `Authorization`, `Cookie`, `X-CSRF-Token`, or whatever the target expects, via `defaultHeaders` or a custom `fetchImpl`. See `docs/USAGE.md` for the Playwright `storageState` pattern when you want to share a logged-in browser session with the client.

## See it work first

Before pointing the kit at a real target, verify it runs end-to-end on your machine against an open sandbox (real network, no auth):

```bash
npx tsx scripts/e2e-dummyjson.ts
```

That run hits `dummyjson.com` six times (POST /posts/add, PUT /posts/1, DELETE /posts/1), writes a sanitised HAR to `captures/<run-id>/raw.har`, generates a client into `out/<run-id>/`, and smoke-tests one generated method. Use it as a known-good reference for what the output should look like.

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
