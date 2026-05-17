import { CaptureError } from "../core/errors.js";
import type {
  CapturedBody,
  CapturedExchange,
  CapturedHeader,
  CapturedRequest,
  CapturedResponse,
  HttpMethod,
} from "../core/types.js";

/**
 * The Chrome DevTools MCP tools (`mcp__chrome-devtools__list_network_requests`,
 * `mcp__chrome-devtools__get_network_request`) are invoked by the orchestrator
 * agent. This module only provides typed adapters that turn the MCP shape into
 * our internal `CapturedExchange` shape.
 *
 * Expected MCP output shapes are documented inline; if the upstream tool
 * changes, only these interfaces need adjusting.
 */

export interface McpListedRequest {
  requestId: string;
  url: string;
  method: string;
  status?: number;
  resourceType?: string;
  timestamp?: number | string;
}

export interface McpRequestDetail {
  requestId: string;
  url: string;
  method: string;
  request: {
    headers?: Record<string, string> | Array<{ name: string; value: string }>;
    postData?: string | null;
    contentType?: string | null;
  };
  response?: {
    status: number;
    statusText?: string;
    headers?: Record<string, string> | Array<{ name: string; value: string }>;
    body?: string | null;
    contentType?: string | null;
    durationMs?: number;
  };
  initiator?: { type?: string; url?: string };
  startedAt?: string;
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

export function adaptMcpRequest(detail: McpRequestDetail, fallbackId: string): CapturedExchange {
  const method = detail.method.toUpperCase();
  if (!HTTP_METHODS.has(method as HttpMethod)) {
    throw new CaptureError(`Unsupported HTTP method from MCP: ${detail.method}`);
  }
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(detail.url);
  } catch (cause) {
    throw new CaptureError(`Invalid URL from MCP: ${detail.url}`, cause);
  }

  const requestHeaders = normalizeHeaders(detail.request.headers);
  const responseHeaders = detail.response ? normalizeHeaders(detail.response.headers) : [];

  const contentTypeReq =
    detail.request.contentType ??
    requestHeaders.find((h) => h.name.toLowerCase() === "content-type")?.value?.split(";")[0]?.trim() ??
    null;

  const contentTypeRes =
    detail.response?.contentType ??
    responseHeaders.find((h) => h.name.toLowerCase() === "content-type")?.value?.split(";")[0]?.trim() ??
    null;

  const body = detail.request.postData ? buildBody(detail.request.postData, contentTypeReq) : null;
  const responseBody = detail.response?.body ? buildBody(detail.response.body, contentTypeRes) : null;

  const query: Record<string, string> = {};
  for (const [k, v] of parsedUrl.searchParams.entries()) query[k] = v;

  const initiator = detail.initiator?.url ?? detail.initiator?.type;
  const request: CapturedRequest = {
    id: detail.requestId || fallbackId,
    method: method as HttpMethod,
    url: detail.url,
    origin: parsedUrl.origin,
    pathname: parsedUrl.pathname,
    query,
    headers: requestHeaders,
    contentType: contentTypeReq,
    body,
    startedAt: detail.startedAt ?? new Date().toISOString(),
  };
  if (initiator !== undefined) request.initiator = initiator;

  let response: CapturedResponse | null = null;
  if (detail.response) {
    response = {
      status: detail.response.status,
      statusText: detail.response.statusText ?? "",
      headers: responseHeaders,
      contentType: contentTypeRes,
      body: responseBody,
      durationMs: detail.response.durationMs ?? 0,
    };
  }

  return { request, response, kind: "unknown" };
}

export function adaptMcpListing(items: McpListedRequest[]): Array<{ id: string; url: string; method: string }> {
  return items.map((item, idx) => ({
    id: item.requestId || `mcp-${idx}`,
    url: item.url,
    method: item.method.toUpperCase(),
  }));
}

function normalizeHeaders(
  headers: Record<string, string> | Array<{ name: string; value: string }> | undefined,
): CapturedHeader[] {
  if (!headers) return [];
  if (Array.isArray(headers)) {
    return headers.map((h) => ({ name: h.name, value: h.value }));
  }
  return Object.entries(headers).map(([name, value]) => ({ name, value }));
}

function buildBody(text: string, contentType: string | null): CapturedBody {
  if (!text) return { kind: "text", data: "", raw: "" };
  const ct = (contentType ?? "").toLowerCase();
  if (ct.includes("json")) {
    try {
      return { kind: "json", data: JSON.parse(text), raw: text };
    } catch {
      return { kind: "text", data: text, raw: text };
    }
  }
  if (ct.includes("x-www-form-urlencoded")) {
    const params = new URLSearchParams(text);
    const data: Record<string, string> = {};
    for (const [k, v] of params.entries()) data[k] = v;
    return { kind: "form", data, raw: text };
  }
  return { kind: "text", data: text, raw: text };
}
