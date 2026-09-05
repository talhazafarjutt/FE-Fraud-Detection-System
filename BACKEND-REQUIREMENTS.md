# Backend work this console needs

Three endpoints and one schema change. Everything else in the frontend runs against the backend as
it stands today.

Each item below was **verified against the running container**, not inferred from documentation.
The frontend is already written against these contracts and validates every response with Zod, so
shipping them requires no UI change — the panels stop showing their "not available" state and start
showing data.

Until they land, run the demo with `VITE_USE_MSW=true`. The mock backend in `src/mocks/` implements
all of this, so the dashboards and the feedback loop are fully demonstrable offline.

---

## 1. `GET /v1/transactions` — list and filter (§15.2)

**Today:** `405 Method Not Allowed`. Only `POST` is routed on this path.

```
curl -s -o /dev/null -w '%{http_code}\n' \
  "http://localhost:8000/v1/transactions?limit=5" -H "Authorization: Bearer $TOKEN"
# 405
```

**Why it is needed:** there is no other way to see non-fraud traffic. A dashboard built from alerts
alone shows the ~1% that got flagged and hides the 99% that did not, which makes the model look
busier and the queue bigger than reality.

Scope `transactions:read`. Row filter: the caller's team, unless they hold `alerts:read:all`.

| Param | Type | Notes |
|---|---|---|
| `risk_level` | `LOW\|MEDIUM\|HIGH` | from the latest `FRAUD_SCORE` |
| `min_probability` / `max_probability` | float 0–1 | |
| `transaction_type` | enum | |
| `scoring_status` | `COMPLETE\|PENDING\|FAILED` | |
| `has_alert` | bool | **the fraud / non-fraud switch** |
| `from` / `to` | ISO datetime | on `booked_at` |
| `min_amount` / `max_amount` | decimal string | |
| `q` | string | matches `external_ref` |
| `cursor`, `limit` | | same contract as alerts |

Returns `Page[TransactionListOut]` — the existing `TransactionOut` fields plus, flattened for the
table: `fraud_probability`, `risk_level`, `alert_id`, `alert_status`.

Sort `booked_at DESC, id DESC`; the cursor encodes that pair. Index accordingly.

---

## 2. `GET /v1/metrics/overview` — aggregates (§15.2)

**Today:** `404 Not Found`.

Scope `alerts:read`. Same team filter. Query: `from`, `to`, `bucket` (`hour|day`).

Response shape is in §15.2 of the brief and is mirrored exactly by
`src/api/schemas/metrics.ts` — that file is the executable spec, and
`tests/feedback.test.ts` asserts the mock implementation satisfies it.

Two rules for whoever implements this:

- **Compute it in SQL**, one query per block. Do not load rows into Python.
- **Never report recall.** It needs false negatives — fraud the system did not flag — and by
  definition those were never surfaced. Precision is computable from closed cases only, and it must
  ship with `precision_note` set to exactly:
  `"confirmed / (confirmed + false positives), closed cases only"`.
  The UI renders that string verbatim rather than paraphrasing it, and shows a line explaining why
  recall is absent. A test asserts the payload contains no `recall` key.

Return `precision: null` when nothing has been closed. A `0.0` there would read as "the model is
never right" rather than "we have no data yet".

---

## 3. Feedback on `PATCH /v1/fraud-alerts/{id}` (§16.3)

**Today:** `422`, because `AlertPatch` declares `extra="forbid"`.

```
curl -s -X PATCH ".../v1/fraud-alerts/$ID" -H "Authorization: Bearer $TOKEN" \
  -d '{"status":"IN_REVIEW","feedback":{...}}'
# {"errors":[{"field":"feedback","message":"Extra inputs are not permitted",
#             "type":"extra_forbidden"}]}
```

Required changes:

1. **`FeedbackIn`** — all fields bounded and enum-constrained:

   | Field | Type | Bound |
   |---|---|---|
   | `true_label` | `FRAUD\|LEGITIMATE\|INCONCLUSIVE` | `INCONCLUSIVE` is required — forcing a binary answer on an uncertain case poisons the dataset with confident wrong labels |
   | `confidence` | `HIGH\|MEDIUM\|LOW` | lets training weight hesitant labels |
   | `typology` | `STRUCTURING\|MULE_FAN_IN\|DORMANT_REACTIVATION\|ACCOUNT_TAKEOVER\|NIGHT_BURST\|LAYERING\|OTHER` | |
   | `decision_drivers` | string[] | ≤ 20 entries × 64 chars |
   | `model_agreed` | bool | derived client-side, stored as sent |
   | `missing_signals` | string[] | ≤ 10 entries × 64 chars |
   | `reviewed_at` | datetime | |
   | `time_to_decide_seconds` | int ≥ 0 | |

2. **Optional `feedback` on `AlertPatch`, rejected unless `status` is terminal**
   (`CONFIRMED_FRAUD` or `FALSE_POSITIVE`). The UI already refuses to send it otherwise, but the
   server is the authority.

3. **`CASE_FEEDBACK` table** — `alert_id`, `transaction_id`, `reviewer_id`, the fields above, plus
   `model_probability` and `model_version` **copied at write time**.

   Copy, do not join. When the model is retrained the score may be recomputed, and a training label
   must stay pinned to the score that produced it. The mock does this and a reviewer can see it in
   the exported line.

4. **`GET /v1/feedback/export?from=&to=&format=jsonl`** — scope `users:manage` or a new
   `feedback:export`. One JSON object per line: model input, model output, analyst label.

   That file is the retraining set, and it is what makes the loop real rather than a diagram.

A line produced by the mock implementation, for reference:

```json
{"true_label":"FRAUD","confidence":"HIGH","typology":"OTHER",
 "decision_drivers":["empty_receiver","velocity_24h"],
 "missing_signals":["receiver_account_age_days"],
 "model_agreed":true,"reviewed_at":"2026-09-05T11:49:45.400Z",
 "time_to_decide_seconds":33,"alert_id":"1daa9842-…","transaction_id":"1daa847b-…",
 "reviewer_id":"13c75218-…","model_probability":0.973,"model_version":"fixture-v1",
 "created_at":"2026-09-05T11:49:45.413Z"}
```

---

## 4. Unrelated defect that blocks the live demo

Not part of §15 or §16, but it stops demo step 7 working against the real backend.

**The scoring worker never scores anything.** Every submitted transaction returns `202 PENDING` and
stays there; the worker dead-letters after four attempts:

```
ERROR app.ml.inprocess  model_input_translation_failed
  ValidationError: 4 validation errors for TransactionInput
    transaction_id  Field required
    sender_id       Field required
    receiver_id     Field required
    timestamp       Field required
ERROR __main__       worker_dead_lettered  attempt: 4
```

`app/ml/inprocess.py::_to_model_input` is not populating those four fields — and they are exactly
the four the ML contract in §16.1 lists as required. Until this is fixed, a submitted transaction
never gets a score and therefore never raises an alert.

The seeded alerts exist because the seeder wrote them directly with a stub scorer, not through this
path.

## 5. Seed data gap

All 14 seeded alerts are on `team-alpha`, so demo step 5 — "log in as supervisor, `team-beta` alerts
are now visible" — has nothing to show. Seeding a handful of `team-beta` alerts would fix it. The
MSW fixtures already cover this for the offline demo.
