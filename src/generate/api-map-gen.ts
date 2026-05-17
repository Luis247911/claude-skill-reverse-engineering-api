import type { Mutation, Workflow } from "../core/types.js";

export interface ApiMapInput {
  scope: string;
  baseUrl: string;
  mutations: Mutation[];
  workflow: Workflow;
}

export function renderApiMap(input: ApiMapInput): string {
  const sections: string[] = [];
  sections.push(`# API Map`);
  sections.push("");
  sections.push(`**Scope:** ${input.scope}`);
  sections.push(`**Base URL:** \`${input.baseUrl}\``);
  sections.push("");
  sections.push(`## Workflow: ${input.workflow.goal}`);
  sections.push("");
  for (const step of input.workflow.steps) {
    sections.push(`- ${step.description}`);
  }
  sections.push("");
  for (const mutation of input.mutations) {
    sections.push(renderMutationSection(mutation));
    sections.push("");
  }
  return sections.join("\n");
}

function renderMutationSection(m: Mutation): string {
  const lines: string[] = [];
  lines.push(`## ${m.action} ${m.resource}`);
  lines.push("");
  lines.push(`**Method:** ${m.method}`);
  lines.push(`**Path:** \`${m.pathTemplate}\``);
  if (m.payload && m.payload.fields.length > 0) {
    lines.push("");
    lines.push(`**Required body:**`);
    for (const f of m.payload.fields.filter((x) => x.role === "required" || x.role === "constant")) {
      lines.push(`- \`${f.path}\`${f.role === "constant" ? ` (constant: \`${JSON.stringify(f.constantValue)}\`)` : ""}`);
    }
    const optional = m.payload.fields.filter((x) => x.role === "optional");
    if (optional.length > 0) {
      lines.push("");
      lines.push(`**Optional body:**`);
      for (const f of optional) lines.push(`- \`${f.path}\``);
    }
  }
  if (m.dynamicValues.length > 0) {
    lines.push("");
    lines.push(`**Dynamic values:**`);
    for (const dv of m.dynamicValues) {
      const loc = describeLocation(dv.location);
      const origin = describeOrigin(dv.origin);
      lines.push(`- \`${dv.kind}\` at ${loc} — origin: ${origin} — rotation: ${dv.rotation}`);
    }
  }
  if (m.knownErrors.length > 0) {
    lines.push("");
    lines.push(`**Known errors:**`);
    for (const e of m.knownErrors) {
      lines.push(`- ${e.status}${e.code ? ` (${e.code})` : ""}: ${e.message ?? ""}`);
    }
  }
  return lines.join("\n");
}

function describeLocation(loc: Mutation["dynamicValues"][number]["location"]): string {
  switch (loc.kind) {
    case "header":
      return `header \`${loc.name}\``;
    case "cookie":
      return `cookie \`${loc.name}\``;
    case "url-segment":
      return `URL segment #${loc.segmentIndex}`;
    case "query":
      return `query \`${loc.name}\``;
    case "body":
      return `body \`${loc.jsonPath}\``;
  }
}

function describeOrigin(origin: Mutation["dynamicValues"][number]["origin"]): string {
  switch (origin.kind) {
    case "previous-response":
      return `response of \`${origin.sourceRequestId}\` at \`${origin.jsonPath}\``;
    case "url-segment":
      return `URL segment #${origin.segmentIndex} of \`${origin.sourceRequestId}\``;
    case "cookie":
      return `cookie \`${origin.cookieName}\``;
    case "header":
      return `header \`${origin.headerName}\``;
    case "storage":
      return `${origin.storage}Storage[\`${origin.key}\`]`;
    case "html":
      return `HTML \`${origin.selector}\``;
    case "client-generated":
      return `client-generated (${origin.generator})`;
    case "static":
      return `static \`${origin.value}\``;
    case "unknown":
      return "unknown";
  }
}
