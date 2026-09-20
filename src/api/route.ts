import type { paths } from './schema';

/**
 * Every request path is built here, from the generated OpenAPI schema.
 *
 * WHY THIS EXISTS
 * A previous brief listed endpoints that had never been deployed. The console
 * was written against them, they 404'd, and the screens looked broken. Nothing
 * in the type system objected, because a path was just a string.
 *
 * Now a path is `keyof paths` — generated from the backend's own
 * `/openapi.json`. `route('/v1/cases')` compiles; `route('/v1/case')` does not.
 * A route that does not exist on the backend cannot reach a `fetch` call.
 */

/** Every path the backend publishes. */
export type ApiPath = keyof paths & string;

/**
 * Path params pulled out of the template itself, so `/v1/cases/{case_id}`
 * demands `{ case_id }` and nothing else. A renamed backend param becomes a
 * type error at the call site rather than a literal "{case_id}" in a URL.
 */
type PathParams<P extends string> = P extends `${string}{${infer Key}}${infer Rest}`
  ? Key | PathParams<Rest>
  : never;

export type QueryValue = string | number | boolean | undefined | null;

/**
 * Branded so only `route()` can produce one. `request()` takes this type, which
 * is what stops a hand-assembled template string from slipping through.
 */
export type ApiRoute = string & { readonly __apiRoute: unique symbol };

/** Build a query string, dropping empty values so we never send `?status=`. */
export function queryString(params: Record<string, QueryValue>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }
  const encoded = search.toString();
  return encoded ? `?${encoded}` : '';
}

type RouteArgs<P extends string> = [PathParams<P>] extends [never]
  ? [query?: Record<string, QueryValue>]
  : [params: Record<PathParams<P>, string>, query?: Record<string, QueryValue>];

export function route<P extends ApiPath>(template: P, ...rest: RouteArgs<P>): ApiRoute {
  const [first, second] = rest as [
    Record<string, string> | Record<string, QueryValue> | undefined,
    Record<string, QueryValue> | undefined,
  ];

  const hasParams = template.includes('{');
  const params = (hasParams ? first : undefined) as Record<string, string> | undefined;
  const query = (hasParams ? second : first) as Record<string, QueryValue> | undefined;

  const path = template.replace(/\{([^}]+)\}/g, (_match, key: string) => {
    const value = params?.[key];
    if (value === undefined || value === null || value === '') {
      throw new Error(`Missing path parameter "${key}" for ${template}`);
    }
    // Ids are UUIDs, but encoding is not optional: an unencoded value is how a
    // path segment turns into an extra one.
    return encodeURIComponent(String(value));
  });

  return `${path}${query ? queryString(query) : ''}` as ApiRoute;
}

/**
 * Escape hatch for the two non-versioned health probes and for tests. Named to
 * be greppable — if this shows up in a feature, something has gone around the
 * generated schema.
 */
export function unsafeRoute(path: string): ApiRoute {
  return path as ApiRoute;
}
