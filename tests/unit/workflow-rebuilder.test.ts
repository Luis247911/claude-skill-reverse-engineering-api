import { describe, expect, it } from "vitest";
import { rebuildWorkflow } from "../../src/analyze/workflow-rebuilder.js";
import type { CapturedExchange, Mutation } from "../../src/core/types.js";

const jobsLookup: CapturedExchange = {
  request: {
    id: "lookup-jobs",
    method: "GET",
    url: "https://app.example.com/api/jobs",
    origin: "https://app.example.com",
    pathname: "/api/jobs",
    query: {},
    headers: [],
    contentType: null,
    body: null,
    startedAt: "",
  },
  response: {
    status: 200,
    statusText: "OK",
    headers: [],
    contentType: "application/json",
    body: {
      kind: "json",
      data: { jobs: [{ id: "job_abc123", title: "Engineer" }] },
      raw: "",
    },
    durationMs: 5,
  },
  kind: "lookup",
};

const createCandidate: Mutation = {
  id: "create-candidate",
  resource: "candidates",
  action: "create",
  method: "POST",
  pathTemplate: "/api/candidates",
  exchanges: [
    {
      request: {
        id: "req-create",
        method: "POST",
        url: "https://app.example.com/api/candidates",
        origin: "https://app.example.com",
        pathname: "/api/candidates",
        query: {},
        headers: [],
        contentType: "application/json",
        body: {
          kind: "json",
          data: { jobId: "job_abc123", email: "x@y.com" },
          raw: "",
        },
        startedAt: "",
      },
      response: {
        status: 201,
        statusText: "Created",
        headers: [],
        contentType: "application/json",
        body: {
          kind: "json",
          data: { id: "cand_xyz789", email: "x@y.com" },
          raw: "",
        },
        durationMs: 5,
      },
      kind: "mutation",
    },
  ],
  payload: null,
  responseType: null,
  dynamicValues: [
    {
      kind: "entity-id",
      placeholder: "<JOB_ID>",
      exampleValue: "job_abc123",
      location: { kind: "body", jsonPath: "jobId" },
      origin: { kind: "previous-response", sourceRequestId: "lookup-jobs", jsonPath: "jobs.0.id" },
      rotation: "stable",
    },
  ],
  knownErrors: [],
};

const attachToJob: Mutation = {
  id: "attach-to-job",
  resource: "applications",
  action: "create",
  method: "POST",
  pathTemplate: "/api/candidates/{candidateId}/applications",
  exchanges: [
    {
      request: {
        id: "req-attach",
        method: "POST",
        url: "https://app.example.com/api/candidates/cand_xyz789/applications",
        origin: "https://app.example.com",
        pathname: "/api/candidates/cand_xyz789/applications",
        query: {},
        headers: [],
        contentType: "application/json",
        body: { kind: "json", data: { jobId: "job_abc123" }, raw: "" },
        startedAt: "",
      },
      response: null,
      kind: "mutation",
    },
  ],
  payload: null,
  responseType: null,
  dynamicValues: [
    {
      kind: "entity-id",
      placeholder: "<CANDIDATE_ID>",
      exampleValue: "cand_xyz789",
      location: { kind: "url-segment", segmentIndex: 2 },
      origin: { kind: "previous-response", sourceRequestId: "req-create", jsonPath: "id" },
      rotation: "stable",
    },
  ],
  knownErrors: [],
};

describe("rebuildWorkflow", () => {
  it("orders steps topologically by data dependencies", () => {
    const wf = rebuildWorkflow([createCandidate, attachToJob], [jobsLookup], { goal: "import candidate" });
    const order = wf.steps.map((s) => s.id);
    expect(order.indexOf("lookup-lookup-jobs")).toBeLessThan(order.indexOf("mut-create-candidate"));
    expect(order.indexOf("mut-create-candidate")).toBeLessThan(order.indexOf("mut-attach-to-job"));
  });

  it("collects dependencies with the linking id", () => {
    const wf = rebuildWorkflow([createCandidate, attachToJob], [jobsLookup], { goal: "x" });
    expect(wf.dependencies.find((d) => d.via === "job_abc123")).toBeDefined();
    expect(wf.dependencies.find((d) => d.via === "cand_xyz789")).toBeDefined();
  });
});
