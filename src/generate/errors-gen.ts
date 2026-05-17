import type { KnownError } from "../core/types.js";

const STATUS_TO_CLASS: Record<number, string> = {
  400: "BadRequestError",
  401: "UnauthorizedError",
  403: "ForbiddenError",
  404: "NotFoundError",
  409: "ConflictError",
  422: "UnprocessableEntityError",
  429: "RateLimitError",
  500: "ServerError",
  502: "BadGatewayError",
  503: "ServiceUnavailableError",
};

export function renderErrorsModule(known: KnownError[]): string {
  const statuses = new Set<number>([400, 401, 403, 404, 409, 422, 429]);
  for (const k of known) statuses.add(k.status);

  const classes = [...statuses]
    .sort((a, b) => a - b)
    .map((status) => renderErrorClass(status, STATUS_TO_CLASS[status]));

  return [
    `export class ApiError extends Error {`,
    `  constructor(`,
    `    message: string,`,
    `    public readonly status: number,`,
    `    public readonly responseBody: unknown,`,
    `  ) {`,
    `    super(message);`,
    `    this.name = "ApiError";`,
    `  }`,
    `}`,
    "",
    ...classes,
    "",
    "export function classifyApiError(status: number, body: unknown): ApiError {",
    "  switch (status) {",
    ...[...statuses]
      .sort((a, b) => a - b)
      .map((s) => `    case ${s}: return new ${STATUS_TO_CLASS[s] ?? `ApiError_${s}`}(\`HTTP ${s}\`, ${s}, body);`),
    "    default: return new ApiError(`HTTP ${status}`, status, body);",
    "  }",
    "}",
    "",
  ].join("\n");
}

function renderErrorClass(status: number, className?: string): string {
  const name = className ?? `ApiError_${status}`;
  return [
    `export class ${name} extends ApiError {`,
    `  constructor(message: string, status = ${status}, body: unknown = undefined) {`,
    `    super(message, status, body);`,
    `    this.name = "${name}";`,
    `  }`,
    `}`,
  ].join("\n");
}
