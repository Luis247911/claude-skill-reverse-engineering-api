import { describe, expect, it } from "vitest";
import { diffPayloads } from "../../src/analyze/payload-diff.js";
import type { CapturedBody } from "../../src/core/types.js";

function jsonBody(data: unknown): CapturedBody {
  return { kind: "json", data, raw: JSON.stringify(data) };
}

describe("diffPayloads", () => {
  it("marks fields present in all samples as required", () => {
    const result = diffPayloads([
      jsonBody({ firstName: "Max", lastName: "Muster", email: "a@b.com" }),
      jsonBody({ firstName: "Anna", lastName: "Test", email: "c@d.com" }),
    ]);
    const roles = Object.fromEntries(result.fields.map((f) => [f.path, f.role]));
    expect(roles.firstName).toBe("required");
    expect(roles.lastName).toBe("required");
    expect(roles.email).toBe("required");
  });

  it("marks fields present in only some samples as optional", () => {
    const result = diffPayloads([
      jsonBody({ name: "Max", phone: "+49..." }),
      jsonBody({ name: "Anna" }),
    ]);
    const phone = result.fields.find((f) => f.path === "phone");
    expect(phone?.role).toBe("optional");
  });

  it("marks fields with a single repeated value as constant", () => {
    const result = diffPayloads([
      jsonBody({ name: "Max", source: "manual" }),
      jsonBody({ name: "Anna", source: "manual" }),
    ]);
    const source = result.fields.find((f) => f.path === "source");
    expect(source?.role).toBe("constant");
    expect(source?.constantValue).toBe("manual");
  });

  it("builds minimal payload from required + constant", () => {
    const result = diffPayloads([
      jsonBody({ firstName: "Max", lastName: "Muster", source: "manual", phone: "1" }),
      jsonBody({ firstName: "Anna", lastName: "Test", source: "manual" }),
    ]);
    expect(result.minimal).toEqual(
      expect.objectContaining({
        firstName: expect.any(String),
        lastName: expect.any(String),
        source: "manual",
      }),
    );
    expect(result.minimal).not.toHaveProperty("phone");
  });

  it("handles nested objects", () => {
    const result = diffPayloads([
      jsonBody({ user: { name: "Max", role: "admin" } }),
      jsonBody({ user: { name: "Anna", role: "admin" } }),
    ]);
    const paths = result.fields.map((f) => f.path).sort();
    expect(paths).toContain("user");
    expect(paths).toContain("user.name");
    expect(paths).toContain("user.role");
  });

  it("returns empty schema for no samples", () => {
    expect(diffPayloads([])).toEqual({ fields: [], minimal: {} });
  });
});
