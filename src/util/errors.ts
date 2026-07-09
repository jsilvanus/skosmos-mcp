export class SkosmosError extends Error {
  readonly code: string;
  readonly details?: unknown;

  constructor(message: string, code: string, details?: unknown) {
    super(message);
    this.name = 'SkosmosError';
    this.code = code;
    this.details = details;
  }
}

export class NetworkError extends SkosmosError {
  constructor(message: string, details?: unknown) {
    super(message, 'NETWORK_ERROR', details);
    this.name = 'NetworkError';
  }
}

export class NotFoundError extends SkosmosError {
  constructor(message: string, details?: unknown) {
    super(message, 'NOT_FOUND', details);
    this.name = 'NotFoundError';
  }
}

export class InvalidVocabularyError extends SkosmosError {
  constructor(message: string, details?: unknown) {
    super(message, 'INVALID_VOCABULARY', details);
    this.name = 'InvalidVocabularyError';
  }
}

export class TraversalDepthError extends SkosmosError {
  constructor(message: string, details?: unknown) {
    super(message, 'TRAVERSAL_DEPTH_ERROR', details);
    this.name = 'TraversalDepthError';
  }
}

export class ConfigurationError extends SkosmosError {
  constructor(message: string, details?: unknown) {
    super(message, 'CONFIGURATION_ERROR', details);
    this.name = 'ConfigurationError';
  }
}

export class ApiError extends SkosmosError {
  readonly statusCode: number;

  constructor(message: string, statusCode: number, details?: unknown) {
    super(message, 'API_ERROR', details);
    this.name = 'ApiError';
    this.statusCode = statusCode;
  }
}

export function translateHttpError(status: number, body: string, url: string): SkosmosError {
  const details = { url, body };
  if (status === 404) {
    return new NotFoundError(`Resource not found: ${url}`, details);
  }
  if (status === 400) {
    return new ApiError(`Bad request to ${url}: ${body}`, 400, details);
  }
  if (status === 401 || status === 403) {
    return new ApiError(`Unauthorized access to ${url}`, status, details);
  }
  return new ApiError(`HTTP ${status} from ${url}: ${body}`, status, details);
}
