import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { loadHar } from "../../src/capture/har-loader.js";

const fixturePath = resolve(__dirname, "..", "fixtures", "jsonplaceholder-sample.har.json");

describe("loadHar", () => {
  it("parses a minimal HAR into exchanges", () => {
    const text = readFileSync(fixturePath, "utf-8");
    const exchanges = loadHar(text);
    expect(exchanges).toHaveLength(2);
    const [getUsers, postPost] = exchanges;
    expect(getUsers!.request.method).toBe("GET");
    expect(getUsers!.request.pathname).toBe("/users");
    expect(getUsers!.response?.status).toBe(200);

    expect(postPost!.request.method).toBe("POST");
    expect(postPost!.request.body?.kind).toBe("json");
    if (postPost!.request.body?.kind === "json") {
      expect(postPost!.request.body.data).toEqual({ title: "foo", body: "bar", userId: 1 });
    }
    expect(postPost!.response?.status).toBe(201);
  });

  it("throws on invalid JSON", () => {
    expect(() => loadHar("{not json")).toThrow(/valid JSON/);
  });

  it("throws on missing log.entries", () => {
    expect(() => loadHar('{"foo":1}')).toThrow(/log\.entries/);
  });
});
