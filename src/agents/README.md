# Subagent prompts

These markdown files are loaded by the orchestrator (or the Claude skill wrapper) and used as system prompts when spawning specialised subagents during the analysis pipeline.

| File | Used in phase | Purpose |
|------|---------------|---------|
| `classifier-agent.md` | Phase 3 | LLM second opinion on edge cases the heuristic classifier marked `unknown` |
| `payload-differ-agent.md` | Phase 4a | Cross-check `payload-diff` field roles against business meaning |
| `value-tracer-agent.md` | Phase 4b | Trace dynamic values whose origin couldn't be auto-detected |
| `response-modeler-agent.md` | Phase 4c | Name response types semantically and merge polymorphic shapes |
| `workflow-agent.md` | Phase 5 | Describe the workflow narratively and flag missing prerequisites |
| `codegen-agent.md` | Phase 7 | Review the generated client for idiomatic TS and missing edge cases |

Phase 4 (a/b/c) is intended to be **parallel** — spawn the three subagents in a single message, then merge their outputs into the `AnalysisResult`.

Each prompt is self-contained: it tells the subagent what to read, what to return, and what NOT to do (no auth bypass, no fabricated endpoints).
