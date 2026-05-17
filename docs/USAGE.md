# Usage

There are two ways to drive the kit: from Claude Code (recommended) or programmatically.

## From Claude Code

Type `/reverse-engineering-api` (or any trigger phrase from the skill's `description`) in a Claude Code session. The skill at `~/.claude/skills/reverse-engineering-api/SKILL.md` walks through seven phases:

1. **Scope** — Claude asks what UI action to model, target base URL, capture source.
2. **Capture** — live via Chrome DevTools MCP, or you paste a HAR / cURL.
3. **Classify** — heuristic + LLM second opinion on `unknown` exchanges.
4. **Parallel analyse** — three subagents in parallel: payload-diff, value-trace, response-model.
5. **Workflow** — narrative description of the request chain.
6. **Verify** — replay the minimal request via Playwright `APIRequestContext` (optional, only with `storageState`).
7. **Generate** — `client.ts`, `types.ts`, `errors.ts`, `api-map.md`, `tests/`.

Outputs land in `out/<run-id>/`; captures in `captures/<run-id>/`; scope notes in `scope/<run-id>.md`. All three are gitignored.

## Programmatically

```ts
import { readFileSync } from "node:fs";
import { loadHar } from "./src/capture/har-loader.js";
import { analyze, generate } from "./src/core/orchestrator.js";

const exchanges = loadHar(readFileSync("./samples/public/jsonplaceholder.har", "utf-8"));

const result = analyze({
  exchanges,
  metadata: {
    runId: "demo-1",
    scope: "create + update post on jsonplaceholder",
    startedAt: new Date().toISOString(),
    targetBaseUrl: "https://jsonplaceholder.typicode.com",
    captureSource: "har",
  },
});

const out = generate(result);

console.log(out.apiMapMd);
// fs.writeFileSync("out/demo-1/client.ts", out.clientTs); etc.
```

## Replay (optional)

```ts
import { replayMutation } from "./src/verify/replay.ts";

const result = await replayMutation(result.mutations[0], {
  baseUrl: "https://app.example.com",
  storageStatePath: "./captures/demo-1/auth.private.json",
});

if (!result.matchesOriginal) {
  console.warn("Drift:", result.driftReasons);
}
```

## Tests

```bash
npm test               # all unit + e2e tests
npm run lint           # tsc strict-mode
```
