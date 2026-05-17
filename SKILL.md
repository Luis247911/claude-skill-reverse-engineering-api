---
name: reverse-engineering-api
description: Reverse-engineering interner Webapp-APIs zu stabilen TypeScript-Clients. Live-Capture via Chrome DevTools MCP, HAR-Import oder cURL-Paste. Multi-Agent-Pipeline (Classify -> PayloadDiff || Trace || Model -> Workflow -> Verify -> CodeGen). Output unter out/<run-id>/ - client.ts + types.ts + errors.ts + api-map.md + tests/. Aktiviere bei "reverse engineer api", "/reverse-engineer", "/reverse-engineering-api", "api aus webapp ableiten", "har analysieren", "har in client", "internen endpoint rekonstruieren", "webapp api nachbauen", "internal api capture", "curl in client", "minimal request bauen", "request kette rekonstruieren". Das Kit lebt im selben Ordner wie diese SKILL.md (typisch ~/.claude/skills/reverse-engineering-api/). Niemals Auth/Captcha/Rate-Limits umgehen; Verantwortung fuer Berechtigung liegt beim Nutzer.
---

# Reverse-Engineering-API Skill

Du orchestrierst das `reverse-engineering-kit`, das im selben Verzeichnis wie diese `SKILL.md` liegt (typisch `~/.claude/skills/reverse-engineering-api/`). Das Kit hat die Logik; der Skill steuert die Phasen, ruft Tools und spawnt Subagents.

Alle Pfade in diesem Dokument sind relativ zum Kit-Root.

## Pflicht-Kontext

Lies in dieser Reihenfolge, bevor du etwas tust:

1. `methode.txt` — die 30-Schritte-Methodik (deutsch).
2. `docs/PRIVACY.md` — was wo gespeichert wird.
3. `src/agents/README.md` — welche Subagent-Prompts es gibt.

Alle Ausgaben pro Run gehen unter `captures/<run-id>/` (Capture), `out/<run-id>/` (generierte Files), `scope/<run-id>.md` (Scope-Notiz). Diese drei Ordner sind `.gitignore`d.

## Sieben Phasen

### Phase 1 — Scope

Frag den Nutzer mit `AskUserQuestion`:

- Welche **eine** UI-Aktion soll modelliert werden? (z.B. "Kandidat anlegen und einer Stelle zuordnen")
- Welche **Target-Base-URL**?
- **Capture-Quelle**: Live (Chrome MCP), HAR-Datei (Pfad), oder cURL (paste)?

Schreibe das Ergebnis nach `scope/<run-id>.md` und merke dir `runId = <timestamp>-<slug>`.

### Phase 2 — Capture

Je nach Quelle:

**Live (Chrome MCP):**
- `mcp__chrome-devtools__new_page` mit der Target-URL.
- Nutzer fuehrt die Aktion durch — du steuerst via `navigate_page`, `click`, `fill`, `fill_form` wo verlangt.
- `mcp__chrome-devtools__list_network_requests`, dann pro relevantem Request `mcp__chrome-devtools__get_network_request`.
- Konvertiere mit `adaptMcpRequest(detail, fallbackId)` aus `src/capture/chrome-mcp-capture.ts`.
- Mache mehrere Durchlaeufe (siehe methode.txt §6 Variation).

**HAR:** Lies die Datei, ruf `loadHar(text)` aus `src/capture/har-loader.ts`.

**cURL:** Frag den Nutzer nach den cURL-Strings (mehrere fuer Variation), ruf `parseCurl(input, id)` aus `src/capture/curl-parser.ts`.

**Vor dem Speichern**: alle Exchanges durch `sanitizeExchange(ex, defaultSanitizerOptions())` aus `src/capture/sanitizer.ts`. Schreibe sanitized HAR nach `captures/<run-id>/raw.har`.

### Phase 3 — Classify

Ruf `analyze({ exchanges, metadata })` aus `src/core/orchestrator.ts`. Das macht intern: sanitize -> classify -> mutations -> dynamic-values -> workflow.

Falls Exchanges als `unknown` klassifiziert wurden, spawne **`classifier-agent`** (siehe `src/agents/classifier-agent.md`) mit der Unknown-Liste und merge zurueck.

### Phase 4 — Parallel-Analyse

Wenn `analyze()` Mutations gefunden hat, spawne in **einer Message** die drei Subagents parallel:

- **`payload-differ-agent`** mit jeder Mutation's `payload`
- **`value-tracer-agent`** mit allen Dynamic Values, deren `origin.kind === "unknown"`
- **`response-modeler-agent`** mit jeder Mutation's `responseType` + Sample-Responses

Merge ihre Outputs in `result.mutations[]`.

### Phase 5 — Workflow narrieren

Spawne **`workflow-agent`** mit `result.workflow`. Resultat als `out/<run-id>/WORKFLOW.md`.

### Phase 6 — Replay-Verify (optional, falls Live-Capture)

Pro Mutation: ruf `replayMutation(mutation, { baseUrl, storageStatePath })` aus `src/verify/replay.ts`. Wenn `matchesOriginal === false`, zeige die `driftReasons` und frag den Nutzer ob Phase 4 wiederholt werden soll.

Speichere Storage-State (Playwright `state.json`) nur unter `captures/<run-id>/auth.private.json` (gitignored).

### Phase 7 — Generieren

Ruf `generate(result)` aus `src/core/orchestrator.ts` und schreibe:

- `out/<run-id>/client.ts`
- `out/<run-id>/types.ts`
- `out/<run-id>/errors.ts`
- `out/<run-id>/api-map.md`
- `out/<run-id>/tests/client.spec.ts`

Spawne abschliessend **`codegen-agent`** fuer einen Review-Pass — Output als `out/<run-id>/REVIEW.md`.

## Wichtige Regeln

- **Niemals** Auth/Captcha/Rate-Limits umgehen.
- **Niemals** unsanitized Captures schreiben.
- **Niemals** in `samples/public/` schreiben — das ist fuer kuratierte Open-Sandbox-Demos.
- **Niemals** ausserhalb der `captures/`, `out/`, `scope/`-Ordner private Daten ablegen.
- Bei jedem Drift in Phase 6: ehrlich melden, nicht uebergehen.
- Wenn der Nutzer nach Python fragt: TypeScript-only in v1. Punkt.
