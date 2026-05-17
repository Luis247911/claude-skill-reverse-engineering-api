import { ReplayDriftError } from "../core/errors.js";
import type { CapturedExchange, Mutation } from "../core/types.js";

export interface ReplayOptions {
  baseUrl: string;
  storageStatePath?: string;
  extraHeaders?: Record<string, string>;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export interface ReplayResult {
  status: number;
  matchesOriginal: boolean;
  driftReasons: string[];
  responseBody: unknown;
}

/**
 * Replay a mutation as a minimal request and compare it to the original.
 *
 * Uses the Playwright APIRequestContext when `storageStatePath` is provided,
 * which lets the call share cookies with a logged-in browser context (see
 * methode.txt §23). When `storageStatePath` is omitted, falls back to bare
 * `fetch` with `extraHeaders`.
 */
export async function replayMutation(
  mutation: Mutation,
  options: ReplayOptions,
): Promise<ReplayResult> {
  const originalExchange = mutation.exchanges[0];
  if (!originalExchange) throw new ReplayDriftError("mutation has no captured exchange", null, null);

  const url = buildUrl(options.baseUrl, mutation.pathTemplate, originalExchange);
  const body = mutation.payload?.minimal ?? bodyFromExchange(originalExchange);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.extraHeaders ?? {}),
  };

  const requestInit: RequestInit = {
    method: mutation.method,
    headers,
  };
  if (mutation.method !== "GET" && mutation.method !== "DELETE") {
    requestInit.body = JSON.stringify(body);
  }

  const fetchImpl = options.storageStatePath
    ? await buildPlaywrightFetch(options.storageStatePath, options.timeoutMs ?? 15000)
    : options.fetchImpl ?? fetch;

  const response = await fetchImpl(url, requestInit);
  const text = await response.text();
  let parsed: unknown = text;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    // leave as text
  }

  const drift = diff(originalExchange, response.status, parsed);
  return {
    status: response.status,
    matchesOriginal: drift.length === 0,
    driftReasons: drift,
    responseBody: parsed,
  };
}

function diff(original: CapturedExchange, status: number, body: unknown): string[] {
  const reasons: string[] = [];
  const expectedStatus = original.response?.status;
  if (expectedStatus !== undefined && classOf(expectedStatus) !== classOf(status)) {
    reasons.push(`status class changed: expected ${expectedStatus}, got ${status}`);
  }
  const expectedShape = original.response?.body?.kind === "json" ? original.response.body.data : null;
  if (expectedShape && body !== null && typeof body === "object") {
    const missing = missingTopLevelKeys(expectedShape, body);
    if (missing.length > 0) reasons.push(`missing response keys: ${missing.join(", ")}`);
  }
  return reasons;
}

function classOf(status: number): number {
  return Math.floor(status / 100);
}

function missingTopLevelKeys(expected: unknown, actual: unknown): string[] {
  if (typeof expected !== "object" || expected === null) return [];
  if (typeof actual !== "object" || actual === null) return [];
  const expectedKeys = Object.keys(expected as Record<string, unknown>);
  const actualKeys = new Set(Object.keys(actual as Record<string, unknown>));
  return expectedKeys.filter((k) => !actualKeys.has(k));
}

function buildUrl(baseUrl: string, pathTemplate: string, originalExchange: CapturedExchange): string {
  if (!pathTemplate.includes("{")) {
    return joinUrl(baseUrl, pathTemplate);
  }
  const originalSegments = originalExchange.request.pathname.split("/").filter(Boolean);
  const templateSegments = pathTemplate.split("/").filter(Boolean);
  const resolved = templateSegments
    .map((seg, idx) => {
      if (seg.startsWith("{") && seg.endsWith("}")) {
        return originalSegments[idx] ?? seg;
      }
      return seg;
    })
    .join("/");
  return joinUrl(baseUrl, "/" + resolved);
}

function joinUrl(baseUrl: string, path: string): string {
  return baseUrl.replace(/\/+$/, "") + (path.startsWith("/") ? path : "/" + path);
}

function bodyFromExchange(exchange: CapturedExchange): unknown {
  const b = exchange.request.body;
  if (!b) return null;
  if (b.kind === "json") return b.data;
  if (b.kind === "form") return b.data;
  if (b.kind === "text") return b.data;
  return null;
}

async function buildPlaywrightFetch(storageStatePath: string, timeoutMs: number): Promise<typeof fetch> {
  const playwright = (await import("playwright").catch(() => null)) as
    | typeof import("playwright")
    | null;
  if (!playwright) {
    throw new ReplayDriftError(
      "playwright is not installed; cannot use storageStatePath replay",
      null,
      null,
    );
  }
  const context = await playwright.request.newContext({
    storageState: storageStatePath,
    timeout: timeoutMs,
  });
  const wrapped: typeof fetch = async (input, init) => {
    const url = typeof input === "string" ? input : (input as URL).toString();
    const method = (init?.method ?? "GET").toUpperCase();
    const headers: Record<string, string> = {};
    if (init?.headers) {
      if (init.headers instanceof Headers) {
        init.headers.forEach((v, k) => (headers[k] = v));
      } else if (Array.isArray(init.headers)) {
        for (const [k, v] of init.headers) headers[k] = v;
      } else {
        Object.assign(headers, init.headers);
      }
    }
    const body = init?.body;
    const response = await context.fetch(url, {
      method,
      headers,
      data: typeof body === "string" ? body : undefined,
    });
    const buffer = await response.body();
    const arrayBuffer = buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength,
    );
    return new Response(arrayBuffer as ArrayBuffer, {
      status: response.status(),
      statusText: response.statusText(),
      headers: response.headers(),
    });
  };
  return wrapped;
}
