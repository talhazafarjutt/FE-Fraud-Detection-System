# Backend work this console needs

Verified against the deployed API on **2026-09-10** by reading its OpenAPI schema and calling every
route with a real supervisor token. Nothing here is taken from a spec.

**Base URL:** `https://fraud-detection-system-fmh3.onrender.com`

---

## In ten seconds

| | |
|---|---|
| **Available and wired up** | 17 routes |
| **Missing — blocks a screen** | 6 routes, 4 capabilities |
| **Biggest gap** | The whole `/v1/cases` layer. No investigations, no verdict, no feedback export. |

---

## 1. Available — 17 routes, all in use

These are implemented and the console calls them today.

| Route | Used by |
|---|---|
| `POST /v1/auth/token` | Sign-in |
| `POST /v1/auth/client-token` | Ingest session on the submit screen |
| `POST /v1/auth/refresh` | Token refresh (single-flight) |
| `POST /v1/auth/logout` | Sign-out |
| `GET /v1/transactions` | The ledger — fraud and non-fraud together |
| `GET /v1/transactions/{id}` | Linked transaction on an alert |
| `GET /v1/transactions/{id}/score` | Score polling after a 202 |
| `POST /v1/transactions` | Submitting a transaction |
| `GET /v1/fraud-alerts` | Alert queue |
| `GET /v1/fraud-alerts/{id}` | Alert detail and the whole evidence surface |
| `PATCH /v1/fraud-alerts/{id}` | Triage, assign — **not** the verdict, see §2.1 |
| `GET /v1/metrics/overview` | Dashboard |
| `POST /v1/users` · `GET /v1/users` · `POST /v1/users/{id}/deactivate` | User admin |
| `GET /healthz` · `GET /readyz` | Header status |

---

## 2. Missing — what the backend still owes

Each blocks a named screen. The console shows a panel naming the endpoint rather than rendering
anything invented. The registry is `src/api/unavailable.ts`; delete an entry when it ships and the
compiler points at every screen to wire up.

### 2.1 The case layer — **highest priority**

```
GET    /v1/cases                        -> 404
GET    /v1/cases/{id}                   -> 404
PATCH  /v1/cases/{id}                   -> 404
POST   /v1/cases/{id}/alerts            -> 404
DELETE /v1/cases/{id}/alerts/{alert_id} -> 404
```

**Blocks:** the Investigations and Cases sections entirely, and the verdict on every alert.

A case groups the alerts of one scheme so a nine-alert ring is investigated once and judged once.
Without it, each alert is worked alone and there is nowhere to record an outcome.

**This is currently a broken flow, not just a missing one.** The verdict has already been moved off
the alert: `PATCH /v1/fraud-alerts/{id}` now rejects a `feedback` block with **422**, verified
against production. Its replacement does not exist. So the console can move an alert through
triage, but a supervisor cannot conclude anything anywhere. The close control is disabled and
labelled rather than allowed to fire a request that cannot succeed.

Alert rows also do not yet carry `case_id`, `score_id` or `provenance` — so even once the routes
land, an alert cannot be linked back to its case without those.

### 2.2 Feedback export

```
GET /v1/feedback/export -> 404
```

**Blocks:** pulling recorded verdicts as training data.

No `feedback:export` scope is granted on any seeded account either, so both the route and the scope
are outstanding. Moot until §2.1 exists — there are no verdicts to export.

### 2.3 Entities

```
GET /v1/entities, /v1/entities/{id}, /v1/entities/{id}/transactions -> no route
```

**Blocks:** the Entities section, and every entity link elsewhere.

The database holds parties, persons, companies, accounts and holder relationships. Nothing exposes
them.

### 2.4 Network explorer

```
GET /v1/network/{entity_id}, /v1/network/expand -> no route
```

**Blocks:** the Network section.

A global explorer needs an endpoint returning the next hop; without one a clickable node is a dead
end. The per-alert `network.neighborhood` is enough for a local snapshot and is rendered on the
alert itself — but that field is null on every alert today (§3).

### 2.5 Audit log

```
GET /v1/audit -> no route
```

**Blocks:** the Audit section.

Audit records are written server-side but cannot be read back. The per-alert `events[]` trail is
real and complete, and is shown on each alert; what is missing is the view across all of them.

---

## 3. Deployed but not producing — the risk engine

These keys are present on `GET /v1/fraud-alerts/{id}` but **null or empty on all 15 alerts
sampled**. Every alert still comes from `stub-rules`.

| Field | Observed |
|---|---|
| `risk_score` | `null` on every alert and every transaction row (100/100 scanned) |
| `signals` | `null` |
| `triggered_rules` | `[]` |
| `network` | `null` |
| `anomaly` | `null` |
| `decision_reasons` | `[]` |
| `risk_engine_version` | `null` |

**Consequences the console handles rather than hides:**

- **`fraud_probability` is not gone** and is currently the only populated score. The UI prefers
  `risk_score` when present and falls back to the probability, labelling that value **derived** so
  nobody reads a legacy probability as the new score.
- The four-signal breakdown, rules, reasons and network panels each render an explicit empty state
  naming what was not recorded.

Once the engine starts producing, these panels fill in with no frontend change.

Also null on `GET /v1/metrics/overview`: `alert_rate` and `flagged_amount`.

---

## 4. Frontend defects this audit found — all fixed

Recorded because each was silent: nothing threw, the UI simply showed less than it should have.

1. **`risk_score` and `alert_severity` were stripped by the response schema.** Zod drops unknown
   keys by default and the schema never listed them, so both columns rendered blank with a 200 in
   the network panel and nothing in the console. Both are now declared, and list schemas use
   `.passthrough()` so a newly added backend field survives instead of vanishing the same way.

2. **Date filters were being ignored.** The console sent `from`/`to`; the API filters on
   `booked_from`/`booked_to` and ignores unknown query params without erroring — so the filter
   looked functional but never changed the result set. Verified fixed: a future `booked_from` now
   takes the table from 50 rows to 0.

3. **The transaction list schema was based on the detail schema**, which requires `mcc` and the two
   balance fields that list rows do not return. Every response failed to parse and the table sat on
   "Loading" indefinitely. The list row is now declared standalone.

`tests/v1-contract.test.ts` pins all three.
