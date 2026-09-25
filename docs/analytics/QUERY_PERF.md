# Analytics query performance (P11, D7)

Measurements for `GET /api/analytics/query/` and `GET /api/analytics/drilldown/`. The rule from D7 is to measure first, fix the query shape before adding an index, and fix both before considering a cache (CLAUDE.md: "Query optimization … before any Redis caching").

## How to reproduce

Never against a school's data (D20). Both commands refuse or stay read-only accordingly:

```bash
# a scratch database whose name contains "bench"
DB_NAME=shule_bench2 python manage.py migrate
DB_NAME=shule_bench2 python manage.py seed_analytics_bench            # --pupils 2400 for the 2x set
DB_NAME=shule_bench2 python manage.py shell -c "from django.db import connection; connection.cursor().execute('ANALYZE')"
DB_NAME=shule_bench2 python manage.py bench_analytics                 # --explain L  prints a plan
```

`seed_analytics_bench` bulk-inserts a history shaped like a real school. It refuses a database whose name lacks `bench`, and one that already has pupils. `bench_analytics` runs every shape through the real code path (`run_query` / `run_drilldown`, so validation, masking and class-teacher scope included), once to warm up and then 5 times, and prints the table below.

## Datasets (2026-09-25)

| | 1x (`shule_bench2`) | 2x (`shule_bench3`) |
|---|---|---|
| Pupils | 1,200 | 2,400 |
| Enrolments (3 years, 2024–2026) | 3,040 | 6,085 |
| Exams / subjects | 198 / 28 (14 per level group) | same |
| **Marks** | **255,360** | **511,140** |
| Invoices / lines | 16,098 / 20,942 | 32,319 / 41,971 |
| Payments (= allocations) / adjustments | 23,800 / 980 | 47,776 / 1,975 |
| **SMS messages** (58 batches) | **58,758** | **117,608** |

The earlier run (2026-09-24, `shule_bench`, marks only) is superseded by these numbers.

Local PostgreSQL on Windows, default `work_mem` (4 MB), timings are the median of 5 warm runs, wall time including Python. The 1x column was measured on an idle machine. The 2x column was measured while a Django test suite was running against the same Postgres server, so it overstates somewhat; treat it as an upper bound.

† C and L were re-timed at 1x and 2x back to back under the same load: 1,420 → 2,508 ms (C) and 1,106 → 1,947 ms (L), a factor of about 1.77 for twice the data. So cost grows roughly linearly with school size, and the 2x values shown are the idle 1x times scaled by that factor.

## Results

| Shape | Query | SQL stmts | 1x | 2x |
|---|---|---|---|---|
| A | marks: mean, count, candidates × 2 terms × 2 classes | 3 | 50 ms | 117 ms |
| B | A + subject and gender filters | 4 | 24 ms | 43 ms |
| **C** | **marks: mean + median × 3 years × every class, masked (academic teacher)** | 3 | **1,056 ms** | **~1.9 s** † |
| D | marks: mean × 3 streams (stream fallback subquery) | 3 | 83 ms | 186 ms |
| E | marks: mean × every subject, one term, O-level | 4 | 37 ms | 82 ms |
| F | enrolment × class × gender | 3 | 11 ms | 13 ms |
| G | fees: billed, required, outstanding, collected × 3 years × every class | 5 | 268 ms | 633 ms |
| H | fees: collection rate × 4 quarters × every class | 3 | 99 ms | 211 ms |
| I | fees: students with arrears × every class | 3 | 55 ms | 127 ms |
| J | fees: cash received × last 12 months × payment method | 2 | 40 ms | 75 ms |
| K | fees: collected × streams of two classes | 3 | 38 ms | 90 ms |
| **L** | **SMS: messages, delivery rate, cost × 3 years × every class** | 4 | **885 ms** | **~1.6 s** † |
| M | class teacher: mean × subject, own class, whole year | 3 | 55 ms | 109 ms |
| N | drill-down: mean score, whole school, one year (every pupil) | 2 | 101 ms | 270 ms |
| O | drill-down: outstanding fees, FORM1, one year | 4 | 26 ms | 49 ms |
| P | drill-down: class teacher, marks count, own class | 3 | 41 ms | 105 ms |

"SQL stmts" counts every statement, including the registry and permission lookups. Each (metric source × period type × org-unit level) is still **one** aggregated query.

The heaviest realistic queries are **C** (a whole-history, whole-school score table with a median, as a masked role) and **L** (SMS by class over three years). Everything else stays under 300 ms at 1x and under 650 ms at 2x.

## What was changed

### L: the SMS class lookup ran twice per message (1,708 → 885 ms at 1x)

Until messages carry a class snapshot, an SMS's class comes from a correlated subquery (the pupil's `Enrolment` for the year the message was sent). The plan showed that subquery running **twice per message**, once in `WHERE ou IN (…)` and once in `GROUP BY`: Postgres does not share an expression between the two.

`OrgUnitAxis._group_condition` now filters a *grouped* org-unit variant in SQL on plain columns only. When the org unit is an expression, the query groups on it without filtering, and `AnalyticsQuery.run` drops the groups nobody asked for. That is exact, because each group is aggregated on its own; `tests_query` covers it for streams and for SMS classes. The same change helps every expression-based org unit:

| Shape | Before | After |
|---|---|---|
| L (SMS by class) | 1,708 ms | 885 ms |
| D (marks by stream, pre-P1 fallback) | 119 ms | 83 ms |
| K (fees by stream) | 54 ms | 38 ms |

The remaining cost of L is one lookup per message (58k index probes). The durable fix is a class snapshot on `SmsMessage`, like P1's on marks; that is a schema change and is left for after Phase 1.

### Tried and not adopted

- **`work_mem`.** The 2026-09-24 note suggested raising it for C, whose sort spills to disk. Measured with `SET LOCAL work_mem` at 4, 16, 32 and 64 MB, C, G and L did not change at 1x (C: 1,073 / 1,125 / 1,218 / 1,017 ms), nor at 2x (C: 2,478 / 3,280 / 2,298 ms at 4 / 32 / 128 MB). The spill is real but it is not where the time goes, so the earlier `ALTER ROLE … SET work_mem` suggestion is withdrawn.
- **`COLLATE "C"` on the group keys**, to make the sort compare bytes instead of locale strings: identical results, only 2–10% faster. Not worth the extra expression.

## Why C costs what it costs

C reads every mark (a sequential scan is the right plan) and needs **sorted** input twice over: `percentile_cont` (the median) is an ordered-set aggregate, and masking adds `COUNT(DISTINCT student)`. Neither can use a hash aggregate, so Postgres sorts all the marks by (period, class). Measured at 1x:

| Same 3 years × every class | Time |
|---|---|
| mean only, head teacher (hash aggregate) | 193 ms |
| mean only, academic teacher (masked: adds the distinct pupil count) | 852 ms |
| median only, head teacher | 729 ms |
| mean + median, academic teacher (C) | 1,131 ms |

No index helps a query that reads the whole table. Options, in order, if C-sized queries turn out to be common in the logs:

1. Leave it. It is a rare query (every class, every year, with a median), it still answers in about a second at 1x, and anything over `ANALYTICS_SLOW_QUERY_MS` is logged at WARNING, so its real frequency will show up.
2. Count masked pupils in a separate hashed query (`values(keys…, student).distinct()`, counted per cell in Python). That would take "mean, masked" from 852 ms to roughly the unmasked 193 ms plus the pupil pass, but not help the median.
3. Only then consider caching.

## Indexes

Still **no new index is needed**. Every period- or class-restricted marks query reaches its rows through the `exam_id` FK index. The heaviest fee plan (G, three years × every class) sequentially scans `fees_invoiceline` and `fees_invoice`, which is right for a query covering every year (about 6 ms for 21k lines), and reaches adjustments and allocations per line through their FK indexes; the 161 ms statement spends its time in those per-line lookups and the aggregate, not the scans. SMS queries go through `batch_id` and the per-student `Enrolment` index. The §6.1 fee candidates (`fees_invoiceline.category`, `fees_invoice (academic_year_id, kind, term, quarter)`) would not change any plan measured here, so they are dropped.

## To do

- Re-measure after P1, which moves the marks' org unit onto snapshot columns and removes shape D's subquery.
- Consider a class snapshot on `SmsMessage` if SMS-by-class queries (L) are used often.
- Queries log their time (`analytics.query`, INFO); anything over `ANALYTICS_SLOW_QUERY_MS` (default 1000 ms) is logged at WARNING. Use the logs to find which shapes a school actually runs before optimising further.
