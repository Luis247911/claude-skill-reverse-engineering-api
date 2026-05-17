import { describe, expect, it } from "vitest";
import { parseCurl } from "../../src/capture/curl-parser.js";

describe("parseCurl", () => {
  it("parses a basic POST with JSON body", () => {
    const curl = `curl 'https://app.example.com/api/candidates' \\
      -X POST \\
      -H 'content-type: application/json' \\
      -H 'x-csrf-token: 8f3a1' \\
      --data-raw '{"firstName":"Max","lastName":"Muster","email":"max@example.com"}'`;
    const exchange = parseCurl(curl);
    expect(exchange.request.method).toBe("POST");
    expect(exchange.request.url).toBe("https://app.example.com/api/candidates");
    expect(exchange.request.headers.find((h) => h.name.toLowerCase() === "x-csrf-token")?.value).toBe(
      "8f3a1",
    );
    expect(exchange.request.body?.kind).toBe("json");
    if (exchange.request.body?.kind === "json") {
      expect(exchange.request.body.data).toEqual({
        firstName: "Max",
        lastName: "Muster",
        email: "max@example.com",
      });
    }
  });

  it("defaults to GET when no method and no body", () => {
    const exchange = parseCurl(`curl https://api.example.com/users`);
    expect(exchange.request.method).toBe("GET");
  });

  it("infers POST when --data is given without -X", () => {
    const exchange = parseCurl(`curl https://api.example.com/x --data 'a=1&b=2'`);
    expect(exchange.request.method).toBe("POST");
    expect(exchange.request.body?.kind).toBe("text");
  });

  it("merges -b cookies into a Cookie header", () => {
    const exchange = parseCurl(`curl https://x.io/y -b 'session=abc; csrf=def'`);
    const cookieHeader = exchange.request.headers.find((h) => h.name.toLowerCase() === "cookie");
    expect(cookieHeader?.value).toBe("session=abc; csrf=def");
  });

  it("parses query params into the query map", () => {
    const exchange = parseCurl(`curl 'https://api.example.com/list?page=2&size=10'`);
    expect(exchange.request.query).toEqual({ page: "2", size: "10" });
  });

  it("throws when no URL is present", () => {
    expect(() => parseCurl(`curl -X POST`)).toThrow(/No URL/);
  });
});
