import type {
  CapturedExchange,
  DynamicValue,
  DynamicValueKind,
  DynamicValueLocation,
  DynamicValueOrigin,
} from "../core/types.js";

const HEADER_TO_KIND: Record<string, DynamicValueKind> = {
  "x-csrf-token": "csrf",
  "x-xsrf-token": "csrf",
  authorization: "bearer",
  "x-tenant-id": "tenant-id",
  "x-tenantid": "tenant-id",
  "x-organization-id": "organization-id",
  "x-org-id": "organization-id",
  "x-workspace-id": "workspace-id",
  "x-user-id": "user-id",
  "x-request-id": "request-id",
  "x-nonce": "nonce",
};

const COOKIE_TO_KIND: Record<string, DynamicValueKind> = {
  session: "session-cookie",
  sessionid: "session-cookie",
  sid: "session-cookie",
  jsessionid: "session-cookie",
  "auth-token": "session-cookie",
  csrf: "csrf",
  xsrf: "csrf",
  "csrf-token": "csrf",
  "xsrf-token": "csrf",
};

const JWT_REGEX = /^[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}$/;
const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const LONG_HEX_REGEX = /^[0-9a-fA-F]{16,}$/;
const ID_PREFIX_REGEX = /^[a-z][a-z_]{1,15}_[A-Za-z0-9_-]{4,}$/;

export function traceDynamicValues(
  target: CapturedExchange,
  history: CapturedExchange[],
): DynamicValue[] {
  const dynamics: DynamicValue[] = [];
  const seen = new Set<string>();
  const push = (dv: DynamicValue) => {
    const key = `${dv.kind}|${JSON.stringify(dv.location)}`;
    if (seen.has(key)) return;
    seen.add(key);
    dynamics.push(dv);
  };

  for (const header of target.request.headers) {
    const dv = inspectHeader(header.name, header.value, history);
    if (dv) push(dv);
  }

  const cookieHeader = target.request.headers.find((h) => h.name.toLowerCase() === "cookie");
  if (cookieHeader) {
    for (const dv of inspectCookieHeader(cookieHeader.value, history)) {
      push(dv);
    }
  }

  for (const dv of inspectUrl(target.request.url, history)) {
    push(dv);
  }

  if (target.request.body?.kind === "json") {
    for (const dv of inspectJsonBody(target.request.body.data, history, [])) {
      push(dv);
    }
  }

  return dynamics;
}

function inspectHeader(
  name: string,
  value: string,
  history: CapturedExchange[],
): DynamicValue | null {
  const lower = name.toLowerCase();
  const trimmed = value.trim();
  let kind = HEADER_TO_KIND[lower] ?? null;
  if (lower === "authorization" && trimmed.toLowerCase().startsWith("bearer ")) {
    const token = trimmed.slice(7).trim();
    if (JWT_REGEX.test(token)) kind = "jwt";
    else kind = "bearer";
  }
  if (!kind && JWT_REGEX.test(trimmed)) kind = "jwt";
  if (!kind) return null;
  return {
    kind,
    placeholder: `<${kind.toUpperCase().replace(/-/g, "_")}>`,
    exampleValue: trimmed,
    location: { kind: "header", name },
    origin: traceHeaderOrigin(name, trimmed, history),
    rotation: rotationForKind(kind),
  };
}

function inspectCookieHeader(value: string, history: CapturedExchange[]): DynamicValue[] {
  const out: DynamicValue[] = [];
  for (const part of value.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const cookieName = trimmed.slice(0, eq).trim();
    const cookieValue = trimmed.slice(eq + 1).trim();
    const lower = cookieName.toLowerCase();
    const kind = COOKIE_TO_KIND[lower] ?? guessKindFromValue(cookieValue);
    if (!kind) continue;
    out.push({
      kind,
      placeholder: `<COOKIE_${cookieName.toUpperCase()}>`,
      exampleValue: cookieValue,
      location: { kind: "cookie", name: cookieName },
      origin: traceCookieOrigin(cookieName, history),
      rotation: rotationForKind(kind),
    });
  }
  return out;
}

function inspectUrl(url: string, history: CapturedExchange[]): DynamicValue[] {
  const out: DynamicValue[] = [];
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split("/").filter(Boolean);
    segments.forEach((seg, idx) => {
      const kind = guessKindFromValue(seg);
      if (!kind) return;
      out.push({
        kind: kind === "jwt" ? "entity-id" : kind,
        placeholder: `<URL_SEGMENT_${idx}>`,
        exampleValue: seg,
        location: { kind: "url-segment", segmentIndex: idx },
        origin: traceIdOrigin(seg, history),
        rotation: "stable",
      });
    });
    for (const [k, v] of parsed.searchParams.entries()) {
      if (k.toLowerCase() === "cursor" || k.toLowerCase() === "next") {
        out.push({
          kind: "cursor",
          placeholder: "<CURSOR>",
          exampleValue: v,
          location: { kind: "query", name: k },
          origin: traceIdOrigin(v, history),
          rotation: "per-request",
        });
      }
    }
  } catch {
    // ignore
  }
  return out;
}

function inspectJsonBody(
  data: unknown,
  history: CapturedExchange[],
  path: string[],
): DynamicValue[] {
  const out: DynamicValue[] = [];
  if (data === null || data === undefined) return out;
  if (typeof data === "string") {
    const kind = guessKindFromValue(data);
    if (kind) {
      out.push({
        kind: kind === "jwt" ? "jwt" : "entity-id",
        placeholder: `<BODY_${path.join("_").toUpperCase()}>`,
        exampleValue: data,
        location: { kind: "body", jsonPath: path.join(".") || "$" },
        origin: traceIdOrigin(data, history),
        rotation: kind === "jwt" ? "per-session" : "stable",
      });
    }
    return out;
  }
  if (Array.isArray(data)) {
    data.forEach((item, i) => {
      out.push(...inspectJsonBody(item, history, [...path, String(i)]));
    });
    return out;
  }
  if (typeof data === "object") {
    for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
      out.push(...inspectJsonBody(v, history, [...path, k]));
    }
  }
  return out;
}

function guessKindFromValue(value: string): DynamicValueKind | null {
  if (JWT_REGEX.test(value)) return "jwt";
  if (UUID_REGEX.test(value)) return "entity-id";
  if (ID_PREFIX_REGEX.test(value)) return "entity-id";
  if (LONG_HEX_REGEX.test(value)) return "entity-id";
  return null;
}

function rotationForKind(kind: DynamicValueKind): DynamicValue["rotation"] {
  switch (kind) {
    case "csrf":
    case "session-cookie":
    case "jwt":
    case "bearer":
      return "per-session";
    case "nonce":
    case "request-id":
    case "timestamp":
    case "cursor":
      return "per-request";
    case "tenant-id":
    case "organization-id":
    case "user-id":
    case "workspace-id":
      return "stable";
    case "entity-id":
      return "stable";
    default:
      return "unknown";
  }
}

function traceHeaderOrigin(
  name: string,
  value: string,
  history: CapturedExchange[],
): DynamicValueOrigin {
  for (const ex of history) {
    if (!ex.response) continue;
    const setCookies = ex.response.headers.filter(
      (h) => h.name.toLowerCase() === "set-cookie",
    );
    for (const sc of setCookies) {
      if (sc.value.includes(value)) {
        const cookieName = sc.value.split("=")[0]!.trim();
        return { kind: "cookie", cookieName };
      }
    }
    if (ex.response.body?.kind === "json") {
      const found = findJsonPathContaining(ex.response.body.data, value);
      if (found) {
        return { kind: "previous-response", sourceRequestId: ex.request.id, jsonPath: found };
      }
    }
  }
  return { kind: "header", headerName: name };
}

function traceCookieOrigin(cookieName: string, history: CapturedExchange[]): DynamicValueOrigin {
  for (const ex of history) {
    if (!ex.response) continue;
    const setCookies = ex.response.headers.filter(
      (h) => h.name.toLowerCase() === "set-cookie",
    );
    for (const sc of setCookies) {
      if (sc.value.toLowerCase().startsWith(cookieName.toLowerCase() + "=")) {
        return { kind: "previous-response", sourceRequestId: ex.request.id, jsonPath: "Set-Cookie" };
      }
    }
  }
  return { kind: "cookie", cookieName };
}

function traceIdOrigin(value: string, history: CapturedExchange[]): DynamicValueOrigin {
  for (const ex of history) {
    if (!ex.response) continue;
    if (ex.response.body?.kind === "json") {
      const path = findJsonPathContaining(ex.response.body.data, value);
      if (path) {
        return { kind: "previous-response", sourceRequestId: ex.request.id, jsonPath: path };
      }
    }
  }
  if (UUID_REGEX.test(value)) {
    return { kind: "client-generated", generator: "uuid" };
  }
  return { kind: "unknown" };
}

function findJsonPathContaining(data: unknown, target: string, path: string[] = []): string | null {
  if (typeof data === "string") {
    return data === target ? path.join(".") || "$" : null;
  }
  if (Array.isArray(data)) {
    for (let i = 0; i < data.length; i++) {
      const found = findJsonPathContaining(data[i], target, [...path, String(i)]);
      if (found) return found;
    }
    return null;
  }
  if (typeof data === "object" && data !== null) {
    for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
      const found = findJsonPathContaining(v, target, [...path, k]);
      if (found) return found;
    }
  }
  return null;
}

export { findJsonPathContaining };

export type DynamicValueLocationOut = DynamicValueLocation;
