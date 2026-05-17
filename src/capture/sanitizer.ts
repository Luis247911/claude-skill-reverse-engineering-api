import type {
  CapturedBody,
  CapturedExchange,
  CapturedHeader,
  CapturedRequest,
  CapturedResponse,
} from "../core/types.js";

export interface SanitizerOptions {
  redactIdPatterns: boolean;
  extraSensitiveHeaders: string[];
  extraSensitiveBodyKeys: string[];
}

const DEFAULT_SENSITIVE_HEADERS = new Set([
  "authorization",
  "proxy-authorization",
  "cookie",
  "set-cookie",
  "x-csrf-token",
  "x-xsrf-token",
  "x-api-key",
  "x-auth-token",
  "x-access-token",
  "x-session-token",
]);

const DEFAULT_SENSITIVE_BODY_KEYS = new Set([
  "password",
  "passwd",
  "pwd",
  "secret",
  "token",
  "access_token",
  "refresh_token",
  "id_token",
  "api_key",
  "apikey",
  "session",
  "ssn",
  "creditcard",
  "credit_card",
  "card_number",
  "cvv",
]);

const JWT_REGEX = /^[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}$/;
const EMAIL_REGEX = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
const UUID_REGEX =
  /\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b/g;
const LONG_HEX_REGEX = /\b[0-9a-fA-F]{32,}\b/g;
const BEARER_VALUE_REGEX = /^Bearer\s+([A-Za-z0-9._~+/=-]{16,})$/i;

export function defaultSanitizerOptions(): SanitizerOptions {
  return {
    redactIdPatterns: false,
    extraSensitiveHeaders: [],
    extraSensitiveBodyKeys: [],
  };
}

export function sanitizeExchange(
  exchange: CapturedExchange,
  options: SanitizerOptions = defaultSanitizerOptions(),
): CapturedExchange {
  return {
    ...exchange,
    request: sanitizeRequest(exchange.request, options),
    response: exchange.response ? sanitizeResponse(exchange.response, options) : null,
  };
}

export function sanitizeRequest(
  request: CapturedRequest,
  options: SanitizerOptions,
): CapturedRequest {
  return {
    ...request,
    headers: sanitizeHeaders(request.headers, options),
    body: request.body ? sanitizeBody(request.body, options) : null,
    url: sanitizeUrl(request.url, options),
  };
}

export function sanitizeResponse(
  response: CapturedResponse,
  options: SanitizerOptions,
): CapturedResponse {
  return {
    ...response,
    headers: sanitizeHeaders(response.headers, options),
    body: response.body ? sanitizeBody(response.body, options) : null,
  };
}

export function sanitizeHeaders(
  headers: CapturedHeader[],
  options: SanitizerOptions,
): CapturedHeader[] {
  const extra = new Set(options.extraSensitiveHeaders.map((h) => h.toLowerCase()));
  return headers.map((header) => {
    const lower = header.name.toLowerCase();
    if (DEFAULT_SENSITIVE_HEADERS.has(lower) || extra.has(lower)) {
      return { name: header.name, value: redactHeaderValue(header.value) };
    }
    if (JWT_REGEX.test(header.value.trim())) {
      return { name: header.name, value: "<REDACTED:JWT>" };
    }
    const bearer = BEARER_VALUE_REGEX.exec(header.value.trim());
    if (bearer) {
      return { name: header.name, value: "Bearer <REDACTED:TOKEN>" };
    }
    return header;
  });
}

function redactHeaderValue(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "<REDACTED:EMPTY>";
  if (JWT_REGEX.test(trimmed)) return "<REDACTED:JWT>";
  if (BEARER_VALUE_REGEX.test(trimmed)) return "Bearer <REDACTED:TOKEN>";
  return `<REDACTED:${trimmed.length}-chars>`;
}

export function sanitizeBody(
  body: CapturedBody,
  options: SanitizerOptions,
): CapturedBody {
  switch (body.kind) {
    case "json": {
      const sanitized = sanitizeJsonValue(body.data, options);
      const raw = JSON.stringify(sanitized);
      return { kind: "json", data: sanitized, raw };
    }
    case "form": {
      const data: Record<string, string> = {};
      for (const [key, value] of Object.entries(body.data)) {
        data[key] = sanitizeStringForKey(key, value, options);
      }
      const raw = new URLSearchParams(data).toString();
      return { kind: "form", data, raw };
    }
    case "text":
      return { kind: "text", data: sanitizeFreeText(body.data), raw: sanitizeFreeText(body.raw) };
    case "multipart":
    case "binary":
      return body;
  }
}

export function sanitizeJsonValue(
  value: unknown,
  options: SanitizerOptions,
  path: string[] = [],
): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    const parentKey = path[path.length - 1] ?? "";
    return sanitizeStringForKey(parentKey, value, options);
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    return value.map((item, idx) => sanitizeJsonValue(item, options, [...path, String(idx)]));
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (isSensitiveBodyKey(k, options)) {
        out[k] = "<REDACTED:VALUE>";
      } else {
        out[k] = sanitizeJsonValue(v, options, [...path, k]);
      }
    }
    return out;
  }
  return value;
}

function isSensitiveBodyKey(key: string, options: SanitizerOptions): boolean {
  const lower = key.toLowerCase();
  if (DEFAULT_SENSITIVE_BODY_KEYS.has(lower)) return true;
  if (options.extraSensitiveBodyKeys.some((k) => k.toLowerCase() === lower)) return true;
  return false;
}

function sanitizeStringForKey(
  key: string,
  value: string,
  options: SanitizerOptions,
): string {
  if (isSensitiveBodyKey(key, options)) return "<REDACTED:VALUE>";
  return sanitizeFreeText(value, options);
}

export function sanitizeFreeText(
  value: string,
  options: SanitizerOptions = defaultSanitizerOptions(),
): string {
  let out = value;
  if (JWT_REGEX.test(out.trim())) return "<REDACTED:JWT>";
  out = out.replace(EMAIL_REGEX, "<REDACTED:EMAIL>");
  if (options.redactIdPatterns) {
    out = out.replace(UUID_REGEX, "<REDACTED:UUID>");
    out = out.replace(LONG_HEX_REGEX, "<REDACTED:HEX>");
  }
  return out;
}

export function sanitizeUrl(url: string, options: SanitizerOptions): string {
  try {
    const parsed = new URL(url);
    const params = parsed.searchParams;
    for (const key of [...params.keys()]) {
      const lower = key.toLowerCase();
      if (
        lower === "token" ||
        lower === "access_token" ||
        lower === "refresh_token" ||
        lower === "api_key" ||
        lower === "apikey" ||
        lower === "auth" ||
        options.extraSensitiveBodyKeys.some((k) => k.toLowerCase() === lower)
      ) {
        params.set(key, "<REDACTED:VALUE>");
      }
    }
    parsed.search = params.toString();
    return parsed.toString();
  } catch {
    return url;
  }
}
