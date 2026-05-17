import { describe, expect, it } from "vitest";
import { adaptMcpRequest } from "../../src/capture/chrome-mcp-capture.js";

describe("adaptMcpRequest", () => {
  it("adapts a POST with JSON body and JSON response", () => {
    const exchange = adaptMcpRequest(
      {
        requestId: "req-1",
        url: "https://app.example.com/api/candidates?source=ui",
        method: "POST",
        request: {
          headers: { "Content-Type": "application/json", "x-csrf-token": "abc" },
          postData: '{"firstName":"Max"}',
        },
        response: {
          status: 201,
          statusText: "Created",
          headers: { "Content-Type": "application/json" },
          body: '{"id":"cand_1"}',
          durationMs: 42,
        },
      },
      "fallback",
    );
    expect(exchange.request.id).toBe("req-1");
    expect(exchange.request.method).toBe("POST");
    expect(exchange.request.query).toEqual({ source: "ui" });
    expect(exchange.request.body?.kind).toBe("json");
    if (exchange.request.body?.kind === "json") {
      expect(exchange.request.body.data).toEqual({ firstName: "Max" });
    }
    expect(exchange.response?.status).toBe(201);
    expect(exchange.response?.durationMs).toBe(42);
  });

  it("falls back to the supplied id when MCP omits requestId", () => {
    const exchange = adaptMcpRequest(
      {
        requestId: "",
        url: "https://x.io/y",
        method: "GET",
        request: {},
      },
      "fallback-99",
    );
    expect(exchange.request.id).toBe("fallback-99");
  });

  it("throws on invalid URL", () => {
    expect(() =>
      adaptMcpRequest(
        { requestId: "r", url: "not a url", method: "GET", request: {} },
        "f",
      ),
    ).toThrow(/Invalid URL/);
  });
});
