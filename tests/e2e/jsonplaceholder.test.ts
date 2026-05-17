import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { loadHar } from "../../src/capture/har-loader.js";
import { analyze, generate } from "../../src/core/orchestrator.js";

const harPath = resolve(__dirname, "..", "..", "samples", "public", "jsonplaceholder.har");

describe("end-to-end: jsonplaceholder", () => {
  it("ingests HAR, analyzes, and generates a client", () => {
    const exchanges = loadHar(readFileSync(harPath, "utf-8"));
    const result = analyze({
      exchanges,
      metadata: {
        runId: "demo-jsonplaceholder",
        scope: "demo: list users, create posts, update post",
        startedAt: "2026-05-17T10:00:00Z",
        targetBaseUrl: "https://jsonplaceholder.typicode.com",
        captureSource: "har",
      },
    });

    // Three mutations: POST /posts (grouped from 2 captures), PATCH /posts/{id}
    expect(result.mutations.length).toBeGreaterThanOrEqual(2);
    const createPosts = result.mutations.find((m) => m.method === "POST" && m.pathTemplate === "/posts");
    expect(createPosts).toBeDefined();
    expect(createPosts!.exchanges).toHaveLength(2);
    expect(createPosts!.payload?.fields.find((f) => f.path === "title")?.role).toBe("required");
    expect(createPosts!.payload?.fields.find((f) => f.path === "userId")?.role).toBe("constant");

    const patchPost = result.mutations.find((m) => m.method === "PATCH");
    expect(patchPost).toBeDefined();
    expect(patchPost!.pathTemplate).toMatch(/\{id\}/);

    const out = generate(result);
    expect(out.clientTs).toContain("createPost");
    expect(out.clientTs).toContain("updatePost");
    expect(out.clientTs).toMatch(/encodeURIComponent\(input\.id\)/);
    expect(out.typesTs).toContain("CreatePostInput");
    expect(out.apiMapMd).toContain("# API Map");
  });
});
