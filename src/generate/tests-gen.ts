import type { Mutation } from "../core/types.js";
import { camel, pascal } from "./client-gen.js";

export function renderClientTests(mutations: Mutation[]): string {
  const cases = mutations.map(renderTestCase).join("\n\n");
  return [
    `import { describe, it, expect, vi } from "vitest";`,
    `import { ApiClient } from "./client.js";`,
    "",
    `function mockFetch(response: unknown, status = 200): typeof fetch {`,
    `  return vi.fn(async () => new Response(JSON.stringify(response), {`,
    `    status,`,
    `    headers: { "Content-Type": "application/json" },`,
    `  })) as unknown as typeof fetch;`,
    `}`,
    "",
    `describe("ApiClient", () => {`,
    cases,
    `});`,
    "",
  ].join("\n");
}

function renderTestCase(mutation: Mutation): string {
  const methodName = `${mutation.action}${pascal(singularize(mutation.resource))}`;
  const sampleResponse = mutation.exchanges[0]?.response?.body;
  const responseJson =
    sampleResponse && sampleResponse.kind === "json" ? JSON.stringify(sampleResponse.data) : `{ "ok": true }`;
  const sampleInput = renderSampleInput(mutation);
  return [
    `  it("${methodName} sends ${mutation.method} ${mutation.pathTemplate}", async () => {`,
    `    const fetchMock = mockFetch(${responseJson});`,
    `    const client = new ApiClient({ baseUrl: "https://app.example.com", fetchImpl: fetchMock });`,
    `    const result = await client.${methodName}(${sampleInput});`,
    `    expect(result).toBeDefined();`,
    `    expect(fetchMock).toHaveBeenCalled();`,
    `  });`,
  ].join("\n");
}

function renderSampleInput(mutation: Mutation): string {
  const hasPath = mutation.pathTemplate.includes("{");
  if (!hasPath && !mutation.payload) return "";
  const obj: Record<string, unknown> = {};
  if (hasPath) {
    for (const m of mutation.pathTemplate.matchAll(/\{([^}]+)\}/g)) {
      obj[camel(m[1]!)] = "sample";
    }
  }
  if (mutation.payload) {
    if (hasPath) obj.body = mutation.payload.minimal;
    else Object.assign(obj, mutation.payload.minimal);
  }
  return JSON.stringify(obj);
}

function singularize(word: string): string {
  if (word.endsWith("ies")) return word.slice(0, -3) + "y";
  if (word.endsWith("ses") || word.endsWith("xes") || word.endsWith("zes")) return word.slice(0, -2);
  if (word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}
