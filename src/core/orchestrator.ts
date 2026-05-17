import { AnalysisError } from "./errors.js";
import type {
  AnalysisResult,
  CapturedExchange,
  Mutation,
  PayloadSchema,
  RunMetadata,
  Workflow,
} from "./types.js";
import { classifyExchanges, filterMutations } from "../analyze/request-classifier.js";
import { diffPayloads } from "../analyze/payload-diff.js";
import { traceDynamicValues } from "../analyze/dynamic-value-tracer.js";
import { inferType, mergeTypes } from "../analyze/response-modeler.js";
import { rebuildWorkflow } from "../analyze/workflow-rebuilder.js";
import { sanitizeExchange, defaultSanitizerOptions, type SanitizerOptions } from "../capture/sanitizer.js";
import { generateClient } from "../generate/client-gen.js";
import { renderErrorsModule } from "../generate/errors-gen.js";
import { renderApiMap } from "../generate/api-map-gen.js";
import { renderClientTests } from "../generate/tests-gen.js";

export interface AnalyzeInput {
  exchanges: CapturedExchange[];
  metadata: RunMetadata;
  sanitizer?: SanitizerOptions;
}

export interface GenerateOutput {
  clientTs: string;
  typesTs: string;
  errorsTs: string;
  apiMapMd: string;
  testsTs: string;
}

export function analyze(input: AnalyzeInput): AnalysisResult {
  if (input.exchanges.length === 0) {
    throw new AnalysisError("No exchanges to analyze");
  }
  const sanitizer = input.sanitizer ?? defaultSanitizerOptions();
  const sanitized = input.exchanges.map((ex) => sanitizeExchange(ex, sanitizer));
  const classified = classifyExchanges(sanitized);
  const mutations = buildMutations(classified);
  const lookups = classified.filter((c) => c.kind === "lookup" || c.kind === "metadata");
  const workflow = rebuildWorkflow(mutations, lookups, { goal: input.metadata.scope });
  const warnings = collectWarnings(classified, mutations);

  return {
    metadata: input.metadata,
    exchanges: classified,
    mutations,
    workflow,
    warnings,
  };
}

export function generate(result: AnalysisResult): GenerateOutput {
  const { clientTs, typesTs } = generateClient({
    baseUrlEnvVar: "TARGET_BASE_URL",
    mutations: result.mutations,
  });
  const errorsTs = renderErrorsModule(result.mutations.flatMap((m) => m.knownErrors));
  const apiMapMd = renderApiMap({
    scope: result.metadata.scope,
    baseUrl: result.metadata.targetBaseUrl,
    mutations: result.mutations,
    workflow: result.workflow,
  });
  const testsTs = renderClientTests(result.mutations);
  return { clientTs, typesTs, errorsTs, apiMapMd, testsTs };
}

function buildMutations(exchanges: CapturedExchange[]): Mutation[] {
  const mutationExchanges = filterMutations(exchanges);
  const groups = groupByPathTemplate(mutationExchanges);
  const out: Mutation[] = [];
  for (const [, group] of groups) {
    if (group.length === 0) continue;
    const first = group[0]!;
    const method = first.request.method;
    const pathTemplate = pathToTemplate(first.request.pathname);
    const resource = resourceNameFromPath(pathTemplate);
    const action = actionForMethod(method);
    const bodies = group.map((g) => g.request.body).filter((b): b is NonNullable<typeof b> => b !== null);
    const payload: PayloadSchema | null = bodies.length > 0 ? diffPayloads(bodies) : null;

    const responseTypes = group
      .map((g) => (g.response?.body?.kind === "json" ? g.response.body.data : null))
      .filter((d): d is unknown => d !== null)
      .map((d) => inferType(d));
    const responseType = responseTypes.length > 0 ? mergeTypes(responseTypes) : null;

    const history: CapturedExchange[] = [];
    for (const ex of exchanges) {
      if (ex === first) break;
      history.push(ex);
    }
    const dynamicValues = traceDynamicValues(first, history);

    out.push({
      id: makeMutationId(method, pathTemplate),
      resource,
      action,
      method,
      pathTemplate,
      exchanges: group,
      payload,
      responseType,
      dynamicValues,
      knownErrors: extractKnownErrors(group),
    });
  }
  return out;
}

function groupByPathTemplate(exchanges: CapturedExchange[]): Map<string, CapturedExchange[]> {
  const groups = new Map<string, CapturedExchange[]>();
  for (const ex of exchanges) {
    const template = pathToTemplate(ex.request.pathname);
    // Keep method in the key so different verbs on the same path do not collide.
    const key = `${ex.request.method} ${template}`;
    const list = groups.get(key) ?? [];
    list.push(ex);
    groups.set(key, list);
  }
  return groups;
}

const ID_SEGMENT_REGEX =
  /^(?:[a-z][a-z_]{1,15}_[A-Za-z0-9]{4,}|[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}|\d+|[0-9a-fA-F]{16,})$/;

function pathToTemplate(pathname: string): string {
  const segments = pathname.split("/").map((seg) => {
    if (!seg) return seg;
    if (ID_SEGMENT_REGEX.test(seg)) return `{${guessIdName(segments_lookahead(seg))}}`;
    return seg;
  });
  return segments.join("/") || "/";
}

function segments_lookahead(_seg: string): string {
  // placeholder hook for future smarter naming
  return "id";
}

function guessIdName(_fallback: string): string {
  return "id";
}

function resourceNameFromPath(pathTemplate: string): string {
  const segs = pathTemplate.split("/").filter((s) => s && !s.startsWith("{"));
  return segs[segs.length - 1] ?? "resource";
}

function actionForMethod(method: string): "create" | "update" | "replace" | "delete" | "custom" {
  switch (method) {
    case "POST":
      return "create";
    case "PATCH":
      return "update";
    case "PUT":
      return "replace";
    case "DELETE":
      return "delete";
    default:
      return "custom";
  }
}

function makeMutationId(method: string, pathTemplate: string): string {
  return `${method}-${pathTemplate.replace(/[\/{}\s]+/g, "-").replace(/^-+|-+$/g, "")}`.toLowerCase();
}

function extractKnownErrors(group: CapturedExchange[]): Mutation["knownErrors"] {
  const errors: Mutation["knownErrors"] = [];
  for (const ex of group) {
    if (!ex.response) continue;
    if (ex.response.status >= 400) {
      const body = ex.response.body?.kind === "json" ? (ex.response.body.data as Record<string, unknown>) : null;
      const error = body && typeof body === "object" ? (body.error as Record<string, unknown> | undefined) : undefined;
      const entry: Mutation["knownErrors"][number] = { status: ex.response.status };
      if (error?.code && typeof error.code === "string") entry.code = error.code;
      if (error?.message && typeof error.message === "string") entry.message = error.message;
      errors.push(entry);
    }
  }
  return errors;
}

function collectWarnings(exchanges: CapturedExchange[], mutations: Mutation[]): string[] {
  const warnings: string[] = [];
  if (mutations.length === 0) {
    warnings.push("No mutations detected; check whether the captured action triggered the expected request");
  }
  const unauthorized = exchanges.filter((ex) => ex.response?.status === 401);
  if (unauthorized.length > 0) {
    warnings.push(`${unauthorized.length} requests returned 401 — capture may have happened across a session boundary`);
  }
  return warnings;
}
