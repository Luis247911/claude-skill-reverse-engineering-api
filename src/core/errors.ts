export class ReverseEngineerError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "ReverseEngineerError";
  }
}

export class CaptureError extends ReverseEngineerError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = "CaptureError";
  }
}

export class SanitizerError extends ReverseEngineerError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = "SanitizerError";
  }
}

export class ParseError extends ReverseEngineerError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = "ParseError";
  }
}

export class AnalysisError extends ReverseEngineerError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = "AnalysisError";
  }
}

export class ReplayDriftError extends ReverseEngineerError {
  constructor(
    message: string,
    public readonly expected: unknown,
    public readonly actual: unknown,
  ) {
    super(message);
    this.name = "ReplayDriftError";
  }
}

export class GenerationError extends ReverseEngineerError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = "GenerationError";
  }
}
