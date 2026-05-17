export type HttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "HEAD"
  | "OPTIONS";

export type RequestKind =
  | "asset"
  | "analytics"
  | "auth"
  | "lookup"
  | "mutation"
  | "metadata"
  | "unknown";

export interface CapturedHeader {
  name: string;
  value: string;
}

export interface CapturedRequest {
  id: string;
  method: HttpMethod;
  url: string;
  origin: string;
  pathname: string;
  query: Record<string, string>;
  headers: CapturedHeader[];
  contentType: string | null;
  body: CapturedBody | null;
  startedAt: string;
  initiator?: string;
}

export interface CapturedResponse {
  status: number;
  statusText: string;
  headers: CapturedHeader[];
  contentType: string | null;
  body: CapturedBody | null;
  durationMs: number;
}

export type CapturedBody =
  | { kind: "json"; data: unknown; raw: string }
  | { kind: "form"; data: Record<string, string>; raw: string }
  | { kind: "multipart"; parts: MultipartPart[]; raw: string }
  | { kind: "text"; data: string; raw: string }
  | { kind: "binary"; sizeBytes: number };

export interface MultipartPart {
  name: string;
  filename: string | null;
  contentType: string | null;
  sizeBytes: number;
}

export interface CapturedExchange {
  request: CapturedRequest;
  response: CapturedResponse | null;
  kind: RequestKind;
}

export type FieldRole = "required" | "optional" | "constant" | "frontend" | "backend";

export interface PayloadField {
  path: string;
  role: FieldRole;
  inferredType: InferredType;
  sampleValues: unknown[];
  constantValue?: unknown;
}

export interface PayloadSchema {
  fields: PayloadField[];
  minimal: Record<string, unknown>;
}

export type DynamicValueKind =
  | "csrf"
  | "jwt"
  | "session-cookie"
  | "bearer"
  | "tenant-id"
  | "organization-id"
  | "user-id"
  | "workspace-id"
  | "entity-id"
  | "timestamp"
  | "nonce"
  | "request-id"
  | "cursor"
  | "unknown";

export type DynamicValueOrigin =
  | { kind: "previous-response"; sourceRequestId: string; jsonPath: string }
  | { kind: "url-segment"; sourceRequestId: string; segmentIndex: number }
  | { kind: "cookie"; cookieName: string }
  | { kind: "header"; headerName: string }
  | { kind: "storage"; storage: "local" | "session"; key: string }
  | { kind: "html"; selector: string }
  | { kind: "client-generated"; generator: "uuid" | "timestamp" | "nonce" }
  | { kind: "static"; value: string }
  | { kind: "unknown" };

export interface DynamicValue {
  kind: DynamicValueKind;
  placeholder: string;
  exampleValue: string;
  location: DynamicValueLocation;
  origin: DynamicValueOrigin;
  rotation: "stable" | "per-session" | "per-request" | "unknown";
}

export type DynamicValueLocation =
  | { kind: "header"; name: string }
  | { kind: "cookie"; name: string }
  | { kind: "url-segment"; segmentIndex: number }
  | { kind: "query"; name: string }
  | { kind: "body"; jsonPath: string };

export type InferredType =
  | { kind: "string"; format?: "email" | "uuid" | "iso-date" | "url" }
  | { kind: "number"; isInteger: boolean }
  | { kind: "boolean" }
  | { kind: "null" }
  | { kind: "array"; items: InferredType }
  | { kind: "object"; properties: Record<string, InferredType>; required: string[] }
  | { kind: "union"; options: InferredType[] }
  | { kind: "unknown" };

export interface Mutation {
  id: string;
  resource: string;
  action: "create" | "update" | "replace" | "delete" | "custom";
  method: HttpMethod;
  pathTemplate: string;
  exchanges: CapturedExchange[];
  payload: PayloadSchema | null;
  responseType: InferredType | null;
  dynamicValues: DynamicValue[];
  knownErrors: KnownError[];
}

export interface KnownError {
  status: number;
  code?: string;
  message?: string;
  triggeredBy?: string;
}

export interface WorkflowStep {
  id: string;
  mutationId?: string;
  exchangeId?: string;
  description: string;
  produces: string[];
  consumes: string[];
}

export interface Workflow {
  goal: string;
  steps: WorkflowStep[];
  dependencies: Array<{ from: string; to: string; via: string }>;
}

export interface RunMetadata {
  runId: string;
  scope: string;
  startedAt: string;
  targetBaseUrl: string;
  captureSource: "chrome-mcp" | "har" | "curl";
  notes?: string;
}

export interface AnalysisResult {
  metadata: RunMetadata;
  exchanges: CapturedExchange[];
  mutations: Mutation[];
  workflow: Workflow;
  warnings: string[];
}
