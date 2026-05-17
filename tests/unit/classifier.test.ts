import { describe, expect, it } from "vitest";
import { classify } from "../../src/analyze/request-classifier.js";
import type { CapturedRequest } from "../../src/core/types.js";

function req(partial: Partial<CapturedRequest>): CapturedRequest {
  return {
    id: "r",
    method: "GET",
    url: "https://app.example.com/api/x",
    origin: "https://app.example.com",
    pathname: "/api/x",
    query: {},
    headers: [],
    contentType: null,
    body: null,
    startedAt: "2026-01-01T00:00:00Z",
    ...partial,
  };
}

describe("classify", () => {
  it("classifies static JS as asset", () => {
    expect(classify(req({ pathname: "/static/app.js" }))).toBe("asset");
  });

  it("classifies analytics path", () => {
    expect(classify(req({ pathname: "/api/analytics/track" }))).toBe("analytics");
  });

  it("classifies auth path", () => {
    expect(classify(req({ pathname: "/api/login", method: "POST" }))).toBe("auth");
  });

  it("classifies POST as mutation", () => {
    expect(classify(req({ pathname: "/api/candidates", method: "POST" }))).toBe("mutation");
  });

  it("classifies GET /api/me as metadata", () => {
    expect(classify(req({ pathname: "/api/me", method: "GET" }))).toBe("metadata");
  });

  it("classifies GET /api/candidates as lookup", () => {
    expect(classify(req({ pathname: "/api/candidates", method: "GET" }))).toBe("lookup");
  });

  it("classifies PATCH as mutation", () => {
    expect(classify(req({ pathname: "/api/candidates/1", method: "PATCH" }))).toBe("mutation");
  });
});
