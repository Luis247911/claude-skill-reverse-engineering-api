import { ParseError } from "../core/errors.js";
import type {
  CapturedBody,
  CapturedExchange,
  CapturedHeader,
  CapturedRequest,
  HttpMethod,
} from "../core/types.js";

const HTTP_METHODS = new Set<HttpMethod>([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
]);

export interface ParsedCurl {
  request: CapturedRequest;
}

export function parseCurl(input: string, id = "curl-0"): CapturedExchange {
  const tokens = tokenizeCurl(input);
  if (tokens.length === 0 || tokens[0] !== "curl") {
    throw new ParseError("Input does not start with 'curl'");
  }
  let method: HttpMethod | null = null;
  let url: string | null = null;
  const headers: CapturedHeader[] = [];
  const cookies: string[] = [];
  let bodyRaw: string | null = null;
  let bodyKind: "raw" | "urlencode" | null = null;

  for (let i = 1; i < tokens.length; i++) {
    const tok = tokens[i]!;
    if (tok === "-X" || tok === "--request") {
      const next = tokens[++i];
      if (!next) throw new ParseError("Missing value for -X");
      const upper = next.toUpperCase();
      if (!HTTP_METHODS.has(upper as HttpMethod)) {
        throw new ParseError(`Unsupported method: ${next}`);
      }
      method = upper as HttpMethod;
    } else if (tok === "-H" || tok === "--header") {
      const next = tokens[++i];
      if (!next) throw new ParseError("Missing value for -H");
      const idx = next.indexOf(":");
      if (idx > 0) {
        headers.push({ name: next.slice(0, idx).trim(), value: next.slice(idx + 1).trim() });
      }
    } else if (tok === "-b" || tok === "--cookie") {
      const next = tokens[++i];
      if (next) cookies.push(next);
    } else if (
      tok === "-d" ||
      tok === "--data" ||
      tok === "--data-raw" ||
      tok === "--data-binary"
    ) {
      const next = tokens[++i];
      if (next !== undefined) {
        bodyRaw = (bodyRaw ?? "") + next;
        bodyKind = "raw";
        if (!method) method = "POST";
      }
    } else if (tok === "--data-urlencode") {
      const next = tokens[++i];
      if (next !== undefined) {
        bodyRaw = (bodyRaw ?? "") + (bodyRaw ? "&" : "") + encodeURIComponent(next);
        bodyKind = "urlencode";
        if (!method) method = "POST";
      }
    } else if (tok === "-G" || tok === "--get") {
      method = "GET";
    } else if (tok === "-I" || tok === "--head") {
      method = "HEAD";
    } else if (tok === "--url") {
      const next = tokens[++i];
      if (next) url = next;
    } else if (tok.startsWith("--")) {
      const next = tokens[i + 1];
      if (next && !next.startsWith("-")) i++;
    } else if (tok.startsWith("-") && tok.length > 1) {
      // unknown short flag with possible value — skip cautiously
      const next = tokens[i + 1];
      if (next && !next.startsWith("-")) i++;
    } else {
      if (!url) url = tok;
    }
  }

  if (!url) throw new ParseError("No URL found in curl command");

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch (cause) {
    throw new ParseError(`Invalid URL: ${url}`, cause);
  }

  const finalMethod = method ?? (bodyRaw ? "POST" : "GET");
  const query: Record<string, string> = {};
  for (const [k, v] of parsedUrl.searchParams.entries()) query[k] = v;

  if (cookies.length > 0) {
    headers.push({ name: "Cookie", value: cookies.join("; ") });
  }

  const contentTypeHeader = headers.find((h) => h.name.toLowerCase() === "content-type");
  const contentType = contentTypeHeader?.value?.split(";")[0]?.trim() ?? null;
  const body = bodyRaw !== null ? buildCurlBody(bodyRaw, bodyKind, contentType) : null;

  const request: CapturedRequest = {
    id,
    method: finalMethod,
    url,
    origin: parsedUrl.origin,
    pathname: parsedUrl.pathname,
    query,
    headers,
    contentType,
    body,
    startedAt: new Date(0).toISOString(),
  };

  return { request, response: null, kind: "unknown" };
}

function buildCurlBody(
  raw: string,
  kind: "raw" | "urlencode" | null,
  contentType: string | null,
): CapturedBody {
  if (kind === "urlencode" || (contentType && contentType.includes("x-www-form-urlencoded"))) {
    const params = new URLSearchParams(raw);
    const data: Record<string, string> = {};
    for (const [k, v] of params.entries()) data[k] = v;
    return { kind: "form", data, raw };
  }
  if (contentType && contentType.includes("json")) {
    try {
      return { kind: "json", data: JSON.parse(raw), raw };
    } catch {
      return { kind: "text", data: raw, raw };
    }
  }
  // best-effort: try JSON if it looks like JSON
  const trimmed = raw.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return { kind: "json", data: JSON.parse(trimmed), raw };
    } catch {
      // fall through
    }
  }
  return { kind: "text", data: raw, raw };
}

function tokenizeCurl(input: string): string[] {
  // Strip leading shell `$ ` if present, normalize line continuations
  const normalized = input
    .replace(/\\\r?\n/g, " ")
    .replace(/^\s*\$\s+/, "")
    .trim();

  const tokens: string[] = [];
  let i = 0;
  while (i < normalized.length) {
    const ch = normalized[i]!;
    if (ch === " " || ch === "\t" || ch === "\n") {
      i++;
      continue;
    }
    if (ch === "'" || ch === '"') {
      const quote = ch;
      i++;
      let value = "";
      while (i < normalized.length && normalized[i] !== quote) {
        if (normalized[i] === "\\" && quote === '"' && i + 1 < normalized.length) {
          value += normalized[i + 1];
          i += 2;
          continue;
        }
        value += normalized[i];
        i++;
      }
      i++; // skip closing quote
      tokens.push(value);
      continue;
    }
    let value = "";
    while (
      i < normalized.length &&
      normalized[i] !== " " &&
      normalized[i] !== "\t" &&
      normalized[i] !== "\n"
    ) {
      if (normalized[i] === "\\" && i + 1 < normalized.length) {
        value += normalized[i + 1];
        i += 2;
        continue;
      }
      value += normalized[i];
      i++;
    }
    if (value) tokens.push(value);
  }
  return tokens;
}
