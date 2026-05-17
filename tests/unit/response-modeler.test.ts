import { describe, expect, it } from "vitest";
import { inferType, mergeTypes } from "../../src/analyze/response-modeler.js";

describe("inferType", () => {
  it("infers string formats", () => {
    expect(inferType("max@example.com")).toEqual({ kind: "string", format: "email" });
    expect(inferType("https://x.io/y")).toEqual({ kind: "string", format: "url" });
    expect(inferType("2026-05-17T10:00:00Z")).toEqual({ kind: "string", format: "iso-date" });
    expect(inferType("550e8400-e29b-41d4-a716-446655440000")).toEqual({
      kind: "string",
      format: "uuid",
    });
  });

  it("infers numbers as integer or float", () => {
    expect(inferType(42)).toEqual({ kind: "number", isInteger: true });
    expect(inferType(3.14)).toEqual({ kind: "number", isInteger: false });
  });

  it("infers object with required fields", () => {
    const t = inferType({ id: 1, name: "Max", phone: null });
    expect(t.kind).toBe("object");
    if (t.kind === "object") {
      expect(t.required.sort()).toEqual(["id", "name"]);
      expect(t.properties.phone).toEqual({ kind: "null" });
    }
  });

  it("infers array items as merged union", () => {
    const t = inferType([1, "x"]);
    expect(t.kind).toBe("array");
  });
});

describe("mergeTypes", () => {
  it("merges identical types into one", () => {
    const t = mergeTypes([
      { kind: "number", isInteger: true },
      { kind: "number", isInteger: true },
    ]);
    expect(t).toEqual({ kind: "number", isInteger: true });
  });

  it("merges object types with different field sets", () => {
    const t = mergeTypes([
      { kind: "object", properties: { a: { kind: "number", isInteger: true } }, required: ["a"] },
      {
        kind: "object",
        properties: {
          a: { kind: "number", isInteger: true },
          b: { kind: "string" },
        },
        required: ["a", "b"],
      },
    ]);
    expect(t.kind).toBe("object");
    if (t.kind === "object") {
      expect(t.required).toEqual(["a"]);
      expect(Object.keys(t.properties).sort()).toEqual(["a", "b"]);
    }
  });
});
