import type {
  CapturedBody,
  FieldRole,
  InferredType,
  PayloadField,
  PayloadSchema,
} from "../core/types.js";
import { inferType } from "./response-modeler.js";

export function diffPayloads(bodies: CapturedBody[]): PayloadSchema {
  const jsonObjects = bodies
    .filter((b): b is Extract<CapturedBody, { kind: "json" }> => b.kind === "json")
    .map((b) => b.data)
    .filter((d): d is Record<string, unknown> => isObject(d));

  const formObjects = bodies
    .filter((b): b is Extract<CapturedBody, { kind: "form" }> => b.kind === "form")
    .map((b) => b.data as Record<string, unknown>);

  const samples = [...jsonObjects, ...formObjects];
  if (samples.length === 0) {
    return { fields: [], minimal: {} };
  }

  const allKeys = collectAllKeyPaths(samples);
  const fields: PayloadField[] = [];
  for (const path of allKeys) {
    fields.push(buildField(path, samples));
  }
  const minimal = buildMinimal(samples, fields);
  return { fields, minimal };
}

function collectAllKeyPaths(samples: Array<Record<string, unknown>>): string[] {
  const set = new Set<string>();
  const walk = (val: unknown, prefix: string) => {
    if (!isObject(val)) return;
    for (const [k, v] of Object.entries(val)) {
      const p = prefix ? `${prefix}.${k}` : k;
      set.add(p);
      if (isObject(v)) walk(v, p);
    }
  };
  for (const s of samples) walk(s, "");
  return [...set].sort();
}

function buildField(path: string, samples: Array<Record<string, unknown>>): PayloadField {
  const values: unknown[] = [];
  let presentCount = 0;
  for (const sample of samples) {
    const lookup = getByPath(sample, path);
    if (lookup.present) {
      presentCount++;
      values.push(lookup.value);
    }
  }
  const total = samples.length;
  const allPresent = presentCount === total;
  const distinct = uniqueByJson(values);
  const role: FieldRole = determineRole(allPresent, distinct);
  const field: PayloadField = {
    path,
    role,
    inferredType: inferUnionType(values),
    sampleValues: distinct.slice(0, 5),
  };
  if (role === "constant" && distinct.length === 1) {
    field.constantValue = distinct[0];
  }
  return field;
}

function determineRole(allPresent: boolean, distinctValues: unknown[]): FieldRole {
  if (allPresent && distinctValues.length === 1) return "constant";
  if (allPresent) return "required";
  return "optional";
}

function buildMinimal(
  samples: Array<Record<string, unknown>>,
  fields: PayloadField[],
): Record<string, unknown> {
  const required = fields.filter((f) => f.role === "required" || f.role === "constant");
  const out: Record<string, unknown> = {};
  for (const field of required) {
    const segments = field.path.split(".");
    let target = out;
    for (let i = 0; i < segments.length - 1; i++) {
      const seg = segments[i]!;
      if (!isObject(target[seg])) target[seg] = {};
      target = target[seg] as Record<string, unknown>;
    }
    const leaf = segments[segments.length - 1]!;
    if (field.role === "constant" && field.constantValue !== undefined) {
      target[leaf] = field.constantValue;
    } else {
      // Pick the first present sample value as placeholder template
      const sample = field.sampleValues[0];
      target[leaf] = sample !== undefined ? sample : placeholderFor(field.inferredType);
    }
  }
  return out;
}

function placeholderFor(t: InferredType): unknown {
  switch (t.kind) {
    case "string":
      return "";
    case "number":
      return 0;
    case "boolean":
      return false;
    case "null":
      return null;
    case "array":
      return [];
    case "object":
      return {};
    case "union": {
      const first = t.options[0];
      return first ? placeholderFor(first) : null;
    }
    case "unknown":
      return null;
  }
}

function inferUnionType(values: unknown[]): InferredType {
  if (values.length === 0) return { kind: "unknown" };
  const types = values.map((v) => inferType(v));
  return mergeTypes(types);
}

function mergeTypes(types: InferredType[]): InferredType {
  const filtered = types.filter((t) => t.kind !== "null");
  const hasNull = types.length !== filtered.length;
  const unique = uniqueByJson(filtered);
  let merged: InferredType;
  if (unique.length === 0) merged = { kind: "null" };
  else if (unique.length === 1) merged = unique[0] as InferredType;
  else merged = { kind: "union", options: unique as InferredType[] };
  if (hasNull && merged.kind !== "null") {
    if (merged.kind === "union") {
      merged.options.push({ kind: "null" });
    } else {
      merged = { kind: "union", options: [merged, { kind: "null" }] };
    }
  }
  return merged;
}

function getByPath(obj: Record<string, unknown>, path: string): { present: boolean; value: unknown } {
  const segments = path.split(".");
  let cur: unknown = obj;
  for (const seg of segments) {
    if (!isObject(cur)) return { present: false, value: undefined };
    if (!(seg in cur)) return { present: false, value: undefined };
    cur = (cur as Record<string, unknown>)[seg];
  }
  return { present: true, value: cur };
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function uniqueByJson<T>(values: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const v of values) {
    const key = JSON.stringify(v);
    if (!seen.has(key)) {
      seen.add(key);
      out.push(v);
    }
  }
  return out;
}
