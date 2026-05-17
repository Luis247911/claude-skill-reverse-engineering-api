# Architecture

A reverse-engineering run is a pipeline with seven phases. Each phase has typed inputs and outputs; nothing is "magic".

```
Scope -> Capture -> Classify -> (PayloadDiff || Trace || Model) -> Workflow -> Verify -> Generate
```

## Modules

| Layer | Module | Responsibility |
|-------|--------|----------------|
| Capture | `src/capture/chrome-mcp-capture.ts` | Adapt Chrome DevTools MCP output to `CapturedExchange` |
| Capture | `src/capture/har-loader.ts` | Parse HAR 1.2 files |
| Capture | `src/capture/curl-parser.ts` | Parse `curl ...` command strings |
| Capture | `src/capture/sanitizer.ts` | Header / cookie / JWT / email redaction before write |
| Analyze | `src/analyze/request-classifier.ts` | `RequestKind` heuristic |
| Analyze | `src/analyze/payload-diff.ts` | Mark fields as required / optional / constant |
| Analyze | `src/analyze/dynamic-value-tracer.ts` | Find CSRF / JWT / IDs and trace their origin |
| Analyze | `src/analyze/response-modeler.ts` | JSON sample -> `InferredType` (TS-AST-ish) |
| Analyze | `src/analyze/workflow-rebuilder.ts` | Build DAG of mutations from data dependencies |
| Verify | `src/verify/replay.ts` | Send minimal request via Playwright APIRequestContext |
| Generate | `src/generate/client-gen.ts` | Emit `client.ts` (`ApiClient` class) |
| Generate | `src/generate/types-gen.ts` | Emit interfaces from `InferredType` |
| Generate | `src/generate/errors-gen.ts` | Emit `ApiError` hierarchy + `classifyApiError()` |
| Generate | `src/generate/api-map-gen.ts` | Emit endpoint markdown doc |
| Generate | `src/generate/tests-gen.ts` | Emit vitest cases with mocked fetch |
| Core | `src/core/orchestrator.ts` | `analyze()` + `generate()` glue |
| Core | `src/core/types.ts` | All shared shapes |
| Core | `src/core/errors.ts` | Error class hierarchy |
| Agents | `src/agents/*.md` | System prompts for the six subagents |

## Data flow

1. `CapturedExchange[]` enters from one of three capture sources.
2. The sanitizer rewrites it in place (headers, bodies, URLs) before anything else runs.
3. The classifier annotates each exchange with a `RequestKind`.
4. `buildMutations` groups exchanges by `{ method, pathTemplate }`, then for each group:
   - `diffPayloads()` produces a `PayloadSchema`
   - `traceDynamicValues()` produces `DynamicValue[]` with origins
   - `inferType()` + `mergeTypes()` produce the `responseType`
5. `rebuildWorkflow()` produces a topologically sorted `Workflow` from the DAG of value origins.
6. `replayMutation()` (optional) sends the minimal request via Playwright `APIRequestContext`, sharing cookies with a logged-in browser context (methode.txt §23).
7. `generate(result)` emits five output strings; the orchestrator (or skill wrapper) writes them under `out/<run-id>/`.

## Why no real persistence layer?

Per-run state is small (one HAR, one set of generated files). The orchestrator runs in-memory; the skill writes the artefacts to disk. There is no DB, no global state, no migrations. If a run is interrupted, just re-run.
