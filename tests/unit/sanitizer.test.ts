import { describe, expect, it } from "vitest";
import {
  defaultSanitizerOptions,
  sanitizeBody,
  sanitizeFreeText,
  sanitizeHeaders,
  sanitizeJsonValue,
  sanitizeUrl,
} from "../../src/capture/sanitizer.js";

const opts = defaultSanitizerOptions();

describe("sanitizeHeaders", () => {
  it("redacts Authorization regardless of casing", () => {
    const out = sanitizeHeaders(
      [{ name: "Authorization", value: "Bearer abc.def.ghi-jkl-mnop-qrst" }],
      opts,
    );
    expect(out[0]!.value).toMatch(/REDACTED/);
    expect(out[0]!.value).not.toContain("abc.def.ghi");
  });

  it("redacts Cookie header", () => {
    const out = sanitizeHeaders([{ name: "cookie", value: "session=abc; csrf=def" }], opts);
    expect(out[0]!.value).toContain("REDACTED");
  });

  it("redacts X-CSRF-Token", () => {
    const out = sanitizeHeaders([{ name: "X-CSRF-Token", value: "8f3a1bcd" }], opts);
    expect(out[0]!.value).toContain("REDACTED");
  });

  it("redacts JWT-shaped values in arbitrary headers", () => {
    const jwt = "eyJhbGciOi1234.eyJzdWIiOj5678.SflKxwRJSMeKKF9";
    const out = sanitizeHeaders([{ name: "x-custom", value: jwt }], opts);
    expect(out[0]!.value).toBe("<REDACTED:JWT>");
  });

  it("leaves Content-Type alone", () => {
    const out = sanitizeHeaders([{ name: "Content-Type", value: "application/json" }], opts);
    expect(out[0]!.value).toBe("application/json");
  });
});

describe("sanitizeJsonValue", () => {
  it("redacts password fields by key", () => {
    const out = sanitizeJsonValue({ password: "hunter2", email: "a@b.com" }, opts) as Record<
      string,
      unknown
    >;
    expect(out.password).toBe("<REDACTED:VALUE>");
  });

  it("redacts emails inside string values", () => {
    const out = sanitizeJsonValue({ firstName: "Max", note: "contact me at max@example.com" }, opts) as Record<string, unknown>;
    expect(out.note).toBe("contact me at <REDACTED:EMAIL>");
    expect(out.firstName).toBe("Max");
  });

  it("recurses into nested objects and arrays", () => {
    const out = sanitizeJsonValue(
      { user: { token: "secret", profile: { email: "a@b.com" } }, list: [{ apiKey: "k" }] },
      opts,
    ) as Record<string, unknown>;
    const user = out.user as Record<string, unknown>;
    expect(user.token).toBe("<REDACTED:VALUE>");
    const list = out.list as Array<Record<string, unknown>>;
    expect(list[0]!.apiKey).toBe("<REDACTED:VALUE>");
  });

  it("redacts UUIDs only when opted in", () => {
    const input = { id: "550e8400-e29b-41d4-a716-446655440000", name: "x" };
    const off = sanitizeJsonValue(input, opts) as Record<string, unknown>;
    expect(off.id).toBe("550e8400-e29b-41d4-a716-446655440000");

    const on = sanitizeJsonValue(input, { ...opts, redactIdPatterns: true }) as Record<
      string,
      unknown
    >;
    expect(on.id).toBe("<REDACTED:UUID>");
  });
});

describe("sanitizeBody", () => {
  it("preserves form structure but cleans values", () => {
    const out = sanitizeBody(
      {
        kind: "form",
        data: { email: "a@b.com", password: "x", name: "Max" },
        raw: "email=a%40b.com&password=x&name=Max",
      },
      opts,
    );
    expect(out.kind).toBe("form");
    if (out.kind === "form") {
      expect(out.data.password).toBe("<REDACTED:VALUE>");
      expect(out.data.email).toBe("<REDACTED:EMAIL>");
      expect(out.data.name).toBe("Max");
    }
  });

  it("returns binary unchanged", () => {
    const out = sanitizeBody({ kind: "binary", sizeBytes: 12 }, opts);
    expect(out).toEqual({ kind: "binary", sizeBytes: 12 });
  });
});

describe("sanitizeUrl", () => {
  it("redacts known token query params", () => {
    const out = sanitizeUrl("https://app.example.com/api/x?access_token=abc&page=2", opts);
    expect(out).toContain("access_token=%3CREDACTED%3AVALUE%3E");
    expect(out).toContain("page=2");
  });

  it("leaves benign URLs untouched", () => {
    const url = "https://app.example.com/api/candidates?limit=25";
    expect(sanitizeUrl(url, opts)).toBe(url);
  });
});

describe("sanitizeFreeText", () => {
  it("redacts emails", () => {
    expect(sanitizeFreeText("mail max@example.com pls")).toBe("mail <REDACTED:EMAIL> pls");
  });

  it("returns single JWT as full redaction", () => {
    const jwt = "eyJhbGciOi1234.eyJzdWIiOj5678.SflKxwRJSMeKKF9";
    expect(sanitizeFreeText(jwt)).toBe("<REDACTED:JWT>");
  });
});
