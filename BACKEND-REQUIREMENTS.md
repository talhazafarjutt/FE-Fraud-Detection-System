# Backend status

Verified on **2026-09-19** by reading `/openapi.json` from the running backend and calling every
route with a real token for each of the four seeded accounts. Nothing below is taken from a brief.

Two surfaces answer today, and they are not the same:

| | What it is | Paths |
|---|---|---|
| **LOCAL** | The `v1` working tree, `make up`, `http://localhost:8000` | **26** |
| **Hosted** | `https://fraud-detection-system-fmh3.onrender.com` | **18** |

The gap is a **pending deploy, not missing work**. Same contract; only the base URL differs. The
console is built against LOCAL and gates nothing — it also survives the older hosted contract, for
the reason in §3.

---

## 1. Live on LOCAL — all 26 paths

### Auth · also on the hosted URL

| Route | Used by |
|---|---|
| `POST /v1/auth/token` | Sign-in. **JSON body**, `{username, password}` — form-encoded returns 422 |
| `POST /v1/auth/client-token` | Ingest / ML machine session |
| `POST /v1/auth/refresh` | Rotating; replaying an old token revokes the family |
| `POST /v1/auth/logout` | Sign-out |
| `GET /healthz` · `GET /readyz` | Header status. No `/v1` prefix |

### Transactions and alerts · also on the hosted URL

| Route | Used by |
|---|---|
| `GET /v1/transactions` | The ledger |
| `GET /v1/transactions/{id}` | Linked transaction |
| `GET /v1/transactions/{id}/score` | Score polling after a 202 |
| `POST /v1/transactions` | Submitting a transaction |
| `POST /v1/scores` | Machine score push (simulator) |
| `GET /v1/fraud-alerts` | Alert queue |
| `GET /v1/fraud-alerts/{id}` | Alert detail and evidence |
| `PATCH /v1/fraud-alerts/{id}` | Triage and assign — **not** the verdict |
| `GET /v1/metrics/overview` | Dashboard |
| `POST /v1/users` · `GET /v1/users` · `POST /v1/users/{id}/deactivate` | User admin |

### The investigation layer · LOCAL only, until the deploy lands

| Route | Used by |
|---|---|
| `GET /v1/cases` | Cases, Investigations |
| `GET /v1/cases/{case_id}` | Case detail, member alerts, verdict |
| `PATCH /v1/cases/{case_id}` | Triage, assignment and **the verdict** |
| `POST /v1/cases/{case_id}/alerts` | Attaching an alert the grouping missed |
| `DELETE /v1/cases/{case_id}/alerts/{alert_id}` | Detaching one judged unrelated |
| `GET /v1/entities` · `/{party_id}` · `/{party_id}/transactions` | Entities |
| `GET /v1/network/accounts/{account_id}` · `/v1/network/entities/{party_id}` | Network explorer |
| `GET /v1/audit-logs` | Audit log, and the per-case history timeline |
| `GET /v1/feedback/export` | Retraining pull |

---

## 2. Live on the hosted URL — 18 paths

Everything in the two "also on the hosted URL" tables above. The eight investigation paths 404
there. That is the entire difference.

---

## 3. Quirks the console handles

- **The hosted contract returns `risk_score: null`** and ranks on `fraud_probability` (0–1); LOCAL
  populates `risk_score` (0–100) and drops the probability. `normaliseRisk` in `src/api/compat.ts`
  converts in one place and labels the fallback **derived**, so a legacy probability is never read
  as the new score. A null score stays null — never zero, or an unscored row sorts as the safest
  thing in the list.
- **The list row is slimmer than the detail record** — no `mcc`, no balances. Basing the list
  schema on the detail schema made every ledger response fail to parse.
- **Unknown query params are ignored, not rejected.** A wrong filter name looks like a working
  filter that changes nothing. Date filters are `booked_from` / `booked_to`.
- **`/v1/metrics/overview` takes `from` / `to` / `bucket`** — not `days`, whatever a brief says.
  `alert_rate` and `flagged_amount` live under `totals`, not at the top level.
- `precision` is often `null` — correct, it needs concluded cases. Recall is never returned;
  `precision_note` explains why and is rendered verbatim.
- **404, not 403, for another team's record.** A missing thing and one you are not cleared to see
  are indistinguishable by design, so a detail 404 is worded as "it may belong to another team".
- **The hosted API sleeps when idle.** A cold first request takes 30–60s; the header shows
  *Waking up*, not *Unreachable*.

---

## 4. Scopes, as the server actually grants them

Verified by signing in as each account and reading the `scopes` array back.

| Account | Scopes | Sees |
|---|---|---|
| `analyst@example.com` | `alerts:read` `alerts:update` `entities:read` `transactions:read` | team-alpha |
| `other-analyst@example.com` | same | team-beta — **empty, and correct** |
| `supervisor@example.com` | the analyst set plus `alerts:read:all` `alerts:assign` `alerts:close` `audit:read` `feedback:export` | every team |
| `admin@example.com` | `audit:read` `users:manage` | users and the trail only — **no** alerts, cases or entities (403 on all three) |

Nav items, routes and the workflow view are all driven from this array, never from a role name.

---

## 5. Still outstanding on the backend

1. **Team-to-team handover.** An alert's `team` is fixed at ingest and there is no route to move
   it. This is the only genuinely absent capability left.

2. **No way for a client to learn its own team.** The access token carries no `team` claim
   (claims are `aud exp iat iss jti nbf scopes sub typ`), the login response does not return one,
   and there is no `/v1/users/me`. The console infers the team by observing the rows the server
   returns — which works for everyone except the user who most needs it: a team with no traffic
   returns no rows to infer from, so `other-analyst` cannot be told their own team's name while
   being shown why every list is empty. **A `team` claim on the token, or `/v1/users/me`, closes
   this.** Until then the empty states explain the filtering rule without naming the team.

3. **The refresh token is returned in the response body**, so a pure HttpOnly-cookie design is not
   available to the frontend alone. It is held in memory with the access token, and a page reload
   signs the user out. The production fix is a backend change: set it as
   `HttpOnly; Secure; SameSite=Strict` and stop returning it in the body.

---

## 6. Frontend defects this round found — all fixed

Recorded because every one was silent: nothing threw, the screen just showed less than it should.

1. **The ledger could not parse a single row.** The list schema extended the detail schema, which
   requires fields list rows omit. Every response failed and the table sat on "Loading" with a 200
   in the network panel.
2. **`risk_score` and `alert_severity` were stripped by the schema.** Zod drops unknown keys and
   neither was declared, so the columns rendered blank.
3. **Date filters were ignored** — the console sent `from`/`to` against an API that filters on
   `booked_from`/`booked_to` and ignores unknown params silently.
4. **One bad row killed the whole page.** Pages now parse row by row; a bad row is dropped, counted
   and reported, and dev logs the raw row.
5. **A failed chunk load looked like a crashed route** (`Failed to fetch dynamically imported
   module … AuditLogPage.tsx`). Content-hashed chunks change name on deploy, so a browser holding
   an old `index.html` asks for filenames the server no longer has. Routes now reload once, guarded
   so they cannot loop, and `tests/routes.test.ts` imports every route module so a dangling import
   fails the build instead of a screen.
6. **A healthy API reported as unreachable.** `fetch` rejects with no status for CORS, DNS, offline
   and a dead server alike, and all four were being shown as "down". Network failures are now their
   own state and print the base URL they tried.
7. **Post-login routing was duplicated** in the login page and the landing route, and the copies
   drifted. There is now one place that decides where a signed-in user goes.

`tests/v1-contract.test.ts`, `tests/compat.test.ts`, `tests/routes.test.ts` and
`tests/demo-mode.test.ts` pin all of these.

---

## 7. How the contract is kept honest

`src/api/schema.d.ts` is generated from the backend's own `/openapi.json` and committed. Every
request path is built by `route()`, whose first argument is `keyof paths` — so **a path that does
not exist on the backend does not typecheck**, which is precisely the failure mode that produced
the previous round of 404s.

```bash
npm run schema:gen
```

```bash
npm run schema:check
```

`schema:check` runs in CI. It compares the committed types against a live backend and fails on
drift; with no backend reachable it skips rather than failing for the wrong reason. **Read the diff
when it fires** — that diff is the contract change, and it is the only warning before a screen
breaks.
