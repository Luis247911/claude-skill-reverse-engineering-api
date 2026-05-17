import { ParseError } from "../core/errors.js";
import type {
  CapturedBody,
  CapturedExchange,
  CapturedHeader,
  CapturedRequest,
  CapturedResponse,
  HttpMethod,
  MultipartPart,
} from "../core/types.js";

interface HarLog {
  log: { entries: HarEntry[] };
}

interface HarEntry {
  startedDateTime?: string;
  time?: number;
  request: HarRequest;
  response?: HarResponse;
  _initiator?: { type?: string; url?: string };
}

interface HarRequest {
  method: string;
  url: string;
  headers?: Array<{ name: string; value: string }>;
  queryString?: Array<{ name: string; value: string }>;
  postData?: {
    mimeType?: string;
    text?: string;
    params?: Array<{ name: string; value?: string; fileName?: string; contentType?: string }>;
  };
}

interface HarResponse {
  status: number;
  statusText?: string;
  headers?: Array<{ name: string; value: string }>;
  content?: { mimeType?: string; text?: string; size?: number };
}

const HTTP_METHODS = new Set<HttpMethod>([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
]);

export function loadHar(jsonText: string): CapturedExchange[] {
  let parsed: HarLog;
  try {
    parsed = JSON.parse(jsonText) as HarLog;
  } catch (cause) {
    throw new ParseError("HAR file is not valid JSON", cause);
  }
  if (!parsed.log || !Array.isArray(parsed.log.entries)) {
    throw new ParseError("HAR file does not have log.entries");
  }
  return parsed.log.entries.map((entry, idx) => harEntryToExchange(entry, idx));
}

function harEntryToExchange(entry: HarEntry, idx: number): CapturedExchange {
  const request = harRequestToCaptured(entry, idx);
  const response = entry.response ? harResponseToCaptured(entry.response, entry.time ?? 0) : null;
  return { request, response, kind: "unknown" };
}

function harRequestToCaptured(entry: HarEntry, idx: number): CapturedRequest {
  const method = entry.request.method.toUpperCase();
  if (!HTTP_METHODS.has(method as HttpMethod)) {
    throw new ParseError(`Unsupported HTTP method: ${entry.request.method}`);
  }
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(entry.request.url);
  } catch (cause) {
    throw new ParseError(`Invalid URL in HAR entry ${idx}: ${entry.request.url}`, cause);
  }
  const headers: CapturedHeader[] = (entry.request.headers ?? []).map((h) => ({
    name: h.name,
    value: h.value,
  }));
  const query: Record<string, string> = {};
  for (const [k, v] of parsedUrl.searchParams.entries()) {
    query[k] = v;
  }

  const contentTypeHeader = headers.find((h) => h.name.toLowerCase() === "content-type");
  const contentType = contentTypeHeader?.value?.split(";")[0]?.trim() ?? null;

  const body = entry.request.postData ? parseRequestBody(entry.request.postData) : null;

  const initiator = entry._initiator?.url ?? entry._initiator?.type;
  const captured: CapturedRequest = {
    id: `req-${idx}`,
    method: method as HttpMethod,
    url: entry.request.url,
    origin: parsedUrl.origin,
    pathname: parsedUrl.pathname,
    query,
    headers,
    contentType,
    body,
    startedAt: entry.startedDateTime ?? new Date(0).toISOString(),
  };
  if (initiator !== undefined) captured.initiator = initiator;
  return captured;
}

function harResponseToCaptured(response: HarResponse, durationMs: number): CapturedResponse {
  const headers: CapturedHeader[] = (response.headers ?? []).map((h) => ({
    name: h.name,
    value: h.value,
  }));
  const contentTypeRaw =
    response.content?.mimeType ??
    headers.find((h) => h.name.toLowerCase() === "content-type")?.value ??
    null;
  const contentType = contentTypeRaw?.split(";")[0]?.trim() ?? null;
  const body = parseResponseBody(response.content, contentType);

  return {
    status: response.status,
    statusText: response.statusText ?? "",
    headers,
    contentType,
    body,
    durationMs: Math.max(0, Math.round(durationMs)),
  };
}

function parseRequestBody(postData: NonNullable<HarRequest["postData"]>): CapturedBody | null {
  const mime = (postData.mimeType ?? "").toLowerCase().split(";")[0]?.trim() ?? "";
  if (postData.params && (mime.startsWith("multipart/") || mime.includes("form-data"))) {
    const parts: MultipartPart[] = postData.params.map((p) => ({
      name: p.name,
      filename: p.fileName ?? null,
      contentType: p.contentType ?? null,
      sizeBytes: p.value ? new TextEncoder().encode(p.value).length : 0,
    }));
    return { kind: "multipart", parts, raw: "" };
  }
  if (postData.params && mime.includes("x-www-form-urlencoded")) {
    const data: Record<string, string> = {};
    for (const p of postData.params) {
      if (p.name) data[p.name] = p.value ?? "";
    }
    return { kind: "form", data, raw: new URLSearchParams(data).toString() };
  }
  const text = postData.text ?? "";
  if (!text) return null;
  if (mime.includes("json")) {
    try {
      return { kind: "json", data: JSON.parse(text), raw: text };
    } catch {
      return { kind: "text", data: text, raw: text };
    }
  }
  if (mime.includes("x-www-form-urlencoded")) {
    const params = new URLSearchParams(text);
    const data: Record<string, string> = {};
    for (const [k, v] of params.entries()) data[k] = v;
    return { kind: "form", data, raw: text };
  }
  return { kind: "text", data: text, raw: text };
}

function parseResponseBody(
  content: HarResponse["content"] | undefined,
  contentType: string | null,
): CapturedBody | null {
  if (!content) return null;
  if (!content.text) {
    if (content.size && content.size > 0) {
      return { kind: "binary", sizeBytes: content.size };
    }
    return null;
  }
  if (contentType && contentType.includes("json")) {
    try {
      return { kind: "json", data: JSON.parse(content.text), raw: content.text };
    } catch {
      return { kind: "text", data: content.text, raw: content.text };
    }
  }
  return { kind: "text", data: content.text, raw: content.text };
}
