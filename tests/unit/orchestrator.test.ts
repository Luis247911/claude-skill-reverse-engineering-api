import { describe, expect, it } from "vitest";
import { analyze, generate } from "../../src/core/orchestrator.js";
import type { CapturedExchange } from "../../src/core/types.js";

function ex(method: string, pathname: string, body: unknown, response?: unknown): CapturedExchange {
  return {
    request: {
      id: `req-${method}-${pathname}`,
      method: method as CapturedExchange["request"]["method"],
      url: `https://app.example.com${pathname}`,
      origin: "https://app.example.com",
      pathname,
      query: {},
      headers: [{ name: "Content-Type", value: "application/json" }],
      contentType: "application/json",
      body: body === undefined ? null : { kind: "json", data: body, raw: JSON.stringify(body) },
      startedAt: "2026-01-01T00:00:00Z",
    },
    response:
      response === undefined
        ? null
        : {
            status: 201,
            statusText: "Created",
            headers: [{ name: "Content-Type", value: "application/json" }],
            contentType: "application/json",
            body: { kind: "json", data: response, raw: JSON.stringify(response) },
            durationMs: 12,
          },
    kind: "unknown",
  };
}

describe("orchestrator", () => {
  it("produces mutations from a candidate-create capture set", () => {
    const exchanges: CapturedExchange[] = [
      ex("GET", "/api/me", undefined, { id: "user_1" }),
      ex("GET", "/api/jobs", undefined, { jobs: [{ id: "job_abc1234" }] }),
      ex("POST", "/api/candidates", { firstName: "Max", lastName: "Muster", email: "a@b.com" }, { id: "cand_xyz1234", firstName: "Max" }),
      ex("POST", "/api/candidates", { firstName: "Anna", lastName: "Test", email: "c@d.com" }, { id: "cand_xyz5678" }),
    ];
    const result = analyze({
      exchanges,
      metadata: {
        runId: "run-1",
        scope: "create candidate",
        startedAt: "2026-01-01T00:00:00Z",
        targetBaseUrl: "https://app.example.com",
        captureSource: "har",
      },
    });
    expect(result.mutations).toHaveLength(1);
    const m = result.mutations[0]!;
    expect(m.method).toBe("POST");
    expect(m.payload?.fields.find((f) => f.path === "firstName")?.role).toBe("required");
  });

  it("generates client + types + errors + api-map", () => {
    const exchanges: CapturedExchange[] = [
      ex("POST", "/api/candidates", { firstName: "Max" }, { id: "cand_1" }),
    ];
    const result = analyze({
      exchanges,
      metadata: {
        runId: "r",
        scope: "x",
        startedAt: "2026-01-01T00:00:00Z",
        targetBaseUrl: "https://app.example.com",
        captureSource: "har",
      },
    });
    const out = generate(result);
    expect(out.clientTs).toContain("createCandidate");
    expect(out.typesTs).toContain("CreateCandidateInput");
    expect(out.errorsTs).toContain("ApiError");
    expect(out.apiMapMd).toContain("# API Map");
    expect(out.testsTs).toContain("describe");
  });

  it("keeps mutations distinct when the same path template is hit with different methods", () => {
    const exchanges: CapturedExchange[] = [
      ex("PUT", "/api/posts/1", { title: "a" }, { id: 1 }),
      ex("DELETE", "/api/posts/1", undefined, { ok: true }),
      ex("POST", "/api/posts/add", { title: "b" }, { id: 2 }),
    ];
    const result = analyze({
      exchanges,
      metadata: {
        runId: "r",
        scope: "x",
        startedAt: "2026-01-01T00:00:00Z",
        targetBaseUrl: "https://app.example.com",
        captureSource: "har",
      },
    });
    const methods = result.mutations.map((m) => m.method).sort();
    expect(methods).toEqual(["DELETE", "POST", "PUT"]);
  });

  it("emits warning if no mutations are present", () => {
    const exchanges: CapturedExchange[] = [ex("GET", "/api/me", undefined, { id: "u" })];
    const result = analyze({
      exchanges,
      metadata: {
        runId: "r",
        scope: "x",
        startedAt: "2026-01-01T00:00:00Z",
        targetBaseUrl: "https://app.example.com",
        captureSource: "har",
      },
    });
    expect(result.warnings.some((w) => w.includes("No mutations"))).toBe(true);
  });
});
