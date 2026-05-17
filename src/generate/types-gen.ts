import type { InferredType } from "../core/types.js";

export function renderInlineType(t: InferredType): string {
  switch (t.kind) {
    case "string":
      return "string";
    case "number":
      return "number";
    case "boolean":
      return "boolean";
    case "null":
      return "null";
    case "array":
      return `Array<${renderInlineType(t.items)}>`;
    case "object": {
      const requiredSet = new Set(t.required);
      const fields = Object.entries(t.properties).map(([k, v]) => {
        const optional = requiredSet.has(k) ? "" : "?";
        return `  ${quoteKeyIfNeeded(k)}${optional}: ${renderInlineType(v)};`;
      });
      return `{\n${fields.join("\n")}\n}`;
    }
    case "union":
      return t.options.map((o) => renderInlineType(o)).join(" | ");
    case "unknown":
      return "unknown";
  }
}

export function renderNamedInterface(name: string, t: InferredType): string {
  if (t.kind !== "object") {
    return `export type ${name} = ${renderInlineType(t)};`;
  }
  const requiredSet = new Set(t.required);
  const fields = Object.entries(t.properties).map(([k, v]) => {
    const optional = requiredSet.has(k) ? "" : "?";
    return `  ${quoteKeyIfNeeded(k)}${optional}: ${renderInlineType(v)};`;
  });
  return `export interface ${name} {\n${fields.join("\n")}\n}`;
}

function quoteKeyIfNeeded(key: string): string {
  if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key)) return key;
  return JSON.stringify(key);
}
