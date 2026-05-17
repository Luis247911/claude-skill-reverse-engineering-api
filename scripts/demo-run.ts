import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadHar } from "../src/capture/har-loader.js";
import { analyze, generate } from "../src/core/orchestrator.js";

const harPath = resolve(import.meta.dirname, "..", "samples", "public", "jsonplaceholder.har");
const outDir = resolve(import.meta.dirname, "..", "out", "demo-jsonplaceholder");
mkdirSync(outDir, { recursive: true });
mkdirSync(resolve(outDir, "tests"), { recursive: true });

const exchanges = loadHar(readFileSync(harPath, "utf-8"));
const result = analyze({
  exchanges,
  metadata: {
    runId: "demo-jsonplaceholder",
    scope: "demo: list users, create posts, update post",
    startedAt: new Date().toISOString(),
    targetBaseUrl: "https://jsonplaceholder.typicode.com",
    captureSource: "har",
  },
});

const out = generate(result);
writeFileSync(resolve(outDir, "client.ts"), out.clientTs);
writeFileSync(resolve(outDir, "types.ts"), out.typesTs);
writeFileSync(resolve(outDir, "errors.ts"), out.errorsTs);
writeFileSync(resolve(outDir, "api-map.md"), out.apiMapMd);
writeFileSync(resolve(outDir, "tests", "client.spec.ts"), out.testsTs);

const summary = {
  runId: result.metadata.runId,
  exchangeCount: result.exchanges.length,
  mutationCount: result.mutations.length,
  warnings: result.warnings,
};
writeFileSync(resolve(outDir, "summary.json"), JSON.stringify(summary, null, 2));

console.log(`Demo run complete. Output: ${outDir}`);
console.log(JSON.stringify(summary, null, 2));
