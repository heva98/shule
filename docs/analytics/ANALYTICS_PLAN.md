# Analytics Module — Phase 0 Discovery

Status: discovery and decisions. No code has been written yet. The inventory was taken at commit `ef55589` and refreshed at `cf33a3c`, after `students.Enrolment` and the managed `students.Stream` list landed.

Target model: a DHIS2 Data Visualizer-style analysis of **data × period × org unit**, laid out as columns/rows/filters, gated by the `analytics` key in `ENABLED_MODULES` and limited to staff (`IsAnalyticsStaff`).

---

## 0. Decisions log (2026-09-24)

| # | Decision |
|---|---|
| D1 | **Attendance is out of scope** for analytics for now. Its inventory stays below for reference, and its metrics are deferred (§4.6). The class-at-the-time snapshot (D2) is still added to `AttendanceRecord`, so the data is ready when attendance comes back into scope. |
| D2 | **Marks and attendance record the pupil's class at the time.** Snapshot columns go on the fact rows, so a promotion never moves last year's numbers into the new class. See P1. |
| D3 | **A fee belongs to its billing period, and a payment to its payment period.** A Q1 fee paid in Q2 is still a Q1 fee (`fees.collected`, billing period). The cash arrived in Q2 (`fees.cash_in`, payment period). Both metrics exist. |
| D4 | Period types for Phase 1: `YEAR`, `TERM`, `QUARTER`, `MONTH` (date-grained facts only), plus the relative periods `THIS_YEAR`, `LAST_YEAR`, `THIS_QUARTER`, `LAST_4_QUARTERS`. One resolver maps each period to either (year, term, quarter) filters or a date range, depending on the fact. |
| D5 | The proposed metrics are accepted. Distribution statistics (median, min, max, standard deviation, percentiles) are added (§4.2). |
| D6 | **Mean score = Σ score / Σ marks at pupil × subject × exam grain**, which weights every mark equally. This is not the mean of per-student averages. It follows the CLAUDE.md rule. |
| D7 | Indexes: measure first with `EXPLAIN ANALYZE` on a realistic seeded dataset, and add only the indexes that change the plan (P11). |
| D8 | Fix the nullable/inconsistent fields: quarter dates (P2), `Invoice.term/quarter` (P3), `InvoiceLine.level_snapshot` (P4), `Payment.student` (P5), `Payment.invoice` (P6), and the duplicate `LevelGroup` (P7). |
| D9 | `MarkEntry.score` gets a DB `CheckConstraint` (P8). |
| D10 | **Grade scale, divisions/PSLE aggregates and pass mark become school-configurable.** Only OWNER, HEADTEACHER and ACADEMIC_TEACHER can edit them (P9). The score scale is fixed at 0–100 (D14). |
| D11 | Staff, leave and discipline analytics are out of scope for now. |
| D12 | Mark-entry completion: "expected" = all active subjects taught in that stream (P10; the data source is an open question). |
| D13 | Each metric group carries its own role list. `IsAnalyticsStaff` is the union of those lists. CLASS_TEACHER is scoped to their own class (§6.6). SYSTEM_ADMIN is included in every group. |
| D14 | **The maximum mark is 100 everywhere.** It is not configurable. Only the grades built on top of it are (P8, P9). |
| D15 | Annual charges stay in an **"Annual"** bucket by default, with an option to **spread them per quarter** (P3). |
| D16 | Editing a grading scale does **not** regrade existing marks. It applies to marks entered or edited afterwards (P9). |
| D17 | **Streams are configured per class, and subjects per stream**, as part of setting up the class streams. The timetable and mark-entry completion both use that configuration (P10). |
| D18 | **Small cells are masked:** score metrics show "<5" when a cell holds fewer than 5 pupils (§6.4). |
| D19 | Academic analytics requires **both** `exams` and `reports` to be enabled (§4.5). |
| D20 | The backfill and health commands are **not** run against production data by us. They ship with `--dry-run`, and the school's operator runs them (P12). |
| D21 | Live deployments: **production** and **Msewe** only (§6.5). |
| D22 | When backfilling marks with no `Enrolment` row, the stream falls back to the pupil's **current** stream (P1). |
| D23 | Class streams and their subjects are **set per academic year and copied forward** (P10). |

---

## 1. Inventory of analysable models

"Gate" is the `ENABLED_MODULES` key the existing views check. **Core** means the model is always on: `students` and `accounts` are not in `OPTIONAL_MODULES`.

### 1.1 Students and enrolment (core)

| App | Model | Key fields | FKs | Gate |
|---|---|---|---|---|
| students | `Student` | `gender` (M/F), `date_of_birth`, `level` (Level choices, indexed), `stream` (`StreamField`, uppercase, blank allowed), `status` (ACTIVE/TRANSFERRED/GRADUATED/SUSPENDED/EXPELLED, indexed), `admission_date`, `has_special_needs`, `public_id`, `student_id`, `created_at` | `user` → User (nullable) | core |
| students | `Enrolment` | One row per (student, academic year): `level`, `stream`, `status`, `enrolled_on`, `left_on`. Indexed on (`academic_year`, `level`, `stream`, `status`) | `student`, `academic_year` | core |
| students | `Stream` | `name` (unique, uppercase): the managed list of stream names | — | core |
| students | `Guardian` | `relationship`, `is_primary_contact`, `sms_opt_out`, `phone` | `student` → Student | core |
| accounts | `SchoolSettings` (singleton pk=1) | `school_type`, `active_levels` (JSON list of level groups), `region`, `district` | — | core |

How `Enrolment` behaves (`students/enrolment.py`):
- The current year's row mirrors every save of the student.
- `open_year` seeds a row for every ACTIVE/SUSPENDED student when a year becomes current.
- Once a year is no longer current, or its `q4_end` has passed, its rows are never modified again. They are the year-end record.
- History starts from migration `students.0008`. Earlier years have no rows.
- Promotions must be done *after* the new year is set current.

### 1.2 Academics (`exams`, `reports`)

| App | Model | Key fields | FKs | Gate |
|---|---|---|---|---|
| exams | `Subject` | `name`, `code`, `level_group`, `is_compulsory`, `is_active` | — | exams |
| exams | `Exam` | `name`, `term` (TERM1/2), `quarter` (Q1–Q4), `level`, `stream` (blank = whole level), `exam_type` (CA1/CA2/WEEKLY/MIDTERM/TERMINAL/MOCK), `start_date`, `end_date` | `academic_year`, `created_by` | exams |
| exams | `MarkEntry` | **fact grain.** `score` (Decimal, 0–100 checked in the serializer only), `grade` (A–F from the hard-coded `get_grade`), `remarks`. Unique on (`exam`, `student`, `subject`) | `exam`, `student`, `subject`, `entered_by` | exams (write) / reports (read) |
| exams | `StudentSkillAssessment` | `skill`, `marks` (nullable), `grade` | `exam`, `student`, `entered_by` | reports |
| exams | `ReportCardRemark` | free text and sign-off | `exam`, `student` | reports (not analysable) |

Today the grading rules are hard-coded in `exams/utils.py`:
- `get_grade`: A ≥75, B ≥60, C ≥45, D ≥30, otherwise F.
- `get_form4_division`: best 7 subjects by grade points → Division I–IV/0.
- `get_psle_aggregate`: best 5 subjects on a 1–10 scale.

The pass mark of 45 is hard-coded in `exams/views.py:754`. All of these move into configuration in P9.

### 1.3 Fees (`fees`)

| App | Model | Key fields | FKs | Gate |
|---|---|---|---|---|
| fees | `AcademicYear` | `year` (unique int), `is_current`, `q1_start`…`q4_end` (all nullable; see P2) | — | core in practice |
| fees | `TuitionFeePlan` / `UniformFeePlan` / `LunchFeeConfig` / `ActivityFeePlan` | configuration, not facts | `academic_year` | fees |
| fees | `Invoice` | `kind` (ANNUAL/QUARTERLY/SALE), `term`/`quarter` (NULL unless QUARTERLY), `amount_due`, `amount_paid` (denormalised), `due_date`, `status`, `created_at` | `student`, `academic_year` | fees |
| fees | `InvoiceLine` | **fact grain for charges.** `category`, `level_snapshot`, `amount`, `amount_allocated` (denormalised), `status`, `is_sale`, `is_legacy`, `source_kind`, `created_at` | `invoice` | fees |
| fees | `FeeAdjustment` | `kind` (DISCOUNT/WAIVER/SCHOLARSHIP/BURSARY), `amount`, `created_at` | `invoice_line` | fees |
| fees | `Payment` | `amount`, `payment_method`, `paid_at` (indexed), `status` (ACTIVE/REVERSED), `reversed_at` | `student` (**nullable**; P5), `invoice` (legacy; P6) | fees |
| fees | `PaymentAllocation` | **fact grain for collections.** `amount` | `payment`, `invoice_line` | fees |
| fees | `StudentCredit`, `UniformSaleItem` | credit balances; sale items | — | fees |

`fees/reports.py` already defines the correct accounting rules, and analytics reuses them rather than re-deriving them:
- "Collected" = ACTIVE allocations, excluding `CARRIED_CREDIT`. SALE revenue is included.
- "Required" = `amount − Σ adjustments`, floored at 0. VOID lines are excluded.
- Class is `InvoiceLine.level_snapshot`, not `Student.level`.

### 1.4 Attendance (`attendance`): deferred (D1)

| App | Model | Key fields | FKs | Gate |
|---|---|---|---|---|
| attendance | `AttendanceRecord` | `date` (indexed), `session`, `status`, `quarter` (nullable, never set by the bulk endpoint) | `student`, `marked_by` | attendance |
| attendance | `AbsenceAlert` | `date`, `sms_sent`, `sent_at` | `student` | attendance |

### 1.5 SMS (`sms`)

| App | Model | Key fields | FKs | Gate |
|---|---|---|---|---|
| communications | `SmsBatch` | `kind`, `status`, `dry_run`, counts, `total_segments`, `total_cost`, `created_at` | `created_by` | sms |
| communications | `SmsMessage` | **fact grain.** `status`, `skip_reason`, `segments`, `cost`, `created_at`, `sent_at` | `batch`, `student` (nullable), `guardian` (nullable) | sms |

The legacy `Message`/`MessageLog` (email channel, `communications` key) are not analysed.

### 1.6 Out of scope for now

Staff, leave and discipline (D11), boarding, transport, library, homepackages, timetable and documents. Boarding and transport can still act as *dimensions* (§5) when their modules are on.

---

## 2. The "org unit" hierarchy

```
School              SchoolSettings singleton (one deployment = one school)
 └─ Level group     students.level_groups.LevelGroup: NURSERY / PRIMARY / OLEVEL / ALEVEL
     │              (derived from level via level_group(); not stored)
     └─ Level       students.models.Level: N_BABY … STD7, FORM1 … FORM6
         └─ Stream  students.Stream (managed list, uppercase); stored as StreamField text
```

- **Stream is now an entity.** `students.Stream` is the list of valid names, and every stream column is a `StreamField` (uppercased on write and on lookup). Today no table records which streams a given level has. P10 adds that (per-class stream setup), and the tree's (level, stream) leaves then come from the class-stream configuration for the selected year.
- **Level group** comes only from `students.level_groups` (P7), and `SchoolSettings.active_levels` prunes it.
- **Blank stream** still means "single-stream level" on `Student`/`Enrolment` and "whole level" on `Exam`. In analytics a blank snapshot stream is shown as "—".
- The tree is **synthetic** (built in code, not a model).

**Which class a fact belongs to** (D2), per fact:

| Fact | Level source | Stream source |
|---|---|---|
| `MarkEntry` | `level_snapshot` (new, P1) | `stream_snapshot` (new, P1) |
| `InvoiceLine` | `level_snapshot` (exists; P4 cleans it up) | none. Fees break down to level only. Stream comes from `Enrolment` for the invoice's year where one exists. |
| Enrolment metrics | `Enrolment.level` for the year | `Enrolment.stream` |
| `SmsMessage` | `Enrolment` for the year of `created_at`, else current | same |

---

## 3. The "period" dimension

### 3.1 Structures

| Structure | Where | Notes |
|---|---|---|
| Academic year | `fees.AcademicYear` | Treated as a calendar year (Jan–Dec) when quarter dates are missing (P2). |
| Term | `Term` TextChoices TERM1/TERM2 | strings, not FKs |
| Quarter | `Quarter` TextChoices Q1–Q4 | Q1,Q2 → TERM1; Q3,Q4 → TERM2 (`shule/utils.TERM_QUARTER_MAP`) |
| Quarter date ranges | `AcademicYear.q{1..4}_start/_end` | nullable. P2 adds validation and a fallback. |
| Dates | `DateField` / `DateTimeField` | Truncated in `Africa/Dar_es_Salaam` |

### 3.2 How each fact attaches to a period

| Fact | Period attribute | How the resolver filters |
|---|---|---|
| `MarkEntry` | `exam.academic_year`, `exam.term`, `exam.quarter` | (year, term, quarter) filters. `MONTH` is not offered. |
| `InvoiceLine` (billing) | `invoice.academic_year` + `invoice.term/quarter`. ANNUAL lines have no quarter → **"Annual" bucket** by default, or split evenly across the quarters when the query sets `annual=per_quarter` (P3). SALE lines: quarter derived from `created_at`. | (year, term, quarter) filters plus the Annual bucket |
| `PaymentAllocation`: `fees.collected` | the billing period of the line it paid (D3) | same as `InvoiceLine` |
| `PaymentAllocation`: `fees.cash_in` | `payment.paid_at` (D3) | date range from the quarter dates (P2) |
| `FeeAdjustment` | billing period of its line | same as `InvoiceLine` |
| `Payment` reversals | `reversed_at` | date range |
| `SmsMessage` | `created_at` | date range |
| Enrolment | `Enrolment.academic_year` | year only. Term/quarter selection falls back to the year. |

### 3.3 Relative periods

`THIS_YEAR` is the year with `is_current = True`. `LAST_YEAR` is `year − 1`. `THIS_QUARTER` is the quarter of the current year whose date range contains today; if the dates are missing, it's today's calendar quarter plus a warning. `LAST_4_QUARTERS` is the four quarters ending with `THIS_QUARTER`, which may cross into the previous year.

---

## 4. Metrics

Aggregation types:
- `sum` and `count` are additive.
- `count_distinct` must be recomputed for every cell and total.
- `weighted_avg` is Σ numerator / Σ denominator at fact grain, divided at the end.
- `ratio` is two aggregates divided at the end, ×100 where it's a percentage.
- `distribution` is computed from the raw fact rows of each output cell. It is **not** additive, so subtotals and totals are recomputed rather than combined.

Every metric declares a **grain**, a **module key** and a **role group** (§6.6).

### 4.1 Enrolment (core · role group `enrolment`)

| id | Label | Formula | Grain | Agg |
|---|---|---|---|---|
| `enrol.enrolled` | Enrolled students | `COUNT(Enrolment)` for the year, `status IN (ACTIVE, SUSPENDED)` | enrolment | count |
| `enrol.by_status` | Students by status | `COUNT(Enrolment)` grouped by `status` | enrolment | count |
| `enrol.left` | Left during year | `COUNT(Enrolment WHERE left_on IS NOT NULL)` | enrolment | count |
| `enrol.new_admissions` | New admissions | `COUNT(Student WHERE admission_date IN period)` | student | count |
| `enrol.special_needs_pct` | % with special needs | `COUNT(student.has_special_needs) / COUNT(*)` over enrolled | enrolment | ratio |
| `enrol.gender_ratio` | Girls per 100 boys | `COUNT(gender='F') / COUNT(gender='M') × 100` | enrolment | ratio |

Years before `students.0008` have no `Enrolment` rows. For those years the metric returns no data plus a warning; it does not fall back to today's roster.

### 4.2 Academics (exams · role group `academics`)

Every mark is out of 100 (D14), so a score is already a percentage: `pct = score`.

| id | Label | Formula | Grain | Agg |
|---|---|---|---|---|
| `exam.marks_count` | Marks entered | `COUNT(MarkEntry)` | pupil×subject×exam | count |
| `exam.mean_score` | Mean score (%) | `SUM(pct) / COUNT(*)` (D6) | same | weighted_avg |
| `exam.median_score` | Median score (%) | `percentile_cont(0.5) WITHIN GROUP (ORDER BY pct)` | same | distribution |
| `exam.p25_score` / `exam.p75_score` | Lower/upper quartile | `percentile_cont(0.25 / 0.75)` | same | distribution |
| `exam.min_score` / `exam.max_score` | Lowest / highest | `MIN(pct)` / `MAX(pct)` | same | distribution (min/max *can* be combined, but are grouped here for consistency) |
| `exam.stddev_score` | Standard deviation | `STDDEV_SAMP(pct)` | same | distribution |
| `exam.pass_rate` | Pass rate (%) | `COUNT(is_pass) / COUNT(*) × 100`. `is_pass` is the snapshot from the school's scale (P9) | same | ratio |
| `exam.grade_share` | % at grade X | `COUNT(grade = X) / COUNT(*) × 100` | same | ratio |
| `exam.candidates` | Candidates sat | `COUNT(DISTINCT student_id)` | same | count_distinct |
| `exam.completion_rate` | Mark-entry completion (%) | `COUNT(MarkEntry) / Σ(pupils in stream × subjects configured for that stream)` (D12, D17, P10) | same | ratio |
| `exam.skill_marks_mean` | Skill mean | `SUM(marks) / COUNT(marks IS NOT NULL)` | pupil×skill×exam | weighted_avg |

Implementation notes:
- Django has `StdDev`, `Min` and `Max`. The median and percentiles need a small custom `Aggregate` with the template `percentile_cont(%(p)s) WITHIN GROUP (ORDER BY %(expressions)s)`, which is Postgres-only (CI runs on Postgres).
- The mean is never computed as a mean of per-student or per-class means (D6). The same applies to every `distribution` metric: a median of medians is wrong, so the API re-runs the aggregate for each total row and column.

**Phase 2 (after P9):**
- `exam.division_share`: % of candidates in Division I–IV/0.
- `exam.psle_aggregate_mean`.

Both use per-student best-N selection. Their grain is **student × exam**, which is additive for counts, computed with a window function (`ROW_NUMBER() OVER (PARTITION BY exam, student ORDER BY points)`) in a subquery. They are not averaged from subject means.

### 4.3 Fees (fees · role group `fees`)

| id | Label | Formula | Grain | Agg |
|---|---|---|---|---|
| `fees.billed` | Billed (gross) | `SUM(InvoiceLine.amount)`, not VOID, `kind IN (ANNUAL, QUARTERLY)` | line | sum |
| `fees.adjustments` | Discounts/waivers | `SUM(FeeAdjustment.amount)` on non-VOID lines | adjustment | sum |
| `fees.required` | Net required | `SUM(GREATEST(amount − adj, 0))` (as in `fees/reports._outstanding_lines`) | line | sum |
| `fees.collected` | Collected (billing period) | `SUM(PaymentAllocation.amount)`, `payment.status='ACTIVE'`, method ≠ `CARRIED_CREDIT`; period from the line's invoice (D3) | allocation | sum |
| `fees.cash_in` | Cash received (payment period) | same filter; period from `payment.paid_at` (D3) | allocation | sum |
| `fees.outstanding` | Outstanding | `SUM(GREATEST(required − amount_allocated, 0))` | line | sum |
| `fees.collection_rate` | Collection rate (%) | `fees.collected / fees.required × 100` | — | ratio |
| `fees.sales_revenue` | Uniform sales | `SUM(InvoiceLine.amount)`, `is_sale`, not VOID | line | sum |
| `fees.credit_applied` | Credit applied | `SUM(PaymentAllocation.amount)` where method = `CARRIED_CREDIT` | allocation | sum |
| `fees.reversals` | Reversed payments | `SUM(Payment.amount)`, `status='REVERSED'`, period from `reversed_at` | payment | sum |
| `fees.payers` | Paying students | `COUNT(DISTINCT payment.student_id)` | payment | count_distinct |
| `fees.defaulters` | Students with arrears | `COUNT(DISTINCT invoice.student_id)` where outstanding > 0 and `due_date < today` | line | count_distinct |
| `fees.mean_balance` / `fees.median_balance` | Mean / median balance per student | Outstanding summed per student in a subquery, then `AVG` / `percentile_cont` over students | student | weighted_avg / distribution |

### 4.4 SMS (sms · role group `sms`)

| id | Label | Formula | Grain | Agg |
|---|---|---|---|---|
| `sms.messages` | SMS messages | `COUNT(SmsMessage)` excluding `batch.dry_run` | recipient×batch | count |
| `sms.delivered_rate` | Delivery rate (%) | `COUNT(status IN (SENT, DELIVERED)) / COUNT(status ≠ SKIPPED) × 100` | same | ratio |
| `sms.failed` / `sms.skipped` | Failed / skipped | `COUNT(status = …)` | same | count |
| `sms.segments` | Segments | `SUM(segments)` | same | sum |
| `sms.cost` | SMS cost | `SUM(cost)` | same | sum |

### 4.5 Metric groups → module keys

| Group | Module key | Hidden when |
|---|---|---|
| enrolment | core | never |
| academics | `exams` **and** `reports` (D19) | either one off |
| fees | `fees` | `fees` off (e.g. Msewe) |
| sms | `sms` | `sms` off |

### 4.6 Deferred

- Attendance (D1): `att.sessions`, `att.rate`, `att.absent`, `att.late_rate`, `att.alerts_sent`. They return once the attendance semantics (old Q7) are decided.
- Boarding/transport occupancy, library loans, discipline, staff (D11).

---

## 5. Dimensions

Every dimension declares which grains it applies to, and the registry greys out combinations that don't fit.

| Dimension | Grouping field(s) | Applies to | Module |
|---|---|---|---|
| **Org unit: level group** | `CASE` over the level source (§2) using `LEVELS_BY_GROUP` | all | core |
| **Org unit: level** | marks `level_snapshot`; fees `level_snapshot`; enrolment `Enrolment.level` | all | core |
| **Org unit: stream** | marks `stream_snapshot`; enrolment `Enrolment.stream`; fees via `Enrolment` for the invoice year | marks, enrolment, fees | core |
| **Period** | §3.2 | all | core |
| Subject | `subject_id`. The subject picker lists only the subjects configured for the selected class streams (P10). | marks | exams |
| Subject level group / compulsory | `subject.level_group`, `subject.is_compulsory` | marks | exams |
| Exam type | `exam.exam_type` | marks, skills | exams |
| Exam | `exam_id` (filter only) | marks, skills | exams |
| Grade | `mark_entry.grade` (snapshot, school scale) | marks | exams |
| Pass / fail | `mark_entry.is_pass` | marks | exams |
| Score band | `CASE` over `pct` using the school scale's band edges, or deciles | marks | exams |
| Skill | `skill` | skills | reports |
| Gender, special needs | `student.gender`, `student.has_special_needs` | all student-linked | core |
| Age band | `date_of_birth` at period end | all student-linked | core |
| Boarding vs day | `EXISTS(active BoardingAssignment for year)` | student-linked | boarding |
| Dormitory / route | `boarding_assignment.dormitory_id` / `transport_assignment.route_id` | student-linked | boarding / transport |
| Fee category, invoice kind, line status | `category`, `invoice.kind`, `status` | fees | fees |
| Payment method | `payment.payment_method` | collections | fees |
| Adjustment kind | `fee_adjustment.kind` | adjustments | fees |
| SMS kind / status | `sms_batch.kind`, `sms_message.status` | sms | sms |

---

## 6. Risks

### 6.1 Indexes

Candidates, to be decided by measurement under P11:

| Table | Candidate | Why |
|---|---|---|
| `exams_markentry` | (`level_snapshot`, `stream_snapshot`) once P1 lands | org-unit grouping and class-teacher scoping |
| `exams_exam` | (`academic_year_id`, `term`, `quarter`), `exam_type` | period filter on every marks query |
| `fees_invoiceline` | `category`, `level_snapshot`, `status` | core fee group-bys |
| `fees_invoice` | (`academic_year_id`, `kind`, `term`, `quarter`) | period filter for fees |
| `fees_payment` | (`status`, `payment_method`) | collections filter |

### 6.2 Existing patterns analytics must not copy

- `exams/views.py` class results and subject analysis aggregate in Python loops. Analytics does it in SQL.
- The report-card ranking loads every entry in the exam.
- `SchoolPerformanceView` groups by **current** `student__level/stream`. After P1 it should switch to the snapshot columns.
- `InvoiceLine.adjustment_total` / `net_required` / `outstanding` each run a query per line (N+1). Use the `Subquery` form from `fees/reports._outstanding_lines` instead.
- The denormalised `amount_allocated`, `amount_due` and `amount_paid` are kept correct only by ORM signals. `QuerySet.update()` bypasses them.
- **Snapshot rewrite on re-sync:** `fees/charges._apply_line` and uniform assignment set `level_snapshot = student.level` when they re-price an untouched line. If a *past* year is re-synced after a promotion, its snapshot moves to the new class. P4 changes this to use the `Enrolment` level for the invoice's year.

### 6.3 Nullable or inconsistent fields: resolution

| Field | Resolution |
|---|---|
| `AcademicYear.q*_start/_end` | P2 |
| `Invoice.term` / `quarter` | P3 |
| `InvoiceLine.level_snapshot` | P4 |
| `Payment.student` | P5 |
| `Payment.invoice` | P6 |
| `exams.LevelGroup` duplicate | P7 |
| `MarkEntry.score` range | P8 |
| `MarkEntry.grade` fixed scale | P9 |
| `StudentSkillAssessment.marks` | Nullable by design. NULLs are excluded from both numerator and denominator. |
| `SmsBatch.dry_run` | Every SMS metric filters `dry_run = False`. |
| `SmsMessage.student` | Nullable. Rows without a pupil go in an "Unattributed" org-unit bucket. |
| `Exam.stream` blank vs set | Resolved by P1: the pupil's stream is snapshotted on each mark, whatever the exam's scope. |
| `AttendanceRecord.quarter` | Deferred with attendance. P1 fixes the bulk path to set it anyway. |

### 6.4 Privacy and small cells

A cell such as "FORM6 · B · Girls · Physics" can hold a single pupil, and its mean *is* that pupil's mark. Decision D18:

- **Which metrics are masked:** score metrics only. These are `exam.mean_score`, `median`, `p25`/`p75`, `min`/`max`, `stddev`, `pass_rate`, `grade_share` and `skill_marks_mean`. Counts (`marks_count`, `candidates`, enrolment, fees, SMS) are never masked.
- **The rule:** when a cell's `COUNT(DISTINCT student_id)` is below `ANALYTICS_MIN_CELL_SIZE`, the value is returned as `null` with `"suppressed": true`, and the UI shows "<5". The setting defaults to **5**, so it can be tuned without a code change.
- **The distinct-pupil count** is computed in the same query as the metric (one extra aggregate). Masking happens on the server, so a masked value never leaves the API.
- **Totals** are computed from the raw rows, as usual. A total covering 5 or more pupils is shown even when some of its cells are masked. With one masked cell in a row whose other cells are all shown, the masked value could be worked out by subtraction. For **mean** metrics that needs the per-cell counts, which are masked alongside the value. Accepted as a residual risk for now.
- **Exempt:** OWNER, HEADTEACHER and SYSTEM_ADMIN always see real values. A CLASS_TEACHER is exempt within their own class, which is the only data they can see anyway.

### 6.5 Module-awareness

The registry filters metric groups **and** dimensions with `shule.modules.module_enabled` (§4.5, §5). When `ENABLED_MODULES` is unset, every module counts as on.

Live deployments (D21) are **production** and **Msewe**. Tests cover both module sets with `@override_settings(ENABLED_MODULES=[...])`:
- production: the default full list;
- Msewe: without `fees`. The fees group, the fee dimensions and the fee health checks must disappear entirely.

Msewe's exact `.env` list still needs to be copied into the test fixture when we build the registry.

### 6.6 Access: role groups (D13)

| Role group | Roles | Scope |
|---|---|---|
| `enrolment` | OWNER, SYSTEM_ADMIN, HEADTEACHER, ACADEMIC_TEACHER, BURSAR, CLASS_TEACHER | CLASS_TEACHER: own class |
| `academics` | OWNER, SYSTEM_ADMIN, HEADTEACHER, ACADEMIC_TEACHER, CLASS_TEACHER | CLASS_TEACHER: own class |
| `fees` | OWNER, SYSTEM_ADMIN, HEADTEACHER, BURSAR | whole school |
| `sms` | OWNER, SYSTEM_ADMIN, HEADTEACHER | whole school |

- `IsAnalyticsStaff` admits the union of these roles. The metric catalogue endpoint returns only the groups the caller may see, and the query endpoint rejects any metric outside the caller's groups with a 403.
- **CLASS_TEACHER scope:** the server forces an org-unit filter of (level, stream) from their `ClassTeacherAssignment` for the selected academic year, matched against the **snapshot** columns. A class teacher never sees another class, even in totals. With no assignment for the selected year, the result is empty.
- PARENT, STUDENT, TEACHER, SUBJECT_TEACHER and DISCIPLINE_TEACHER are excluded.

---

## 7. Prerequisite fixes (Phase 0.5, before the analytics app)

These changes live in the owning apps (`exams`, `fees`, `attendance`), not in analytics. That's the same approach as `students.Enrolment`, so the Phase 1 rule "no new *analytics* models" still holds. Each item ships with tests, and migrations stay backward-compatible.

### P1. Class at the time on marks and attendance (D2)

**Is it best practice?** Yes. Recording descriptive attributes on the fact as they were when the fact happened is the standard way to report on history (a point-in-time snapshot). The codebase already does it with `InvoiceLine.level_snapshot`. `Enrolment` complements it: it answers "who was in which class in year X", while the snapshot answers "which class did *this* mark belong to". The snapshot is exact even when a pupil changes stream mid-year, and it needs no join at query time.

Changes:
- `MarkEntry`: add `level_snapshot` (Level choices) and `stream_snapshot` (`StreamField(blank=True)`). Add the latter to `STREAM_COLUMNS`.
- `AttendanceRecord`: the same two fields. `BulkAttendanceView` also starts setting `quarter` from the date resolver (P2).
- **Where they are written:** both `save()` and the bulk-create paths (`exams/views.py` bulk marks and `attendance/views.py` bulk attendance), because `bulk_create` skips `save()`. They are set **on create only**, and editing a score does not touch the snapshot.
- **Source at write time:**
  - Marks: level = `exam.level`. Stream = `exam.stream` if set, otherwise the pupil's `Enrolment.stream` for `exam.academic_year`, otherwise `student.stream`. Using `exam.level` keeps late entry correct, for example Q4 marks entered after January promotion.
  - Attendance: `Enrolment` for the year containing `date`, otherwise the student's current class.
- **Backfill** (data migration or management command with `--dry-run` that reports counts):
  - Marks: level = `exam.level` (always correct). Stream = `exam.stream`, then `Enrolment` for the exam's year, then the pupil's **current** `student.stream` (D22). The command reports how many rows used the current-stream fallback, so the school knows how much of the historical stream data is a best guess.
  - Attendance: `Enrolment` for the year, otherwise Unknown.
- Follow-up: point `SchoolPerformanceView` and the class-results views at the snapshot columns.

### P2. Quarter dates on `AcademicYear`

- **Validation** in the model's `clean` and its serializer, applied when dates are provided:
  - each quarter has `start ≤ end`;
  - the quarters are in order and don't overlap (`q1_end < q2_start` …);
  - a quarter's start and end are both set or both empty.
  
  Add matching `CheckConstraint`s for the ordering pairs, using `Q(a__isnull=True) | Q(b__isnull=True) | Q(a__lte=F('b'))`.
- **Completeness is not enforced by the database.** Admins legitimately create next year before its dates are known. Instead:
  - The admin UI shows an "Incomplete quarter dates" badge on the year.
  - A shared `period_resolver.date_to_period(date)` returns `(year, term, quarter)`. When the covering year's dates are missing, it falls back to `year = date.year`, assigns the quarter "UNASSIGNED" and never drops the row.
  - Every analytics response carries a `warnings[]` array, for example "2025 has no Q3 dates; 312 rows are shown as Unassigned".
  - The `analytics_health` management command (P12) lists years with incomplete dates.

### P3. `Invoice.term` / `quarter` NULL for ANNUAL and SALE

This is correct by design and stays that way. It is now enforced and handled:
- Add a `CheckConstraint` mirroring `Invoice.clean()`: QUARTERLY requires both term and quarter, and ANNUAL/SALE require both to be NULL.
- **ANNUAL** lines (tuition, annual uniform) belong to the year (D15). In YEAR views they are counted normally. TERM/QUARTER views offer an `annual` option:
  - `annual=bucket` (default): annual lines appear as a separate **"Annual"** period column. They are not dropped and not split.
  - `annual=per_quarter`: each annual line's `amount`, adjustments and allocations are split into four equal parts, one per quarter (two per term). The collection rate for each quarter then equals the line's annual rate, so the split never invents arrears. Rounding to the shilling puts any remainder in Q4, so the four parts sum exactly to the line.
  - The split happens in SQL (`amount / 4`, plus a `CROSS JOIN` over the four quarters), not in Python. Only `billed`, `required`, `collected`, `outstanding` and `adjustments` support it. `cash_in` is always by payment date and is unaffected.
- **SALE** lines get their billing period from `InvoiceLine.created_at` through `date_to_period`. A sale is a point-in-time event.

### P4. `InvoiceLine.level_snapshot` blank

- Backfill command `backfill_level_snapshots --dry-run`. For each blank line, use `Enrolment.level` for `invoice.academic_year`. If there is none and the invoice year is current, use `student.level`. Otherwise leave it blank, and analytics shows it as **"Unknown"** rather than guessing.
- Fix the rewrite risk (§6.2): `charges._apply_line` and uniform assignment take the level from `Enrolment` for the invoice's year, falling back to `student.level`.
- After the backfill reports zero blanks among non-legacy lines, add `CheckConstraint(~Q(level_snapshot='') | Q(is_legacy=True))`.

### P5. `Payment.student` nullable

- Backfill command `backfill_payment_student --dry-run`:
  1. Take the student from the payment's allocations (`allocation → invoice_line → invoice → student`) when they all agree.
  2. Otherwise use `payment.invoice.student`.
  3. Otherwise report the payment as unresolvable, for manual review.
- Once zero rows remain, a follow-up migration makes the field `null=False`. Until then, `fees.payers` excludes NULLs and emits a warning.

### P6. `Payment.invoice` legacy

- The analytics registry never references it.
- Mark it deprecated in `help_text`.
- Removing it is a separate, later change (it still backs legacy rows).

### P7. One `LevelGroup`

- `exams.models` imports `LevelGroup` from `students.level_groups`, so the old import path keeps working. `Subject.level_group` uses those choices. This is a label-only `AlterField` with no schema change. No migration imports the old class.
- Replace `exams/views._level_group()` with `students.level_groups.level_group()`.

### P8. `MarkEntry.score` constraint

The maximum mark is 100 for every exam and is not configurable (D14).
- `CheckConstraint(score >= 0 AND score <= 100)` on `MarkEntry`, named `markentry_score_0_100`.
- The migration first checks for out-of-range rows and aborts with a list of them rather than failing halfway. The serializer already rejects them, so we expect none.
- The serializer's existing 0–100 check stays, so API users get a friendly message instead of an `IntegrityError`.

### P9. Configurable grading (D10)

Editing is restricted to OWNER, HEADTEACHER and ACADEMIC_TEACHER, which is the existing `IsSeniorStaff` class. Every academic role can read the configuration, because report cards need it. It is gated by the `exams` key, and every change is audited through `log_action`.

New `exams` models, **versioned per academic year** so that changing next year's rules never rewrites history:

| Model | Fields | Purpose |
|---|---|---|
| `GradingScale` | `academic_year`, `level_group`, unique on both | One scale per level group per year |
| `GradeBand` | `scale`, `grade` (≤2 chars), `min_pct`, `points` (int, used for divisions), `is_pass`, `remark` | Grade boundaries. The pass mark is the lowest `min_pct` among `is_pass` bands, so there is a single source of truth. |
| `ResultScheme` | `academic_year`, `level_group`, `method` (DIVISION / AGGREGATE), `best_n`, `points_source` (GRADE_POINTS / SCORE_BANDS), `lower_is_better` | O-Level: DIVISION, best 7, grade points. Primary (PSLE): AGGREGATE, best 5, score bands. |
| `ScorePointBand` | `scheme`, `min_pct`, `points` | Used when `points_source = SCORE_BANDS` (the PSLE 1–10 table) |
| `DivisionBand` | `scheme`, `label` (I, II, …, 0), `max_points` | Division cut-offs |

Behaviour:
- **Seed:** a data migration creates rows equal to today's hard-coded rules for every existing year, so behaviour is unchanged on day one. `students.enrolment.open_year` (or an `AcademicYear` post-save hook) copies last year's configuration forward when a year is created.
- `exams/utils.get_grade`, `get_form4_division` and `get_psle_aggregate` become services that take `(exam.academic_year, level_group)` and read the configuration, with a per-request cache.
- `MarkEntry` gains `is_pass` (bool), a snapshot next to `grade`. Both are written on create or update in `save()` and in the bulk path.
- **When a scale is edited**, existing marks keep the `grade` and `is_pass` they were given (D16). Only marks created afterwards, or existing marks whose score is edited afterwards, are graded on the new scale. The edit is audited with the old and new bands.
  - Consequence: one year can contain marks graded under two versions of a scale. The grading page warns about this before saving ("N marks already entered this year will keep their current grades").
  - An explicit, audited "Regrade this year" action can be added later if a school needs one. It is not in scope now.
- Validation: bands must not overlap and must cover 0–100; at least one pass band; `best_n ≥ 1`; division bands ascending.
- Frontend: an "Exams → Grading settings" page, with the route guarded by `allowedRoles = SENIOR_STAFF` and `requiredModule = 'exams'`, plus a sidebar entry.
- Consumers to update: report cards, `exams/views.py` performance and subject analysis (pass mark), SMS exam-results templates, and analytics (`pass_rate`, grade dimension, divisions in Phase 2).

### P10. Class streams and subjects per stream (D12, D17)

Today `students.Stream` is only a list of names. Nothing records which streams each class (level) has, or which subjects each stream takes. The new setup is **Class → its streams → each stream's subjects**, done in one place.

New models:

| Model | Fields | Purpose |
|---|---|---|
| `students.ClassStream` | `academic_year`, `level`, `stream` (FK → `Stream`, **nullable** for a single-stream class), `is_active`. Unique on (`academic_year`, `level`, `stream`) | Which streams each class has in a given year, e.g. FORM1 → A, B, C |
| `exams.ClassStreamSubject` | `class_stream`, `subject`. Unique on both | The subjects each stream takes. A subject must belong to the class's level group and be active. |

- **Per academic year, copied forward (D23).** When a year is opened (`open_year`), last year's class streams and their subjects are copied, and the school then adjusts. Changing next year's subject list never changes last year's completion figures or report cards. It is the same versioning approach as grading (P9).
- **Setup UI:** a "Classes & streams" page (senior staff: OWNER, SYSTEM_ADMIN, HEADTEACHER, ACADEMIC_TEACHER). Pick a class, add or remove its streams (from the managed `Stream` list), and tick the subjects for each stream. A "copy subjects to all streams of this class" shortcut covers the common case.
- **Consumers, from the start:**
  - **Timetable:** `TimetableEntry` validation only accepts a subject configured for that (year, level, stream), and the subject picker lists only those.
  - **Mark entry:** the subject picker for an exam lists the subjects of the pupils' stream. The serializer rejects marks for a subject the stream doesn't take.
  - **Student and exam forms:** the stream picker for a level lists only that class's streams, which tightens `StreamSerializerField` for those forms.
  - **Analytics:** `exam.completion_rate` uses expected marks = Σ over streams of (pupils in that stream × that stream's subjects). The org-unit tree takes its (level, stream) leaves from `ClassStream` (§2).
- **Rollout for existing data:** a migration seeds `ClassStream` for the current year from the distinct (level, stream) pairs on `Enrolment`/`Student`, and gives each stream all active subjects of its level group. The school then prunes the lists. Until a stream's subjects have been reviewed, completion for it carries a "subjects not yet configured" warning (P12).
- `stream_in_use` (stream deletion guard) also checks `ClassStream`.

### P11. Index measurement (D7)

1. Management command `seed_analytics_bench` builds a realistic dataset on a scratch DB using `shule.factories`: about 1,200 pupils, 3 years, 14 subjects, 6 exams a year (roughly 300k `MarkEntry` rows), and full fee and SMS histories.
2. Run `EXPLAIN (ANALYZE, BUFFERS)` on every registry query shape: each metric × {no group, org unit, org unit + period, + subject}.
3. Record plans and timings in `docs/analytics/QUERY_PERF.md`.
4. Add an index only when it removes a large sequential scan or cuts p95 time materially, and add each one in its own migration.

### P12. `analytics_health` command

A read-only report of data-quality counts that affect analytics:
- years with incomplete quarter dates;
- blank `level_snapshot` / `stream_snapshot`;
- `Payment.student IS NULL`;
- marks without a grading scale for their year and level group;
- class streams with no subjects configured, and pupils whose (level, stream) has no `ClassStream` row.

The analytics UI shows the same checks as warnings.

We do not run this, or any backfill, against production data (D20). Every command:
- is read-only or supports `--dry-run`;
- prints counts only (no pupil names);
- is idempotent.

The school's operator runs them, dry-run first, and the "Deploy" notes in `deploy/DEPLOY.md` get a short runbook. Constraints that depend on a backfill (P4, P5) ship in a **separate, later migration**, so a deployment never fails because legacy rows haven't been cleaned yet.

---

## 8. Build order

1. **P7, P8, P2, P3 (constraint), P6**: small, independent schema and validation changes.
2. **P1**: snapshots, writers and backfill.
3. **P10**: class streams and subjects per stream, then the timetable and mark-entry validation that depend on them.
4. **P4, P5**: fee backfills (commands first, then constraints).
5. **P9**: grading configuration (models, seed, services, UI).
6. **P12**, then **P11** once the query shapes exist.
7. **Phase 1 analytics app:** registry, period resolver, org-unit tree, `IsAnalyticsStaff` with role groups, the aggregate endpoint, and the gated frontend route and sidebar entry.

---

## 9. Open questions

Resolved:
- Q1: enrolment, via `students.Enrolment`.
- Q2: class at the time (D2, P1).
- Q3: Annual bucket, with an optional per-quarter split (D15).
- Q5: mean definition (D6); divisions go to Phase 2 via P9.
- Q6 and Q20: subjects per stream, configured with the class streams (D17, P10).
- Q7: attendance deferred (D1).
- Q9 and Q16: roles; SYSTEM_ADMIN is included (D13).
- Q10: staff and discipline deferred (D11).
- Q11 and Q12: the maximum mark is fixed at 100, and grades and the pass mark are configurable (D14, P9).
- Q13: billing period vs payment period (D3).
- Q18: moot, because the maximum mark is fixed.
- Q19: no automatic regrade (D16).
- Q4: both `exams` and `reports` (D19).
- Q8: mask score cells under 5 pupils (D18).
- Q14: no production runs by us; the operator runs the commands (D20).
- Q15: production and Msewe (D21).
- Q17: fall back to the current stream (D22).
- Q21: per academic year, copied forward (D23).

Still open: none. The remaining unknown is Msewe's exact `ENABLED_MODULES` list, which is needed for the test fixture (§6.5).

