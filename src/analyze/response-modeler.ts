import type { InferredType } from "../core/types.js";

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const EMAIL_REGEX = /^[\w.+-]+@[\w-]+\.[\w.-]+$/;
const URL_REGEX = /^https?:\/\//;

export function inferType(value: unknown): InferredType {
  if (value === null) return { kind: "null" };
  if (typeof value === "string") {
    if (UUID_REGEX.test(value)) return { kind: "string", format: "uuid" };
    if (ISO_DATE_REGEX.test(value)) return { kind: "string", format: "iso-date" };
    if (EMAIL_REGEX.test(value)) return { kind: "string", format: "email" };
    if (URL_REGEX.test(value)) return { kind: "string", format: "url" };
    return { kind: "string" };
  }
  if (typeof value === "number") return { kind: "number", isInteger: Number.isInteger(value) };
  if (typeof value === "boolean") return { kind: "boolean" };
  if (Array.isArray(value)) {
    if (value.length === 0) return { kind: "array", items: { kind: "unknown" } };
    const itemTypes = value.map((v) => inferType(v));
    return { kind: "array", items: mergeTypes(itemTypes) };
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const properties: Record<string, InferredType> = {};
    const required: string[] = [];
    for (const [k, v] of Object.entries(obj)) {
      properties[k] = inferType(v);
      if (v !== undefined && v !== null) required.push(k);
    }
    return { kind: "object", properties, required };
  }
  return { kind: "unknown" };
}

export function mergeTypes(types: InferredType[]): InferredType {
  if (types.length === 0) return { kind: "unknown" };
  if (types.length === 1) return types[0]!;
  const objectTypes = types.filter((t): t is Extract<InferredType, { kind: "object" }> => t.kind === "object");
  if (objectTypes.length === types.length) return mergeObjectTypes(objectTypes);
  const unique = uniqueByJson(types);
  if (unique.length === 1) return unique[0]!;
  return { kind: "union", options: unique };
}

function mergeObjectTypes(types: Array<Extract<InferredType, { kind: "object" }>>): InferredType {
  const allKeys = new Set<string>();
  for (const t of types) for (const k of Object.keys(t.properties)) allKeys.add(k);
  const properties: Record<string, InferredType> = {};
  const required: string[] = [];
  for (const key of allKeys) {
    const presentIn: InferredType[] = [];
    let presentCount = 0;
    for (const t of types) {
      const p = t.properties[key];
      if (p !== undefined) {
        presentIn.push(p);
        presentCount++;
      }
    }
    properties[key] = mergeTypes(presentIn);
    if (presentCount === types.length) required.push(key);
  }
  return { kind: "object", properties, required };
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
