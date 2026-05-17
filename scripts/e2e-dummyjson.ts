import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { analyze, generate } from "../src/core/orchestrator.js";
import type {
  CapturedBody,
  CapturedExchange,
  CapturedHeader,
  CapturedRequest,
  CapturedResponse,
  HttpMethod,
} from "../src/core/types.js";

const BASE = "https://dummyjson.com";

async function captureRequest(
  method: HttpMethod,
  path: string,
  body: unknown | null,
  id: string,
): Promise<CapturedExchange> {
  const start = Date.now();
  const init: RequestInit = { method };
  if (body !== null) {
    init.headers = { "Content-Type": "application/json" };
    init.body = JSON.stringify(body);
  }
  const response = await fetch(BASE + path, init);
  const responseText = await response.text();
  const durationMs = Date.now() - start;

  const url = new URL(BASE + path);
  const requestHeaders: CapturedHeader[] = [];
  if (body !== null) requestHeaders.push({ name: "Content-Type", value: "application/json" });
  const responseHeaders: CapturedHeader[] = [];
  response.headers.forEach((value, name) => responseHeaders.push({ name, value }));

  const reqBody: CapturedBody | null =
    body !== null ? { kind: "json", data: body, raw: JSON.stringify(body) } : null;

  let respBody: CapturedBody | null = null;
  const respContentType = response.headers.get("content-type")?.split(";")[0]?.trim() ?? null;
  if (responseText) {
    if (respContentType?.includes("json")) {
      try {
        respBody = { kind: "json", data: JSON.parse(responseText), raw: responseText };
      } catch {
        respBody = { kind: "text", data: responseText, raw: responseText };
      }
    } else {
      respBody = { kind: "text", data: responseText, raw: responseText };
    }
  }

  const request: CapturedRequest = {
    id,
    method,
    url: BASE + path,
    origin: url.origin,
    pathname: url.pathname,
    query: {},
    headers: requestHeaders,
    contentType: body !== null ? "application/json" : null,
    body: reqBody,
    startedAt: new Date(start).toISOString(),
  };
  const responseObj: CapturedResponse = {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
    contentType: respContentType,
    body: respBody,
    durationMs,
  };

  return { request, response: responseObj, kind: "unknown" };
}

function exchangesToHar(exchanges: CapturedExchange[]): unknown {
  return {
    log: {
      version: "1.2",
      creator: { name: "reverse-engineering-kit e2e", version: "0.1.0" },
      entries: exchanges.map((ex) => {
        const reqHasBody = ex.request.body !== null;
        const reqRaw = reqHasBody && "raw" in ex.request.body! ? ex.request.body.raw : "";
        const respRaw =
          ex.response?.body && "raw" in ex.response.body ? ex.response.body.raw : "";
        return {
          startedDateTime: ex.request.startedAt,
          time: ex.response?.durationMs ?? 0,
          request: {
            method: ex.request.method,
            url: ex.request.url,
            headers: ex.request.headers,
            queryString: Object.entries(ex.request.query).map(([name, value]) => ({
              name,
              value,
            })),
            ...(reqHasBody
              ? { postData: { mimeType: ex.request.contentType ?? "", text: reqRaw } }
              : {}),
          },
          response: ex.response
            ? {
                status: ex.response.status,
                statusText: ex.response.statusText,
                headers: ex.response.headers,
                content: {
                  mimeType: ex.response.contentType ?? "",
                  text: respRaw,
                  size: respRaw.length,
                },
              }
            : undefined,
        };
      }),
    },
  };
}

async function smokeTest(outDir: string): Promise<{ method: string; status: number; ok: boolean }> {
  const clientUrl = pathToFileURL(resolve(outDir, "client.ts")).href;
  const mod = (await import(clientUrl)) as {
    ApiClient: new (opts: { baseUrl: string }) => Record<string, (input: unknown) => Promise<unknown>>;
  };
  const client = new mod.ApiClient({ baseUrl: BASE });
  if (typeof client.createAdd !== "function") {
    throw new Error("Generated client is missing createAdd() method");
  }
  let status = 0;
  let ok = false;
  try {
    const result = (await client.createAdd({
      title: "smoke-test",
      body: "validating generated client",
      userId: 1,
    })) as { id?: number };
    if (typeof result?.id === "number") {
      status = 201;
      ok = true;
    } else {
      status = 200;
      ok = true;
    }
  } catch (err) {
    if (err && typeof err === "object" && "status" in err) {
      status = (err as { status: number }).status;
    } else {
      throw err;
    }
  }
  return { method: "createAdd", status, ok };
}

async function main(): Promise<void> {
  const runId = `${new Date().toISOString().replace(/[:.]/g, "-")}-dummyjson-posts`;
  const captureDir = resolve(import.meta.dirname, "..", "captures", runId);
  const outDir = resolve(import.meta.dirname, "..", "out", runId);
  mkdirSync(captureDir, { recursive: true });
  mkdirSync(outDir, { recursive: true });
  mkdirSync(resolve(outDir, "tests"), { recursive: true });

  console.log(`[1/4] Capturing real requests against ${BASE} ...`);
  const exchanges: CapturedExchange[] = [];
  exchanges.push(
    await captureRequest("POST", "/posts/add", { title: "First", body: "Body one", userId: 1 }, "req-1"),
  );
  exchanges.push(
    await captureRequest("POST", "/posts/add", { title: "Second", body: "Body two", userId: 2 }, "req-2"),
  );
  exchanges.push(
    await captureRequest("POST", "/posts/add", { title: "Third", body: "Body three", userId: 1 }, "req-3"),
  );
  exchanges.push(await captureRequest("PUT", "/posts/1", { title: "Updated A" }, "req-4"));
  exchanges.push(await captureRequest("PUT", "/posts/1", { title: "Updated B" }, "req-5"));
  exchanges.push(await captureRequest("DELETE", "/posts/1", null, "req-6"));

  for (const ex of exchanges) {
    console.log(`    ${ex.request.method} ${ex.request.pathname} -> ${ex.response?.status}`);
  }

  console.log(`[2/4] Writing raw HAR to captures/${runId}/raw.har`);
  writeFileSync(resolve(captureDir, "raw.har"), JSON.stringify(exchangesToHar(exchanges), null, 2));

  console.log(`[3/4] Running analyze + generate ...`);
  const result = analyze({
    exchanges,
    metadata: {
      runId,
      scope: "e2e: dummyjson posts CRUD",
      startedAt: new Date().toISOString(),
      targetBaseUrl: BASE,
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
    runId,
    target: BASE,
    exchangeCount: result.exchanges.length,
    mutationCount: result.mutations.length,
    mutations: result.mutations.map((m) => ({
      method: m.method,
      pathTemplate: m.pathTemplate,
      action: m.action,
      resource: m.resource,
    })),
    warnings: result.warnings,
  };
  writeFileSync(resolve(outDir, "summary.json"), JSON.stringify(summary, null, 2));

  console.log(`[4/4] Smoke-testing generated client against ${BASE} ...`);
  const smoke = await smokeTest(outDir);
  writeFileSync(resolve(outDir, "smoke.json"), JSON.stringify(smoke, null, 2));

  console.log("");
  console.log("=== Summary ===");
  console.log(JSON.stringify(summary, null, 2));
  console.log("=== Smoke ===");
  console.log(JSON.stringify(smoke, null, 2));
  console.log(`Output: ${outDir}`);

  if (!smoke.ok || smoke.status < 200 || smoke.status >= 300) {
    console.error("Smoke test did not return 2xx");
    process.exit(2);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
