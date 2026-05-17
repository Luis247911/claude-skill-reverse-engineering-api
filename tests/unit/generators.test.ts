import { describe, expect, it } from "vitest";
import { generateClient } from "../../src/generate/client-gen.js";
import { renderErrorsModule } from "../../src/generate/errors-gen.js";
import { renderApiMap } from "../../src/generate/api-map-gen.js";
import type { Mutation } from "../../src/core/types.js";

const sampleMutation: Mutation = {
  id: "create-candidate",
  resource: "candidates",
  action: "create",
  method: "POST",
  pathTemplate: "/api/candidates",
  exchanges: [
    {
      request: {
        id: "r",
        method: "POST",
        url: "https://x/api/candidates",
        origin: "https://x",
        pathname: "/api/candidates",
        query: {},
        headers: [],
        contentType: "application/json",
        body: null,
        startedAt: "",
      },
      response: {
        status: 201,
        statusText: "Created",
        headers: [],
        contentType: "application/json",
        body: { kind: "json", data: { id: "cand_1" }, raw: "" },
        durationMs: 5,
      },
      kind: "mutation",
    },
  ],
  payload: {
    fields: [
      {
        path: "firstName",
        role: "required",
        inferredType: { kind: "string" },
        sampleValues: ["Max"],
      },
    ],
    minimal: { firstName: "Max" },
  },
  responseType: { kind: "object", properties: { id: { kind: "string" } }, required: ["id"] },
  dynamicValues: [],
  knownErrors: [],
};

describe("generateClient", () => {
  it("emits a client method per mutation", () => {
    const { clientTs, typesTs } = generateClient({
      baseUrlEnvVar: "TARGET_BASE_URL",
      mutations: [sampleMutation],
    });
    expect(clientTs).toContain("createCandidate");
    expect(clientTs).toContain("class ApiClient");
    expect(typesTs).toContain("CreateCandidateInput");
    expect(typesTs).toContain("CreateCandidateResult");
  });

  it("renders path templates with encodeURIComponent for params", () => {
    const m: Mutation = {
      ...sampleMutation,
      id: "attach-to-job",
      resource: "applications",
      pathTemplate: "/api/candidates/{candidateId}/applications",
      payload: null,
    };
    const { clientTs } = generateClient({ baseUrlEnvVar: "X", mutations: [m] });
    expect(clientTs).toContain("encodeURIComponent(input.candidateId)");
  });
});

describe("renderErrorsModule", () => {
  it("includes the standard status-class mapping", () => {
    const out = renderErrorsModule([]);
    expect(out).toContain("class UnauthorizedError");
    expect(out).toContain("class RateLimitError");
    expect(out).toContain("classifyApiError");
  });
});

describe("renderApiMap", () => {
  it("produces a markdown section per mutation", () => {
    const md = renderApiMap({
      scope: "candidate import",
      baseUrl: "https://app.example.com",
      mutations: [sampleMutation],
      workflow: { goal: "candidate import", steps: [], dependencies: [] },
    });
    expect(md).toContain("# API Map");
    expect(md).toContain("## create candidates");
    expect(md).toContain("**Method:** POST");
  });
});
