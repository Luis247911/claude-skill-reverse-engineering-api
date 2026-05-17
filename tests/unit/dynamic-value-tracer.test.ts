import { describe, expect, it } from "vitest";
import { traceDynamicValues } from "../../src/analyze/dynamic-value-tracer.js";
import type { CapturedExchange } from "../../src/core/types.js";

function ex(partial: Partial<CapturedExchange["request"]> & { response?: CapturedExchange["response"] }): CapturedExchange {
  const { response, ...req } = partial;
  return {
    request: {
      id: "r",
      method: "POST",
      url: "https://app.example.com/api/x",
      origin: "https://app.example.com",
      pathname: "/api/x",
      query: {},
      headers: [],
      contentType: null,
      body: null,
      startedAt: "2026-01-01T00:00:00Z",
      ...req,
    },
    response: response ?? null,
    kind: "mutation",
  };
}

describe("traceDynamicValues", () => {
  it("detects CSRF token in header", () => {
    const target = ex({
      headers: [{ name: "X-CSRF-Token", value: "abc123def456" }],
    });
    const dv = traceDynamicValues(target, []);
    expect(dv.find((d) => d.kind === "csrf")).toBeDefined();
  });

  it("detects JWT in Authorization Bearer", () => {
    const target = ex({
      headers: [
        {
          name: "Authorization",
          value: "Bearer eyJhbGciOi1234.eyJzdWIi5678.SflKxAB9_token",
        },
      ],
    });
    const dv = traceDynamicValues(target, []);
    expect(dv.find((d) => d.kind === "jwt")).toBeDefined();
  });

  it("detects ID-prefixed entity id in body and URL", () => {
    const target = ex({
      url: "https://app.example.com/api/candidates/cand_987abc/attach",
      pathname: "/api/candidates/cand_987abc/attach",
      body: { kind: "json", data: { jobId: "job_123xyz" }, raw: '{"jobId":"job_123xyz"}' },
    });
    const dv = traceDynamicValues(target, []);
    expect(dv.find((d) => d.kind === "entity-id" && d.location.kind === "url-segment")).toBeDefined();
    expect(
      dv.find((d) => d.kind === "entity-id" && d.location.kind === "body"),
    ).toBeDefined();
  });

  it("traces origin to a previous response that returned the value", () => {
    const history = [
      ex({
        id: "r1",
        method: "GET",
        url: "https://app.example.com/api/jobs",
        pathname: "/api/jobs",
        response: {
          status: 200,
          statusText: "OK",
          headers: [{ name: "Content-Type", value: "application/json" }],
          contentType: "application/json",
          body: {
            kind: "json",
            data: { jobs: [{ id: "job_123xyz", title: "engineer" }] },
            raw: "",
          },
          durationMs: 10,
        },
      }),
    ];
    const target = ex({
      body: { kind: "json", data: { jobId: "job_123xyz" }, raw: '{"jobId":"job_123xyz"}' },
    });
    const dv = traceDynamicValues(target, history);
    const bodyDv = dv.find((d) => d.location.kind === "body");
    expect(bodyDv?.origin.kind).toBe("previous-response");
  });

  it("detects session cookie", () => {
    const target = ex({
      headers: [{ name: "Cookie", value: "session=abcdefghij1234567890; other=x" }],
    });
    const dv = traceDynamicValues(target, []);
    expect(dv.find((d) => d.kind === "session-cookie")).toBeDefined();
  });
});
