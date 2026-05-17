import type { CapturedExchange, CapturedRequest, RequestKind } from "../core/types.js";

const ASSET_EXTENSIONS = [
  ".js",
  ".css",
  ".png",
  ".jpg",
  ".jpeg",
  ".svg",
  ".gif",
  ".webp",
  ".ico",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
  ".map",
];

const ASSET_CONTENT_TYPES = [
  "text/css",
  "text/javascript",
  "application/javascript",
  "image/",
  "font/",
];

const ANALYTICS_PATH_HINTS = [
  "/analytics",
  "/track",
  "/telemetry",
  "/beacon",
  "/sentry",
  "/datadog",
  "/segment",
  "/mixpanel",
  "/posthog",
  "/amplitude",
  "/gtag",
  "/google-analytics",
  "/collect",
  "/feature-flag",
  "/launchdarkly",
];

const AUTH_PATH_HINTS = [
  "/login",
  "/logout",
  "/session",
  "/auth",
  "/oauth",
  "/sso",
  "/saml",
  "/token",
];

const METADATA_PATH_HINTS = [
  "/me",
  "/whoami",
  "/permissions",
  "/config",
  "/bootstrap",
  "/schema",
  "/metadata",
  "/form-config",
  "/form-options",
  "/form-schema",
  "/feature-flags",
];

export function classifyExchanges(exchanges: CapturedExchange[]): CapturedExchange[] {
  return exchanges.map((ex) => ({ ...ex, kind: classify(ex.request) }));
}

export function classify(request: CapturedRequest): RequestKind {
  if (isAsset(request)) return "asset";
  if (isAnalytics(request)) return "analytics";
  if (isAuth(request)) return "auth";
  if (isMetadata(request)) return "metadata";

  const method = request.method;
  if (method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE") {
    return "mutation";
  }
  if (method === "GET") return "lookup";
  return "unknown";
}

function isAsset(request: CapturedRequest): boolean {
  const path = request.pathname.toLowerCase();
  if (ASSET_EXTENSIONS.some((ext) => path.endsWith(ext))) return true;
  const ct = (request.contentType ?? "").toLowerCase();
  if (ASSET_CONTENT_TYPES.some((prefix) => ct.startsWith(prefix))) return true;
  return false;
}

function isAnalytics(request: CapturedRequest): boolean {
  const lower = request.pathname.toLowerCase();
  return ANALYTICS_PATH_HINTS.some((hint) => lower.includes(hint));
}

function isAuth(request: CapturedRequest): boolean {
  const lower = request.pathname.toLowerCase();
  return AUTH_PATH_HINTS.some((hint) => lower.includes(hint));
}

function isMetadata(request: CapturedRequest): boolean {
  if (request.method !== "GET") return false;
  const lower = request.pathname.toLowerCase();
  return METADATA_PATH_HINTS.some((hint) => lower.includes(hint));
}

export function filterMutations(exchanges: CapturedExchange[]): CapturedExchange[] {
  return exchanges.filter((ex) => ex.kind === "mutation");
}
