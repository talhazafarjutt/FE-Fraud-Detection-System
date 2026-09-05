/**
 * RFC 9457 problem+json. The backend returns this shape for every error, with
 * Content-Type: application/problem+json. Some errors carry extra members —
 * e.g. `allowed_transitions` on a 409 from the alert state machine — so we keep
 * everything we did not recognise in `extras` and surface it in the UI.
 */
export interface Problem {
  status: number;
  title: string;
  detail: string;
  type?: string;
  instance?: string;
  extras: Record<string, unknown>;
  /** Seconds from a Retry-After header, when the server sent one. */
  retryAfter?: number;
}

const KNOWN = new Set(['type', 'title', 'status', 'detail', 'instance']);

const GENERIC_TITLES: Record<number, string> = {
  400: 'Bad request',
  401: 'Session expired',
  403: 'Not permitted',
  404: 'Not found',
  409: 'Conflict',
  422: 'Invalid input',
  429: 'Too many attempts',
  500: 'Server error',
  502: 'Service unavailable',
  503: 'Service unavailable',
};

function parseRetryAfter(header: string | null): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds);
  const at = Date.parse(header);
  if (Number.isNaN(at)) return undefined;
  return Math.max(0, Math.ceil((at - Date.now()) / 1000));
}

/**
 * FastAPI/Pydantic 422s come back as `{detail: [{loc, msg, type}, ...]}`.
 * Flatten that into one readable sentence rather than dumping JSON at a user.
 */
function flattenValidationDetail(detail: unknown): string | undefined {
  if (!Array.isArray(detail)) return undefined;
  const parts = detail
    .map((entry) => {
      if (typeof entry !== 'object' || entry === null) return null;
      const e = entry as { loc?: unknown; msg?: unknown };
      const msg = typeof e.msg === 'string' ? e.msg : null;
      if (!msg) return null;
      const loc = Array.isArray(e.loc)
        ? e.loc.filter((p) => p !== 'body').join('.')
        : '';
      return loc ? `${loc}: ${msg}` : msg;
    })
    .filter((p): p is string => Boolean(p));
  return parts.length ? parts.join('; ') : undefined;
}

export async function parseProblem(response: Response): Promise<Problem> {
  const retryAfter = parseRetryAfter(response.headers.get('Retry-After'));
  const fallbackTitle = GENERIC_TITLES[response.status] ?? 'Request failed';

  let body: unknown = null;
  try {
    const text = await response.text();
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }

  if (typeof body !== 'object' || body === null) {
    return {
      status: response.status,
      title: fallbackTitle,
      detail: `The server returned ${response.status} with no readable body.`,
      extras: {},
      ...(retryAfter !== undefined ? { retryAfter } : {}),
    };
  }

  const raw = body as Record<string, unknown>;
  const extras: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!KNOWN.has(key)) extras[key] = value;
  }

  const detail =
    typeof raw['detail'] === 'string'
      ? raw['detail']
      : (flattenValidationDetail(raw['detail']) ?? fallbackTitle);

  return {
    status: typeof raw['status'] === 'number' ? raw['status'] : response.status,
    title: typeof raw['title'] === 'string' ? raw['title'] : fallbackTitle,
    detail,
    ...(typeof raw['type'] === 'string' ? { type: raw['type'] } : {}),
    ...(typeof raw['instance'] === 'string' ? { instance: raw['instance'] } : {}),
    extras,
    ...(retryAfter !== undefined ? { retryAfter } : {}),
  };
}

/** Error carrying a parsed Problem, so query/mutation code can branch on status. */
export class ApiError extends Error {
  readonly problem: Problem;

  constructor(problem: Problem) {
    super(problem.detail || problem.title);
    this.name = 'ApiError';
    this.problem = problem;
  }

  get status(): number {
    return this.problem.status;
  }
}

/** Thrown when a response body fails its Zod schema — a contract drift, not a 4xx. */
export class SchemaError extends Error {
  readonly status = 0;

  constructor(endpoint: string, issues: string) {
    super(`Unexpected response shape from ${endpoint}: ${issues}`);
    this.name = 'SchemaError';
  }
}

export function isApiError(err: unknown): err is ApiError {
  return err instanceof ApiError;
}

export function errorStatus(err: unknown): number | undefined {
  if (err instanceof ApiError) return err.status;
  if (err instanceof SchemaError) return 0;
  return undefined;
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.problem.detail || err.problem.title;
  if (err instanceof Error) return err.message;
  return 'Something went wrong.';
}
