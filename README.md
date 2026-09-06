# Civitas AI — Fraud Intelligence Console

Analyst-facing web console for the Civitas fraud-detection platform. React 18 + TypeScript
(strict), Vite, TanStack Query, Zod, Tailwind. The backend is a separate repository and is treated
here as a fixed contract.

---

## 1. Running it

```bash
npm install
cp .env.example .env
npm run dev
```

The console is at <http://localhost:5173>. The backend must be reachable at the address in
`VITE_API_PROXY_TARGET` (default `http://localhost:8000`).

| Script | What it does |
|---|---|
| `npm run dev` | Dev server with HMR and the API proxy |
| `npm run build` | Type-check then production build into `dist/` |
| `npm run preview` | Serve the real build with the strict production CSP |
| `npm run typecheck` | `tsc -b --noEmit` |
| `npm run lint` | ESLint (`eslint-plugin-security`, zero warnings) then the dependency audit |
| `npm run test` | Vitest |
| `npm run analyze` | Build with `rollup-plugin-visualizer` → `dist/bundle-stats.html` |
| `npm run audit:prod` | `npm audit --omit=dev --audit-level=high` — part of the lint gate |
| `npm run audit:full` | Every advisory including the two documented moderates (§4.4) |

### Demo accounts (local seed, synthetic)

| Account | Password | Team | Role |
|---|---|---|---|
| `analyst@example.com` | `SyntheticDemo!2026` | team-alpha | ANALYST |
| `supervisor@example.com` | `SyntheticDemo!2026` | team-alpha | SUPERVISOR |
| `other-analyst@example.com` | `SyntheticDemo!2026` | team-beta | ANALYST |
| `admin@example.com` | `SyntheticDemo!2026` | default | ADMIN |

Machine clients: `ingest-loader` / `demo-ingest-secret-not-for-production`, and
`ml-service` / `demo-ml-secret-not-for-production`.

These render on the login page behind a **Demo accounts** disclosure that only exists when
`import.meta.env.DEV` is true.

### Offline mode — the insurance policy

```bash
VITE_USE_MSW=true npm run dev
```

MSW serves every endpoint from fixtures: 48 alerts across all four severities and all six
statuses, split across `team-alpha` and `team-beta`. The entire console — login, queue,
pagination, detail, state machine, transaction submission, idempotent replay, user admin — is
presentable with the backend down.

**Run the demo this way.** Two steps of the brief's script cannot work against the live backend
(§5.3 and §5.4); both work here. Verified in offline mode: a supervisor sees `team-alpha` *and*
`team-beta` rows, and submitting the structuring sample returns **201**, scores **98.0% CRITICAL**,
and raises a linked case.

`tests/fixtures-contract.test.ts` validates every fixture against the same Zod schemas the real
responses go through, so the offline path cannot drift from the contract unnoticed. It has already
earned its place: mock handlers were minting ids like `mock-txn-abc123`, which
`z.string().uuid()` correctly rejected, and the submission screen showed *"Unexpected response"*.
The fix was valid UUIDs in the mocks — not a looser schema, because that constraint is load-bearing
(§4.4).

---

## 2. CORS: the Vite dev proxy

**Option 2 from the brief was chosen.** `vite.config.ts` proxies `/v1`, `/healthz` and `/readyz` to
the backend, so the browser only ever talks to one origin and CORS never applies. The backend's
`CORS_ORIGINS` can stay empty; there is nothing to configure on the backend and one less thing to
fail on stage.

To point at a genuinely cross-origin API instead, set `VITE_API_BASE_URL` to that origin — it is
added to `connect-src` automatically — and add the origin to the backend's `CORS_ORIGINS`.

---

## 3. Measured bundle size

From `npm run build`, gzipped:

| Chunk | Gzipped | Loaded |
|---|---|---|
| `react` (react, react-dom, react-router) | 63.72 KB | eagerly |
| `index` (app shell, api client, auth) | 19.23 KB | eagerly |
| `query` (TanStack Query) | 13.17 KB | eagerly |
| `index.css` | 5.37 KB | eagerly |
| **Initial JS total** | **96.12 KB** | **budget was < 200 KB** |
| `zod` | 13.24 KB | first route |
| `AlertQueuePage` | 3.39 KB | on route |
| `AlertDetailPage` | 4.27 KB | on route |
| `TransactionsPage` | 7.63 KB | on route |
| `UsersPage` | 3.25 KB | on route |
| `DashboardPage` | on route | §15 dashboards |
| Recharts (`generateCategoricalChart` + chart chunks) | ~99 KB | **only when a chart renders** |

Recharts is nearly as large as the rest of the application combined, which is why it is confined to
`ExplanationChart.tsx` and `FlowChart.tsx` and pulled in by `React.lazy`. Verified: `recharts`
appears only in those lazy chunks and never in the eager graph.

Adding the §15 dashboards and the §16 feedback loop moved the initial bundle by **0.06 KB**
(96.12 → **96.18 KB** gzipped) for exactly that reason.

The Simulator screen is not merely unrouted when `VITE_ENABLE_SIMULATOR` is off — its `import()`
sits inside the flag check, so no chunk is emitted at all. Confirmed absent from `dist/assets/`.

---

## 4. Security posture

### Tokens are in memory only

The access token lives in a module-scoped variable in `src/auth/tokenStore.ts` and nowhere else.
It is never written to `localStorage` or `sessionStorage`; both are readable by any injected
script. ESLint fails the build on any call to either.

**The trade-off is real: a page refresh logs the user out.** That is the correct choice for a
financial-crime product, and for the demo you simply do not refresh.

### Known, deliberate gap — refresh token

The backend returns the refresh token in the JSON response body, so a pure `HttpOnly`-cookie design
is not available to the frontend alone. The refresh token therefore sits in the same in-memory
store.

**The production hardening step is a backend change**: set the refresh token as an
`HttpOnly; Secure; SameSite=Strict` cookie and stop returning it in the body. Until that lands this
is a prototype-level gap. It is documented rather than papered over.

### Single refresh mutex

The backend implements refresh-token reuse detection — presenting the same refresh token twice
revokes the entire family and forces a re-login. `src/api/client.ts` holds one shared in-flight
refresh promise so concurrent 401s all await the same refresh.

`tests/refresh-mutex.test.ts` pins four behaviours: concurrent 401s collapse to exactly one
refresh; a request is retried at most once; a rejected refresh clears the session; and a request
carrying a machine bearer override never triggers the human refresh path.

Refresh also happens proactively ~60 s before `expires_in` elapses.

### CSP

Dev and production get different policies, injected into `index.html` by a small Vite plugin.

Production (`npm run preview` and whatever serves `dist/`):

```
default-src 'self'; connect-src 'self'; img-src 'self' data:; font-src 'self';
style-src 'self' 'unsafe-inline'; script-src 'self'; object-src 'none';
base-uri 'none'; frame-ancestors 'none'
```

Two things worth knowing:

- **Dev needs `script-src 'self' 'unsafe-inline'`.** Vite's HMR client injects an inline preamble
  script; the strict policy blocks it and the app never mounts. This was caught during the build,
  not after. Production has no such allowance.
- **`frame-ancestors` is ignored in a `<meta>` tag** and logs an error when you try. It is stripped
  from the meta copy and delivered as a real header. **Whatever serves `dist/` in production must
  send `Content-Security-Policy`, `X-Content-Type-Options: nosniff` and `Referrer-Policy:
  no-referrer` as headers** — the meta tag alone is not sufficient.

Fonts are self-hosted via `@fontsource` precisely because of `font-src 'self'`. The console makes
**zero third-party requests** — verified in the network panel.

### 4.4 Dependency audit — two known moderates, analysed not ignored

`npm audit --omit=dev` reports two **moderate** advisories, both in `react-router`, both affecting
the entire 6.x line (`6.0.0 – 7.17.0`). They are fixed only in 7.18+, and the brief pins React
Router v6. Rather than silently bump the major or silently ignore them, here is the reachability
analysis:

| Advisory | Reachable here? |
|---|---|
| [GHSA-337j-9hxr-rhxg](https://github.com/advisories/GHSA-337j-9hxr-rhxg) — arbitrary constructor injection via `deserializeErrors()` during **SSR hydration** | **No.** This is a pure SPA: `createBrowserRouter` + `createRoot`, no `hydrateRoot`, no `StaticRouter`, no server rendering anywhere. The vulnerable code path does not run. |
| [GHSA-wrjc-x8rr-h8h6](https://github.com/advisories/GHSA-wrjc-x8rr-h8h6) — open redirect via a backslash in `<Link to>` / `useNavigate` | **No**, and the reason is enforced by a test. |

For the second: every route target in this codebase is either a hardcoded literal
(`/`, `/alerts`, `/login`, `/users`) or one of exactly two interpolations —
`/alerts/${alert.id}` in `AlertRow` and `/alerts/${alert.alert_id}` in `SubmissionResult`. Both
values come off the wire, so the advisory is closed only because those fields are validated as
UUIDs before they can reach a `Link`. A UUID cannot contain a backslash, a slash or a scheme
separator.

That makes the Zod schema a security control rather than a convenience, so
`tests/route-injection.test.ts` pins it: hostile ids (`\\evil.example`, `//evil.example`,
`http://evil.example`, `../../logout`, …) are rejected by `alertSchema`, by `alertRefSchema`, and
at the page level — one poisoned row fails the whole page rather than rendering a poisoned link.
If someone later loosens `uuid()` to `string()`, those tests fail.

**Gate policy:** `npm run lint` runs `npm audit --omit=dev --audit-level=high`, so the build fails
on anything high or critical while not blocking on these two analysed moderates. Run
`npm run audit:full` to see everything. **Revisit if the project ever adopts SSR, or if any route
target starts being built from user input** — either change makes these advisories live, and the
correct response then is to move to React Router 7.18+.

### 4.5 Security review — findings and evidence

A full pass over the frontend attack surface. Everything below was verified
empirically against the built output or by mutation-testing the guardrail, not
asserted from the code comments.

**Two issues were found and fixed.**

**Finding 1 — MSW service worker shipped to production (fixed).** `msw init` places
`mockServiceWorker.js` in `public/`, which Vite copies verbatim into `dist/`. The worker was never
*registered* in production — `worker.start()` sits behind a dead branch — but the file sat at a
predictable path on the origin. Anyone who achieved script execution could have registered it and
gained persistent, origin-wide interception of every request and response, surviving reloads: it
converts a transient XSS into durable MitM. It also advertised the mocking layer.
Fixed with a build plugin that removes it unless `VITE_USE_MSW=true`. Verified both directions: a
production build now emits `dist/index.html` and `dist/assets/` only, while an MSW build keeps its
worker.

**Finding 2 — admin create-user password field could autofill the admin's own credential (fixed).**
The field in `UsersPage` had no `autoComplete`, so a browser could offer the signed-in admin's saved
password into a field that sets *another* user's credential. Now `autoComplete="new-password"`. The
sign-in field correctly uses `current-password`; both machine-secret fields use `off`.

**Checks that came back clean:**

| Area | Method | Result |
|---|---|---|
| Secrets in the bundle | grep built `dist/` for all demo credentials, emails, client ids | None. Dead-code elimination removes the DEV blocks and the MSW import |
| Mock code in production | grep `dist/assets/` for MSW, fixtures | Absent |
| XSS sinks | grep for `dangerouslySetInnerHTML`, `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `srcdoc`, `javascript:` | None in live code (one mention in a comment) |
| Dynamic code execution | grep for `eval`, `new Function`, string `setTimeout` | None |
| Client-side persistence | grep for `localStorage`, `sessionStorage`, `document.cookie`, `indexedDB` | None |
| Token in URL / query / log | grep the api layer; audit every `console.*` | One DEV-guarded `console.error` in the error boundary, error + component stack only |
| `Authorization` attachment points | enumerate every file mentioning it | Exactly two: `api/client.ts` and the mock backend |
| Prototype pollution | user-controlled metadata keys reach `Object.fromEntries` — executed a probe with `__proto__` and `constructor` keys | Not exploitable: `Object.fromEntries` defines *own* properties, `Object.prototype` stays clean |
| Open redirect | every `<Link to>` and `navigate()` target; whether router `state.from` is read | All targets are literals or UUID-validated ids; `state.from` is stored but never used as a redirect target |
| ReDoS | every regex literal in `src/` | All bounded/linear. The one superlinear pattern was replaced with a linear digit walk and survives only in an explanatory comment |
| Third-party requests | network panel across the whole demo path | Zero. Fonts self-hosted; the only external string is a URL in a CSS comment |
| Production CSP | built `index.html` plus live preview-server headers | `script-src 'self'` with no `unsafe-inline`; `object-src`, `base-uri`, `frame-ancestors` all `'none'` |
| Clickjacking | `frame-ancestors` delivery | Absent from `<meta>` (browsers ignore it there) and present as a real header |

**Guardrails were proven to fire, not just configured.** A probe file using `localStorage`,
`sessionStorage` and `dangerouslySetInnerHTML` was linted: all three violations were reported and
the build would fail. `tests/security-invariants.test.ts` adds 13 checks for what a linter cannot
express — secrets confined to mocks or DEV blocks, no embedded JWTs, a single `Authorization`
attachment point, the strict production CSP, the service-worker strip, and the tree-shaken
simulator. Each was mutation-tested: weakening the production CSP and leaking a demo credential into
`src/lib/` both produced immediate, named failures.

**Residual risk, unchanged and previously documented:** the refresh token sits in memory because the
backend returns it in the response body (§4.2), and React Router 6.x carries two advisories that are
not reachable in this application (§4.4). Both need a change outside this frontend to close
properly.

### Other controls

- Every API response is validated with Zod before it reaches component state.
- No `dangerouslySetInnerHTML` anywhere; ESLint rejects it. Notes and display names are
  user-controlled and are rendered as text.
- No token in any URL, query string or log.
- Scope checks in the UI are usability, not security — every call still handles a 403/404.
- Machine credentials are typed by hand, never compiled in, never in a committed `.env`.
- Dependencies are pinned to exact versions and the lockfile is committed.

---

## 5. What the running backend actually does

The brief was verified against the live container rather than taken on trust. Everything in it
about endpoints, pagination, the state machine, scopes, thresholds and problem+json is accurate.
Four things differ, and the console is built around what the backend really does.

### 5.1 The access token carries no `team`, `email` or `roles` claim

Decoded from a real token, the payload is only:

```json
{ "sub": "...", "typ": "user", "scopes": [...], "iss": "...", "aud": "...",
  "iat": ..., "nbf": ..., "exp": ..., "jti": "..." }
```

There is no `/v1/users/me` either. So:

- **Email** is what the user typed at sign-in.
- **Role** is derived from the scope set (`roleLabel()` in `tokenStore.ts`) — a display label only.
  The backend authorises on scopes regardless.
- **Team** is inferred from the alert rows the server chose to return, since it filters to the
  caller's team. With `alerts:read:all` that inference is meaningless, so the header shows
  **All teams** instead.

None of this is decoded from the token, because the token does not carry it.

### 5.2 No human role can submit a transaction

`transactions:write` belongs to the `INGEST_CLIENT` machine client alone. Confirmed against the
running backend — both `analyst@` and `supervisor@` receive:

```json
{ "title": "Insufficient scope", "status": 403,
  "detail": "The token does not grant the required scope.",
  "required_scopes": ["transactions:write"] }
```

**This makes step 7 of the brief's demo script impossible as written** — an analyst cannot submit a
transaction.

Rather than smuggle machine credentials into the human login flow (which the brief explicitly
forbids, and which has caused confusion in this project before), the Transactions screen carries a
separate, banner-labelled **"Machine integration — not part of the analyst experience"** panel. An
operator opens a short-lived ingest session there by typing the client credentials; the resulting
token is held in `machineTokenStore.ts`, kept entirely apart from the human session, and passed per
request as an explicit bearer override. It never enters the human refresh path — machine tokens
return `refresh_token: ""` and have no family to refresh.

### 5.3 The scoring worker is broken — new transactions are never scored

Every newly-submitted transaction returns **202 PENDING** and stays that way. The worker fails to
build its model input and dead-letters after four attempts:

```
ERROR app.ml.inprocess  model_input_translation_failed
  ValidationError: 4 validation errors for TransactionInput
    transaction_id  Field required
    sender_id       Field required
    receiver_id     Field required
    timestamp       Field required
ERROR __main__       worker_dead_lettered  attempt: 4
```

`app/ml/inprocess.py::_to_model_input` is not populating those four fields.

**This is a backend defect and it blocks the demo**: a submitted transaction never gets a score and
therefore never raises an alert, so "submit → watch an alert appear" cannot work against this
build. The console handles it correctly — the 202 path shows *"Scoring in progress…"* with the
specified 1/2/4/8 s backoff and a retry after ~60 s, exactly the graceful-degradation story the
brief wants — but the score never arrives.

The seeded alerts exist because the seeder wrote them directly with a stub scorer, not through this
path. **Until this is fixed, run the submission demo with `VITE_USE_MSW=true`,** where the fixture
backend scores synchronously and raises the alert.

### 5.4 The seed contains no `team-beta` alerts

All 14 seeded alerts are on `team-alpha`. Step 5 of the demo script — "log in as supervisor,
`team-beta` alerts are now visible" — has nothing to show. The console correctly displays **All
teams** for a supervisor and would list `team-beta` rows if any existed.

The MSW fixtures put roughly a third of their 48 alerts on `team-beta`, so the cross-team story is
demonstrable offline.

### 5.5 Smaller notes

- `GET /v1/fraud-alerts/{id}` returns `amount` and `currency` as **`null`**, though the list
  endpoint populates them. The detail page reads the figures from the linked transaction instead.
- `AlertDetailOut.explanation` is typed `array<object>` with `additionalProperties: true`, not as
  `ReasonOut`. Entries that do not parse as `{feature, contribution}` are dropped rather than
  failing the whole page.
- `TransactionOut` includes a `scoring_status` field the brief does not mention.
- Problem responses carry extra members beyond RFC 9457 (`request_id`, `required_scopes`,
  `allowed_transitions`). These are preserved in `Problem.extras` and surfaced in the toast.

---

## 6. Backend gaps designed around

From §9 of the brief, all confirmed:

1. **No list-transactions endpoint.** Only `GET /v1/transactions/{id}`. The Transactions screen is a
   submission screen plus a session-local list of what this browser submitted, held in memory and
   cleared on reload. It is labelled as such. No `GET /v1/transactions` is fabricated.
2. **Admin cannot read alerts.** ADMIN holds `users:manage` and nothing else. The alert nav item is
   **absent** for an admin, not disabled with a tooltip.
3. **Team filtering is implicit** — derived from the token, with no `team` query parameter. The
   header shows the caller's team so the scoping is visible (see §5.1 for how it is obtained).
4. **404 masks cross-team access.** An alert on another team returns 404, not 403. The detail page
   says *"not found, or outside your team"* and never *"you don't have permission"*, which would
   leak the case's existence.
5. **Logout kills all refresh families.** After logout the whole query cache is cleared with
   `queryClient.clear()`, not just the token.

A global transactions list would need a new backend endpoint.

---

## 7. Visual theme

The theme is derived from **<https://civitasai.net>**, verified against the live stylesheet rather
than approximated. The custom-property names in `src/styles/theme.css` are the site's own names.

| Token | Value | Role |
|---|---|---|
| `--ink` | `#101418` | primary text |
| `--ink-2` | `#3A444B` | secondary text |
| `--ink-3` | `#69747B` | muted text, labels |
| `--paper` | `#E3E6E0` | page background — warm grey, not white |
| `--surface` | `#F3F5F1` | cards, panels |
| `--rule` | `#C4CABE` | borders |
| `--rule-soft` | `#D5DACE` | table row separators |
| `--ultra` | `#22318E` | the only blue |
| `--ultra-lift` | `#2E42BC` | hover state |
| `--carmine` | `#9E2438` | danger, high/critical, confirmed fraud |
| `--amber` | `#B0740F` | warning, medium, escalated |
| `--sage` | `#4C6E5C` | positive, low, resolved |
| `--display` | Archivo | headings, figures, nav |
| `--body` | Newsreader | body copy, notes |
| `--mono` | IBM Plex Mono | labels, chips, buttons, IDs, timestamps, amounts |
| `--maxw` | `1280px` | content width |
| `--pad` | `clamp(20px, 5vw, 72px)` | horizontal padding |

Four tokens were added beyond the brief's table, taken from the same stylesheet. The site uses
inverted near-black bands as a device (`background: var(--ink)` appears six times in its CSS), and
the console uses the same for the machine-integration banners:

| Token | Value | Role |
|---|---|---|
| `--ink-line` | `#2A3238` | hairline borders inside dark bands |
| `--on-ink` | `#F3F5F1` | text on a dark band |
| `--on-ink-2` | `#8C979E` | muted text on a dark band |
| `--on-carmine` | `#F6F2F2` | text on a filled critical chip |

### Rules the theme enforces

- **`border-radius: 0` everywhere.** The site's entire stylesheet contains one radius — `50%`, for
  circular graph nodes. Tailwind's radius scale is *overridden*, not extended, so `rounded-lg` is a
  build error rather than a silent off-brand corner.
- **No `box-shadow`.** The shadow scale is overridden to `none`. Depth comes from 1px `--rule`
  borders and the `--surface`/`--paper` contrast.
- **Mono uppercase wide-tracked labels** on column headers, chips, buttons, eyebrows, UUIDs,
  timestamps and amounts. This is the site's signature element.
- **Numbered sections** (`01 VERDICT`, `02 WHY`, `03 CASE TRAIL`), mirroring the site's `01`–`07`.
- **Numbers right-aligned with `tabular-nums`** so digits line up down a column.
- **No dark mode.** The site is light-only; a dark console would break the family resemblance.

Verified in the browser by computed style, not by eye: body background is `rgb(227, 230, 224)`
(`#E3E6E0`, not white); the three fonts resolve to Archivo / Newsreader / IBM Plex Mono; and a sweep
of every element in the DOM found **zero** non-zero border-radii and **zero** box-shadows.

---

## 8. Layout

```
src/
  api/          client.ts (fetch wrapper, refresh mutex, bearer override)
                endpoints/  auth, alerts, transactions, users
                schemas/    zod — one per resource
  auth/         tokenStore (human, in memory), machineTokenStore (ingest, separate),
                AuthProvider, RequireScope
  features/
    auth/       LoginPage
    alerts/     queue, filters, row, detail, timeline, dial, SHAP chart, state machine
    transactions/ form, account fields, samples, payload builder, score poller,
                  result card, ingest session
    users/      admin list, create form, password meter
    simulator/  env-gated machine harness
  components/   primitives, chips, toasts, error boundary, app shell, status dot
  lib/          iban.ts (mod-97), money.ts (string decimals), problem.ts, format.ts, risk.ts
  styles/       theme.css (tokens), fonts.ts (self-hosted)
  mocks/        MSW handlers + fixtures
tests/          refresh mutex, state machine, problem parsing, iban/money/risk
```

### Money never becomes a number

Amounts arrive as strings, stay strings through form state, and are formatted only for display.
`formatAmount` groups digits by walking them backwards rather than with the usual
`/\B(?=(\d{3})+(?!\d))/g` — that pattern is superlinear on long digit runs and
`eslint-plugin-security` flags it. A test asserts `9007199254740993.01` survives formatting intact,
which it would not if the value passed through IEEE-754.

### IBANs are checked locally

`lib/iban.ts` implements the ISO 13616 mod-97 checksum so a typo is caught on blur instead of after
a round-trip in front of an audience. The mod-97 is computed digit by digit — an IBAN is far too
long for `Number`. Every IBAN in the demo samples passes the checksum.

---

## 9. Verified against the live backend

Walked through the running stack, not assumed:

| Step | Result |
|---|---|
| Login as analyst, routed by scope | Queue loads, 14 alerts, scoped to `team-alpha` |
| Header shows team and role | `TEAM TEAM-ALPHA` / `ANALYST`, derived as in §5.1 |
| Nav driven by scope | Analyst sees Alerts + Transactions; admin sees Users only |
| Open a HIGH case | Dial 76.1% HIGH, model + version, SHAP bars, case trail |
| `OPEN → IN_REVIEW` with a note | 200; trail gains the entry immediately with actor and time |
| Scope gate | `CONFIRMED FRAUD — not permitted` / *"Closing requires a supervisor."* |
| Supervisor login | `ALL TEAMS` tag, cross-team copy, `SUPERVISOR` role |
| Ingest session | `ingest-loader` token issued, `transactions:write`, 15 min |
| Submit structuring sample | **202 PENDING**, poller backs off — see §5.3 |
| Submit again, same key | **200** with `Idempotent-Replay: true`, same transaction, no duplicate |
| Admin login | Routed to `/users`; **alert nav absent**; 4 accounts listed |
| Create user on `team-gamma` | 201, list grows to 5 |
| Page refresh | Logs out — in-memory token working as designed |
| Third-party requests | None. Fonts served from `node_modules` |
| Console | No app-level errors |

Verified separately in offline mode, where the data supports them:

| Step | Result |
|---|---|
| Keyset pagination | `?limit=25` → 25 rows, **Load more** → 48, **zero duplicate ids**; footer flips *More pages available* → *End of queue*. The second request carries `&cursor=…`, so page 1..n is never refetched |
| Cross-team masking | team-beta analyst opening a team-alpha alert URL gets *"Not found, or outside your team."* — no permission wording, no leak |
| Own-team scoping | That same analyst's queue lists `team-beta` rows only |
| Simulator (`VITE_ENABLE_SIMULATOR=true`) | `ml-service` token issued with `scores:write, transactions:read`; **Push score** returns 201 and raises a case; the push button is disabled until a token exists |
| Submission → alert | 201, 98.0% CRITICAL, linked case with an **Open case** link |

**On console 404s:** the browser prints a network-level error line for any 404 *response*, which is
not the same as an application error. Two legitimate 404s occur by design — the cross-team probe
above, and the score poller, which 404s until a score exists (§3.4 of the brief). Both are handled
in the UI. Measured directly: **zero `console.error` calls from application code**, no uncaught
exceptions, no unhandled rejections.

Not verifiable against this build: an alert appearing from a submitted transaction (§5.3), and
cross-team alert rows (§5.4). Both work under `VITE_USE_MSW=true`.

`npm run lint` — clean, zero warnings, audit gate passed. `npm run typecheck` — clean.
`npm run test` — **92 passing** across nine files: refresh mutex, alert state machine, problem+json
parsing, IBAN/money/risk, route-target injection, MSW fixture contract, security invariants, and the feedback/metrics
contract.

---

## 10. Not built

- **Playwright end-to-end tests.** The brief marks these "if time allows". The demo path was
  verified manually against the live backend instead, step by step, as recorded in §9.
- **List virtualisation.** Specified only above ~200 rows; the live seed returns 14 and the
  fixtures 48. `useInfiniteQuery` and memoised rows are in place, so adding it later is contained
  to `AlertQueuePage`.

---

## 11. Dashboards and the feedback loop — blocked on backend work

Both features in §15 and §16 of the brief are **built and working**, but neither can run against the
live backend yet. Verified against the running container:

| What | Endpoint | Live result |
|---|---|---|
| Transaction list (fraud + non-fraud) | `GET /v1/transactions` | **405** — only POST is routed |
| Dashboard aggregates | `GET /v1/metrics/overview` | **404** |
| Analyst feedback | `PATCH /v1/fraud-alerts/{id}` with `feedback` | **422** `extra_forbidden` |
| Retraining export | `GET /v1/feedback/export` | **404** |

`BACKEND-REQUIREMENTS.md` is the implementation spec for all four, written against the same
contracts the frontend already validates with Zod. Shipping them requires no UI change.

**Until then, demo with `VITE_USE_MSW=true`** — the mock backend implements all of it.

### What §15.1 forbids, and what was done instead

The brief is explicit: do not fake the dashboard with client-side aggregation over a page of alerts,
and do not invent endpoint names. Both rules are respected.

- The aggregate is computed in `src/mocks/metrics.ts`, which is the **mock backend** — the stand-in
  for the SQL the real endpoint will run. The dashboard makes one request and renders whatever comes
  back, so swapping in the real endpoint changes nothing in the UI.
- The endpoint names and payload shapes are exactly those in §15.2. Nothing was invented.
- When `/v1/metrics/overview` is absent, the dashboard renders an explicit **"this backend does not
  expose /v1/metrics/overview yet"** panel and leaves those figures blank. It does not substitute
  numbers derived in the browser.

The fixtures were extended with **2,400 clean transactions** so the alert rate is realistic. A
dashboard fed only by the 48 alerted fixtures would report a 100% alert rate — precisely the
distortion §15 exists to prevent. A test asserts the computed alert rate stays below 20% and above
zero.

### Recall is deliberately absent

`/v1/metrics/overview` never returns recall and the UI never derives it. Recall needs false
negatives — fraud the system did not flag — which by definition were never recorded. Reporting a
figure we cannot measure would be dishonest to a government buyer.

Precision is computed from closed cases only and ships with its caveat string, which the UI renders
**verbatim** rather than paraphrasing. A test asserts the payload contains no `recall` key anywhere,
and `precision` is `null` — not `0.0` — when nothing has been closed, because a zero there reads as
"the model is never right" rather than "we have no data yet".

### Verified in offline mode

| Step | Result |
|---|---|
| Analyst lands on `/dashboard` | Four work tiles, each labelled with its window |
| Transaction flow | 1,195 transactions, 32 flagged (2.68%), 5 confirmed fraud — last 7 days |
| Risk distribution | LOW 98.3%, MEDIUM 0.9%, HIGH 0.8%, threshold marked at 0.70 |
| Supervisor sections | All seven panels, gated on `alerts:read:all`, same route |
| Precision | 50% with the caveat verbatim, plus the line explaining why recall is absent |
| Threshold explorer | 0.50 → 4 raised / 2 confirmed / 2 FP / 3 missed; 0.70 (live) → 1 / 1 / 0 / 4; 0.90 → 0 raised / 5 missed. Labelled *what-if on historical closed cases* |
| Feedback block | Appears only on a terminal status; three SHAP drivers offered **unchecked** |
| `model_agreed` chip | Live and derived — FRAUD → "model agreed", INCONCLUSIVE → "not comparable" |
| Export | One JSONL line with `model_probability: 0.973` and `model_version` **copied at write time** |

The whole dashboard renders from **two requests** (`/v1/metrics/overview` + one page of alerts), as
§15.5 requires.

### Bundle impact

Adding both features moved the initial bundle by **0.06 KB** (96.12 → 96.18 KB gzipped). Recharts
stays behind `React.lazy` in the chart components, so the flow chart is fetched only when the
dashboard renders it and the SHAP chart only when a case is opened.

---

## 12. Dark mode

**§14.1 of the brief says not to build this.** It was added on request, so this section records
what was done and what it cost.

**The default is unchanged.** No `data-theme` attribute means light, exactly as specified — the
demo looks the same unless someone opts in. The header toggle offers three states:

| State | Behaviour |
|---|---|
| **Light** | Forces the brief's palette, even on a dark OS |
| **Dark** | Forces dark, even on a light OS |
| **Auto** | Follows `prefers-color-scheme` live, including mid-session changes |

### The dark palette is not invented

civitasai.net has no dark *mode*, but it does use inverted near-black bands, and the colours inside
them are exactly what a dark theme needs. Taken from its stylesheet:

| Token | Value | Role on the site |
|---|---|---|
| `--paper` | `#101418` | its dark-band background |
| `--rule` | `#2A3238` | hairline inside a band |
| `--ink` | `#F3F5F1` | primary text on dark |
| `--ink-2` | `#A9B3B9` | secondary on dark |
| `--ink-3` | `#8C979E` | muted on dark |
| `--ultra` | `#8FA0F0` | the blue it uses on dark |

Four values are **derived**, because the site has no on-dark equivalent: the panel surface
(`#171D22`), and on-dark `--carmine` / `--amber` / `--sage`. `#9E2438` and `#B0740F` are unreadable
on near-black, so they are lightened while keeping hue.

Three tokens were added so surfaces that are inverted *on purpose* survive the flip. The
machine-integration banners used `bg-ink`; in dark mode `--ink` becomes light, so they would have
inverted into glaring white strips. They now use `--band` / `--on-band`, and the modal scrim uses
`--overlay` rather than `bg-ink/50`.

### Contrast

Measured on the live DOM, not by eye — every text node on the dashboard and the alert detail page,
against its effective background:

| Mode | Failures |
|---|---|
| Dark | **0** of 294 elements |
| Light | 10 elements, all `--ink-3` |

The dark palette is **more** accessible than the light one. Against the panel surface the worst dark
pairing is 5.70:1 and most are AAA; in light, `--amber` manages only 3.58:1.

**A pre-existing light-mode issue, not introduced here:** `--ink-3` (`#69747B`) on `--paper` is
3.80:1 and on `--surface` is 4.37:1, against the 4.5:1 AA requirement for 11px text. Those are the
brief's own tokens on the brief's own backgrounds, used for muted mono labels. It was left alone
because §14 says to use the extracted palette literally and changing it weakens the brand match —
but for a government buyer it is worth a decision. Darkening `--ink-3` to about `#5F6A71` clears AA
and is near-indistinguishable; that is a one-line change if wanted.

### A real bug this surfaced

Switching to light left elements painting the **dark** palette — `--ultra` resolved to `#22318E` on
both `:root` and the element while the element still painted `#8FA0F0` seconds later. Chromium does
not reliably re-resolve a `var()` behind a property that has a `transition`.

Fixed by suppressing every transition for the duration of the swap (`html.theme-switching`), removed
two frames later. It also stops the console cross-fading between palettes, which looked cheap.
`tests/theme.test.ts` pins the guard.

### Tests

`tests/theme.test.ts` (7) covers the failure modes specific to theming: every light colour token has
a dark counterpart, the explicit-dark and system-dark blocks define **identical** token sets (drift
means the OS-dark user and the toggle-dark user see different pages), the system block is guarded so
an explicit light choice wins, `color-scheme` is declared in both, the transition guard exists, and
**no `border-radius` other than `0`/`50%` appears** — dark mode is not an excuse to soften the design
language. Mutation-tested: removing one token from the dark block fails two tests.

### One security note

This adds the **only** web-storage use in the codebase — the theme preference in `localStorage`.
The blanket ESLint ban stays; `src/styles/theme.ts` carries a narrow, commented
`eslint-disable-next-line`. The value is a three-value enum validated against an allow-list on read,
so a tampered value can do nothing worse than fall back to "auto".

`tests/security-invariants.test.ts` now asserts that **exactly one** file touches storage, that it
writes a single key (`civitas.theme`), that its code mentions nothing token-shaped, and that the
read path validates. Tokens remain in memory only.

### Cost

Initial JS 96.18 → **96.77 KB** gzipped (+0.59 KB). CSS 5.37 → **5.78 KB** (+0.41 KB).
