import type { CapturedExchange, Mutation, Workflow, WorkflowStep } from "../core/types.js";

export interface RebuildOptions {
  goal: string;
}

export function rebuildWorkflow(
  mutations: Mutation[],
  lookups: CapturedExchange[],
  options: RebuildOptions,
): Workflow {
  const steps: WorkflowStep[] = [];
  const dependencies: Workflow["dependencies"] = [];

  for (const lookup of lookups) {
    const id = `lookup-${lookup.request.id}`;
    steps.push({
      id,
      exchangeId: lookup.request.id,
      description: `GET ${lookup.request.pathname}`,
      produces: extractIdsFromResponse(lookup),
      consumes: [],
    });
  }

  for (const mutation of mutations) {
    const id = `mut-${mutation.id}`;
    const consumes = extractConsumedIds(mutation);
    const produces = extractProducedIds(mutation);
    steps.push({
      id,
      mutationId: mutation.id,
      description: `${mutation.method} ${mutation.pathTemplate} (${mutation.action} ${mutation.resource})`,
      produces,
      consumes,
    });
  }

  for (const step of steps) {
    for (const consumed of step.consumes) {
      const producer = steps.find((s) => s.id !== step.id && s.produces.includes(consumed));
      if (producer) {
        dependencies.push({ from: producer.id, to: step.id, via: consumed });
      }
    }
  }

  return {
    goal: options.goal,
    steps: topoSort(steps, dependencies),
    dependencies,
  };
}

function extractIdsFromResponse(exchange: CapturedExchange): string[] {
  if (!exchange.response || exchange.response.body?.kind !== "json") return [];
  return collectIdValues(exchange.response.body.data);
}

function extractConsumedIds(mutation: Mutation): string[] {
  const ids = new Set<string>();
  for (const dv of mutation.dynamicValues) {
    if (dv.origin.kind === "previous-response") {
      ids.add(dv.exampleValue);
    }
  }
  return [...ids];
}

function extractProducedIds(mutation: Mutation): string[] {
  const produced = new Set<string>();
  for (const exchange of mutation.exchanges) {
    if (!exchange.response || exchange.response.body?.kind !== "json") continue;
    for (const v of collectIdValues(exchange.response.body.data)) produced.add(v);
  }
  return [...produced];
}

function collectIdValues(value: unknown): string[] {
  const out: string[] = [];
  const walk = (v: unknown) => {
    if (typeof v === "string" && looksLikeId(v)) out.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (typeof v === "object" && v !== null) {
      for (const inner of Object.values(v as Record<string, unknown>)) walk(inner);
    }
  };
  walk(value);
  return out;
}

const ID_REGEX = /^([a-z][a-z_]{1,15}_)?[A-Za-z0-9]{6,}$/;

function looksLikeId(v: string): boolean {
  if (v.length < 6) return false;
  if (v.includes(" ")) return false;
  if (ID_REGEX.test(v)) return true;
  // UUID
  if (/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(v)) return true;
  return false;
}

function topoSort(steps: WorkflowStep[], deps: Workflow["dependencies"]): WorkflowStep[] {
  const indegree = new Map<string, number>();
  for (const s of steps) indegree.set(s.id, 0);
  for (const d of deps) {
    indegree.set(d.to, (indegree.get(d.to) ?? 0) + 1);
  }
  const ready = steps.filter((s) => (indegree.get(s.id) ?? 0) === 0);
  const order: WorkflowStep[] = [];
  const remaining = new Set(steps.map((s) => s.id));
  while (ready.length > 0) {
    const next = ready.shift()!;
    order.push(next);
    remaining.delete(next.id);
    for (const d of deps.filter((dd) => dd.from === next.id)) {
      const cur = (indegree.get(d.to) ?? 0) - 1;
      indegree.set(d.to, cur);
      if (cur === 0) {
        const step = steps.find((s) => s.id === d.to);
        if (step && remaining.has(step.id)) ready.push(step);
      }
    }
  }
  // Append any remaining (cyclic) steps in original order to remain stable
  for (const s of steps) if (remaining.has(s.id)) order.push(s);
  return order;
}
