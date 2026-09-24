# Analytics query performance (P11, D7)

Measurements for `GET /api/analytics/query/` (`analytics/query.py`). The rule from D7 is to measure first and add an index only when it changes the plan.

## Dataset

This is a scratch database (`shule_bench`) seeded with the following, never production data (D20):

- 1,200 pupils across STD1–STD7 and FORM1–FORM4, in two streams.
- 3 academic years (2024–2026), 14 subjects, and 6 exams per level per year (198 exams).
- **302,400 `MarkEntry` rows** and 3,600 `Enrolment` rows.
- No fee or SMS data, so the fee and SMS shapes are **not measured yet**.

`ANALYZE` was run first. Each shape was measured with `EXPLAIN (ANALYZE, BUFFERS)` on the exact SQL the endpoint generated, on local PostgreSQL with default `work_mem` (4 MB).

## Results (2026-09-24)

| Shape | Query | Plan (final) | Execution time |
|---|---|---|---|
| A | `dx:exam.mean_score;exam.marks_count;exam.candidates` × `pe:2026T1;2026T2` × `ou:FORM1;FORM2` | Index scan on `exams_markentry_exam_id` (12 exams) | 52 ms |
| B | A plus `filter=subject:…&filter=gender:F` | same | 13 ms |
| C | mean + median × 3 years × 11 classes, masked (adds `COUNT(DISTINCT student)`) | Seq scan of all 302k marks, then a sort | 1.6 s |
| D | mean × `ou:FORM1/A;FORM1/B;FORM2/A` (stream) | Index scan on `exam_id`, with the stream fallback subquery on `enrolment_student_year_uniq` | 216 ms (was 971 ms) |
| E | mean × `subject` (no items), one term, `filter=ou:OLEVEL` | Index scan on `exam_id` | 43 ms |
| F | `enrol.enrolled` × class × gender | Bitmap scan on `enrolment_yr_lvl_strm_idx` | 1.5 ms |

Every shape ran as **one** aggregated SQL query.

## Findings

1. **No new index is needed.** Every query restricted by period or class reaches the marks through the existing `exam_id` FK index. The §6.1 candidate (`exams_exam (academic_year_id, term, quarter)`) is on a 198-row table, which is always scanned in well under a millisecond. So no migration was added, and `migrate --plan` reports `No planned migration operations.`
2. **Shape D was slow because of query shape, not a missing index.** Until P1 adds `stream_snapshot`, a mark's stream is found by a correlated subquery. Two changes cut the time from 971 ms to 216 ms:
   - The org unit is grouped on a single `level || '/' || stream` expression, filtered on the plain level column first. Before, a `CASE` branch per stream repeated the subquery six times per row.
   - `.order_by()` was added to that subquery. `Enrolment`'s `Meta.ordering` had added a sort to every lookup of a row that is unique per (student, year).

   P1's `stream_snapshot` column removes the subquery entirely.
3. **Shape C reads the whole table.** That is expected, and a sequential scan is the right plan for it. The cost is the sort, which spilled to disk (`external merge  Disk: 10072kB`). The sort feeds the ordered-set aggregates (median) and `COUNT(DISTINCT)`. No index helps here. If whole-history queries become common, raise `work_mem` for the app's database role (for example `ALTER ROLE … SET work_mem = '16MB'`) before considering caching.

## To do

- Seed fees and SMS histories and measure the `fee_lines`, `fee_allocations` and `sms` shapes. The §6.1 fee candidates (`fees_invoiceline.category`, `fees_invoice (academic_year_id, kind, term, quarter)`) are still undecided.
- Re-measure after P1, which moves the marks' org unit onto snapshot columns.
- Queries log their time (`analytics.query`, INFO). Anything over `ANALYTICS_SLOW_QUERY_MS` (default 1000 ms) is logged at WARNING, so production shapes can be found from the logs.
