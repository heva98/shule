# Analytics Module — Phase 0 Discovery

Status: discovery only, no code written. Everything below comes from reading the models and the existing report code as of commit `ef55589`.

Target model: a DHIS2 Data Visualizer-style analysis of **data × period × org unit**, laid out as columns/rows/filters, gated by the `analytics` key in `ENABLED_MODULES` and limited to staff (`IsAnalyticsStaff`).

---

## 1. Inventory of analysable models

"Gate" is the `ENABLED_MODULES` key the existing views check. **Core** means the model is always on: `students` and `accounts` are not in `OPTIONAL_MODULES`.

### 1.1 Students and enrolment (core)

| App | Model | Key fields | FKs | Gate |
|---|---|---|---|---|
| students | `Student` | `gender` (M/F), `date_of_birth`, `level` (Level choices, indexed), `stream` (free text, blank allowed), `status` (ACTIVE/TRANSFERRED/GRADUATED/SUSPENDED/EXPELLED, indexed), `admission_date`, `has_special_needs`, `public_id`, `student_id`, `created_at` | `user` → User (nullable) | core |
| students | `Guardian` | `relationship`, `is_primary_contact`, `sms_opt_out`, `phone` | `student` → Student | core |
| accounts | `SchoolSettings` (singleton pk=1) | `school_type`, `active_levels` (JSON list of level groups), `region`, `district` | — | core |
| accounts | `AuditLog` | `action`, `target_model`, `timestamp` | `performed_by` → User | core (not analysable for this module) |

**Enrolment history: `students.Enrolment`** (added after discovery, see Q1). There is one row per student per academic year, holding `level`, `stream`, `status`, `enrolled_on` and `left_on`. The current year's row mirrors every save of the student. A row is seeded for every ACTIVE/SUSPENDED student when a year becomes current. Rows for past years are never modified again, so they record the student's class at year end. History starts from the deployment of migration `students.0008`. Years before that have no rows, and the only historical traces for them are the snapshot fields on other models (see §3.3). A year whose `q4_end` has passed is frozen, so promoting students before switching the year does not overwrite the record. Promotions should be done *after* the new year is set current.

### 1.2 Academics (`exams`, `reports`)

| App | Model | Key fields | FKs | Gate |
|---|---|---|---|---|
| exams | `Subject` | `name`, `code`, `level_group` (NURSERY/PRIMARY/OLEVEL/ALEVEL), `is_compulsory`, `is_active` | — | exams |
| exams | `Exam` | `name`, `term` (TERM1/2), `quarter` (Q1–Q4), `level`, `stream` (blank = whole level), `exam_type` (CA1/CA2/WEEKLY/MIDTERM/TERMINAL/MOCK), `start_date`, `end_date` | `academic_year` → AcademicYear, `created_by` → User | exams |
| exams | `MarkEntry` | `score` (Decimal 0–100, validated in the serializer only), `grade` (A–F, derived from `get_grade` on save and on bulk entry), `remarks`. Unique on (`exam`, `student`, `subject`) | `exam`, `student`, `subject`, `entered_by` | exams (write) / reports (read-side performance views) |
| exams | `StudentSkillAssessment` | `skill` (CREATIVITY/DISCIPLINE/SPORT/SMARTNESS/SPEAKING/WRITING), `marks` (nullable), `grade` | `exam`, `student`, `entered_by` | reports |
| exams | `ReportCardRemark` | free text and sign-off dates | `exam`, `student` | reports (not analysable) |

Derived measures that exist only in Python today (`exams/utils.py`): `get_grade` (A ≥75, B ≥60, C ≥45, D ≥30, F), `get_form4_division` (best 7 grade points → Division I–IV/0), `get_psle_aggregate` (best 5 on a 1–10 scale). The existing views treat 45 as the pass mark (`exams/views.py:754`).

### 1.3 Fees (`fees`)

| App | Model | Key fields | FKs | Gate |
|---|---|---|---|---|
| fees | `AcademicYear` | `year` (unique int), `is_current`, `q1_start`…`q4_end` (all nullable) | — | core in practice: every app FKs to it, although it lives in `fees` |
| fees | `SchoolCalendarEvent` | `event_type`, `start_date`, `end_date` | `academic_year` | school_calendar |
| fees | `TuitionFeePlan` / `UniformFeePlan` / `LunchFeeConfig` / `ActivityFeePlan` | `amount`, scope (`level_group` / `level`), `term`/`quarter` where quarterly, `is_active` | `academic_year` | fees (configuration, not facts) |
| fees | `Invoice` | `kind` (ANNUAL/QUARTERLY/SALE), `term`/`quarter` (NULL unless QUARTERLY), `amount_due`, `amount_paid` (denormalised from the lines), `due_date`, `status` (UNPAID/PARTIAL/PAID/OVERDUE), `created_at` | `student`, `academic_year` | fees |
| fees | `InvoiceLine` | **fact grain for charges.** `category` (TUITION/TRANSPORT/LUNCH/UNIFORM/ACTIVITY/OTHER), `level_snapshot`, `amount`, `amount_allocated` (denormalised), `status` (UNPAID/PARTIAL/PAID/WAIVED/VOID), `is_sale`, `is_legacy`, `source_kind`/`source_id`, `voided_at`, `created_at` | `invoice`, `created_by`, `voided_by` | fees |
| fees | `FeeAdjustment` | `kind` (DISCOUNT/WAIVER/SCHOLARSHIP/BURSARY), `amount`, `created_at` | `invoice_line`, `approved_by` | fees |
| fees | `Payment` | `amount`, `payment_method` (MPESA/AIRTEL/CASH/BANK_TRANSFER/CARRIED_CREDIT), `paid_at` (indexed), `status` (ACTIVE/REVERSED), `reversed_at` | `student` (**nullable**), `invoice` (legacy, nullable), `received_by`, `reversal_of`, `funded_from_credit` | fees |
| fees | `PaymentAllocation` | **fact grain for collections.** `amount`, `created_at` | `payment`, `invoice_line` | fees |
| fees | `StudentCredit` | `amount`, `remaining_amount`, `source` | `student`, `source_line`, `source_payment` | fees |
| fees | `UniformSaleItem` | `name`, `qty`, `unit_price` | `invoice_line` | fees |

`fees/reports.py` already defines the correct accounting rules, and analytics must reuse them rather than re-derive them:
- "Collected" = ACTIVE allocations, excluding `CARRIED_CREDIT`. SALE revenue is included.
- "Required" = `amount − Σ adjustments`, floored at 0. VOID lines are excluded.
- Class is `InvoiceLine.level_snapshot`, not `Student.level`.

### 1.4 Attendance (`attendance`)

| App | Model | Key fields | FKs | Gate |
|---|---|---|---|---|
| attendance | `AttendanceRecord` | **fact grain.** `date` (indexed), `session` (MORNING/AFTERNOON), `status` (PRESENT/ABSENT/LATE/EXCUSED), `quarter` (nullable, indexed), `reason`. Unique on (`student`, `date`, `session`) | `student`, `marked_by` | attendance |
| attendance | `AbsenceAlert` | `date`, `sms_sent`, `sent_at` | `student` | attendance |

### 1.5 Communications (`communications`, `sms`)

| App | Model | Key fields | FKs | Gate |
|---|---|---|---|---|
| communications | `Message` | `message_type` (SMS/EMAIL), `audience`, `target_level`/`target_stream`, `total_recipients`, `delivered_count`, `sent_at` | `target_student`, `sent_by` | communications (the legacy/email channel) |
| communications | `MessageLog` | `status` (PENDING/SENT/FAILED), `sent_at` | `message` | communications |
| communications | `SmsBatch` | `kind` (EXAM_RESULTS/FEE_REMINDER/ANNOUNCEMENT/TERM_DATES/PAYMENT_RECEIVED), `status`, `dry_run`, `total_recipients`, `sent_count`, `failed_count`, `skipped_count`, `total_segments`, `total_cost`, `created_at`, `completed_at`, `context` (JSON) | `template`, `created_by` | sms |
| communications | `SmsMessage` | **fact grain.** `status` (PENDING/SENT/DELIVERED/FAILED/SKIPPED, indexed), `skip_reason`, `segments`, `cost`, `created_at`, `sent_at` | `batch`, `student` (nullable), `guardian` (nullable), `sent_by` | sms |

### 1.6 Other optional modules (lower priority)

| App | Model | Analysable content | Gate |
|---|---|---|---|
| staff | `StaffProfile` | `designation`, `contract_type`, `hire_date`, `basic_salary`, M2M `subjects` | staff (the views are role-gated, **not** `ModuleEnabled`-gated) |
| staff | `ClassTeacherAssignment` | (`level`, `stream`, `academic_year`) → teacher | staff |
| staff | `LeaveRequest` | `leave_type`, `days_requested`, `status`, dates | staff |
| staff | `DisciplinaryIncident` | `date`, `incident_type` (free text), `severity`, `status` | staff (role-gated only). Parent/student-sensitive |
| boarding | `Dormitory`, `BoardingAssignment` | `capacity`, occupancy, `gender`; per-year placement with `is_active`/`vacated_at` | boarding |
| transport | `Route`, `RouteFee`, `TransportAssignment` | `capacity`, occupancy, per-year subscription | transport |
| library | `Book`, `BorrowRecord` | `category`, `borrowed_date`, `due_date`, `returned_date`, `status` | library |
| homepackages | `HomePackage` | count per subject/level/quarter | homepackages |
| timetable | `TimetableEntry` | lessons per subject/teacher/class | timetable |
| documents | `StudentDocument` | document completeness per student | documents |

---

## 2. The "org unit" hierarchy as it actually exists

There are **no org-unit tables.** The hierarchy is made of choice enums and free-text columns:

```
School              SchoolSettings singleton (one deployment = one school)
 └─ Level group     students.level_groups.LevelGroup: NURSERY / PRIMARY / OLEVEL / ALEVEL
     │              (derived from level via LEVELS_BY_GROUP, not stored on Student)
     └─ Level       students.models.Level: N_BABY … STD7, FORM1 … FORM6  (Student.level)
         └─ Stream  Student.stream: CharField(10), free text, blank allowed
```

Observations:
- **Level group is derived.** `level_group(level)` in `students/level_groups.py` is the canonical mapper. `exams.models.LevelGroup` is a duplicate TextChoices with the same values (kept for migrations). `SchoolSettings.active_levels` lists which groups the school runs, so it can prune the tree.
- **Stream is not an entity.** No table lists a level's valid streams. They exist only as distinct values of `Student.stream`, `Exam.stream`, `ClassTeacherAssignment.stream`, `TimetableEntry.stream` and `HomePackage.stream`. Casing is inconsistent: views filter with `stream__iexact`, and `ClassTeacherAssignment.__str__` uppercases. A stream list would be `SELECT DISTINCT upper(stream)`.
- **Blank stream** means either "single-stream level" (Student) or "whole level" (Exam). These meanings differ.
- **Parallel groupings** that could serve as extra org-unit-like dimensions: dormitory (boarding), route (transport), and class teacher (via `ClassTeacherAssignment`, per year).

Proposal: treat org unit as a **synthetic tree** built in code (School → Level group → Level → Stream) from the enums plus `DISTINCT stream` values. It would not be a new model, which respects the "Phase 1 builds on existing tables only" rule.

The harder question is **which** level/stream a fact belongs to (current or at-the-time). See §3.3 and §6.

---

## 3. The "period" dimension

### 3.1 Structures that exist

| Structure | Where | Notes |
|---|---|---|
| Academic year | `fees.AcademicYear.year` (int, unique), `is_current` | FK target everywhere. Assumed to be calendar year (Jan–Dec). |
| Term | `Term` TextChoices: TERM1, TERM2 | Stored as **strings**, not FKs. |
| Quarter | `Quarter` TextChoices: Q1–Q4 | `TERM_QUARTER_MAP` in `shule/utils.py`: Q1,Q2 → TERM1; Q3,Q4 → TERM2. |
| Quarter date ranges | `AcademicYear.q{1..4}_start/_end` | **All nullable.** They are the only way to map a date to a quarter. |
| Calendar dates | various `DateField` / `DateTimeField` | Timezone `Africa/Dar_es_Salaam`, so dates need a TZ-aware truncation. |

### 3.2 How each fact attaches to a period

| Fact | Year | Term | Quarter | Date |
|---|---|---|---|---|
| `MarkEntry` | via `exam.academic_year` | via `exam.term` | via `exam.quarter` | `exam.start_date` / `end_date` |
| `InvoiceLine` (charges) | via `invoice.academic_year` | `invoice.term`: **NULL for ANNUAL and SALE** | `invoice.quarter`: **NULL for ANNUAL and SALE** | `created_at`, `invoice.due_date` |
| `PaymentAllocation` (collections) | two readings: the *billing* period via `invoice_line.invoice.*`, or the *cash* period via `payment.paid_at` | same | same | `payment.paid_at` |
| `AttendanceRecord` | **none**, must be derived from `date` | **none** | `quarter`, **nullable and not set by the bulk-mark endpoint** (see §6) | `date` |
| `SmsMessage` / `SmsBatch` | none | none | none | `created_at`, `sent_at` |
| `FeeAdjustment` | via line → invoice | via line → invoice | via line → invoice | `created_at` |
| `BorrowRecord` | none | none | none | `borrowed_date` |
| `DisciplinaryIncident` | none | none | none | `date` |

### 3.3 Gaps

1. **Attendance has no academic-year FK, and `quarter` is effectively always NULL.** `BulkAttendanceView` (`attendance/views.py:163`) builds `AttendanceRecord(...)` without `quarter`, and nothing backfills it. Year and quarter must come from `date` compared against `AcademicYear.q*_start/_end`, and those can be NULL.
2. **Annual charges have no term or quarter.** Tuition and uniform sit on ANNUAL invoices. A "by quarter" fee view can either exclude them (which `fees/reports.py` does when `term` is given) or pro-rate them. Question Q3 below.
3. **Billing period and cash period differ.** A Q1 fee paid in Q2 counts as "Q1 collected" in one reading and "Q2 cash-in" in the other. Both are legitimate, so we need two distinct metrics.
4. **No historical class for marks or attendance.** `MarkEntry` and `AttendanceRecord` have no level/stream snapshot. For marks, `exam.level` gives the level at exam time, but the stream is only known when `exam.stream` is set; otherwise `student.stream` is today's value. For attendance, nothing records the class at the time. After a promotion, last year's attendance for today's FORM2 students would roll up under FORM2. The existing `SchoolPerformanceView` has the same issue: it groups by `student__level`, `student__stream`.
5. **The quarter → date mapping is partial** whenever the admin has not filled in the `q*_start/_end` dates.
6. **Enrolment history starts at the `students.0008` rollout.** "Enrolled in year X" comes from `Enrolment` for years from then on. Earlier years have no rows. Attendance can now use the class the pupil was in that year: join on (`student`, the academic year containing `date`).

Proposed period types for Phase 1: `YEAR`, `TERM`, `QUARTER`, `MONTH` (for date-grained facts only), and relative periods (`THIS_YEAR`, `LAST_YEAR`, `THIS_QUARTER`, `LAST_4_QUARTERS`). A resolver maps each period to either (year, term, quarter) filters or a date range, depending on the fact.

---

## 4. Proposed metrics

Aggregation types: `sum`, `count`, `count_distinct`, `weighted_avg` (Σ numerator / Σ denominator at fact grain, divided at the end), `ratio` (two independently aggregated metrics, divided at the end, ×100 where it's a percentage).

"Grain" is the row the registry aggregates over. Every metric listed here can be computed from SUM/COUNT at that grain, so re-slicing never averages averages.

### 4.1 Enrolment (core)

| id | Label | Formula (real fields) | Grain | Agg |
|---|---|---|---|---|
| `enrol.active` | Active students | `COUNT(Student) WHERE status='ACTIVE'` | Student | count |
| `enrol.by_status` | Students by status | `COUNT(Student)` grouped by `status` | Student | count |
| `enrol.new_admissions` | New admissions | `COUNT(Student) WHERE admission_date IN period` | Student | count |
| `enrol.special_needs_pct` | % with special needs | `COUNT(has_special_needs) / COUNT(*)` over ACTIVE | Student | ratio |
| `enrol.gender_ratio` | Girls per 100 boys | `COUNT(gender='F') / COUNT(gender='M') × 100` | Student | ratio |

Enrolment metrics read `students.Enrolment` for the selected academic year(s), grouped by that year's `level`/`stream`. Years before the history began fall back to a current-state snapshot. `new_admissions` still uses `admission_date`.

### 4.2 Academics (exams; reports)

| id | Label | Formula | Grain | Agg |
|---|---|---|---|---|
| `exam.marks_count` | Marks entered | `COUNT(MarkEntry)` | pupil×subject×exam | count |
| `exam.score_sum` | (hidden) score total | `SUM(MarkEntry.score)` | same | sum |
| `exam.mean_score` | Mean score | `SUM(score) / COUNT(MarkEntry)` | same | weighted_avg |
| `exam.pass_rate` | Pass rate (%) | `COUNT(score ≥ 45) / COUNT(*) × 100` | same | ratio |
| `exam.grade_share` | % at grade X | `COUNT(grade = X) / COUNT(*) × 100` | same | ratio |
| `exam.candidates` | Candidates sat | `COUNT(DISTINCT student_id)` | same | count_distinct (not additive across dimensions; see note) |
| `exam.completion_rate` | Mark-entry completion | `COUNT(MarkEntry) / (candidates × subjects expected)` | same | ratio. Needs a definition of "expected" (Q6) |
| `exam.skill_marks_mean` | Skill mean | `SUM(StudentSkillAssessment.marks) / COUNT(marks NOT NULL)` | pupil×skill×exam | weighted_avg |

Note: "Mean score" weights every pupil × subject mark equally. That is *not* the same as the mean of each student's average, which weights students with fewer subjects more heavily. The CLAUDE.md rule requires the former. The difference matters wherever subject counts vary (for example A-Level combinations). Divisions and PSLE aggregates use best-N selection per student, so they are per-student derived values. They cannot be expressed as SUM/COUNT at fact grain and are left out of Phase 1 (Q5).

### 4.3 Fees (fees)

| id | Label | Formula | Grain | Agg |
|---|---|---|---|---|
| `fees.billed` | Billed (gross) | `SUM(InvoiceLine.amount)` excluding VOID, `invoice.kind IN (ANNUAL, QUARTERLY)` | invoice line | sum |
| `fees.adjustments` | Discounts/waivers | `SUM(FeeAdjustment.amount)` on non-VOID lines | adjustment | sum |
| `fees.required` | Net required | `SUM(GREATEST(amount − adj, 0))`, the same expression as `fees/reports._outstanding_lines` | invoice line | sum |
| `fees.collected` | Collected (billing period) | `SUM(PaymentAllocation.amount)` where `payment.status='ACTIVE'` and `payment_method ≠ 'CARRIED_CREDIT'`, period taken from `invoice_line.invoice` | allocation | sum |
| `fees.cash_in` | Cash received (by payment date) | same filter, period taken from `payment.paid_at` | allocation | sum |
| `fees.outstanding` | Outstanding | `SUM(GREATEST(required − amount_allocated, 0))` | invoice line | sum |
| `fees.collection_rate` | Collection rate (%) | `fees.collected / fees.required × 100` | — | ratio |
| `fees.sales_revenue` | Uniform sales | `SUM(InvoiceLine.amount)` where `is_sale=True`, not VOID | invoice line | sum |
| `fees.credit_applied` | Credit applied | `SUM(PaymentAllocation.amount)` where method = `CARRIED_CREDIT` | allocation | sum |
| `fees.reversals` | Reversed payments | `SUM(Payment.amount)` where `status='REVERSED'`, period from `reversed_at` | payment | sum |
| `fees.payers` | Paying students | `COUNT(DISTINCT payment.student_id)` | payment | count_distinct |
| `fees.defaulters` | Students with arrears | `COUNT(DISTINCT invoice.student_id)` where line outstanding > 0 and `invoice.due_date < today` | invoice line | count_distinct |

### 4.4 Attendance (attendance)

| id | Label | Formula | Grain | Agg |
|---|---|---|---|---|
| `att.sessions` | Sessions recorded | `COUNT(AttendanceRecord)` | pupil×date×session | count |
| `att.present` | Present sessions | `COUNT(status IN ('PRESENT','LATE'))`. Whether LATE counts is Q7 | same | count |
| `att.rate` | Attendance rate (%) | `att.present / att.sessions × 100` | — | ratio |
| `att.absent` | Absences | `COUNT(status='ABSENT')` | same | count |
| `att.unexcused_absence_rate` | Unexcused absence (%) | `COUNT(ABSENT) / COUNT(*) × 100` (EXCUSED counted separately) | same | ratio |
| `att.late_rate` | Late (%) | `COUNT(LATE) / COUNT(*) × 100` | same | ratio |
| `att.alerts_sent` | Absence alerts sent | `COUNT(AbsenceAlert WHERE sms_sent)` | alert | count |

### 4.5 SMS (sms)

| id | Label | Formula | Grain | Agg |
|---|---|---|---|---|
| `sms.messages` | SMS messages | `COUNT(SmsMessage)` excluding `batch.dry_run` | recipient×batch | count |
| `sms.delivered_rate` | Delivery rate (%) | `COUNT(status IN ('SENT','DELIVERED')) / COUNT(status ≠ 'SKIPPED') × 100` | same | ratio |
| `sms.failed` | Failed | `COUNT(status='FAILED')` | same | count |
| `sms.skipped` | Skipped | `COUNT(status='SKIPPED')` | same | count |
| `sms.segments` | Segments | `SUM(segments)` | same | sum |
| `sms.cost` | SMS cost | `SUM(cost)` | same | sum |

### 4.6 Later / optional

`boarding.occupancy_rate` (active assignments / `SUM(capacity)`), `transport.occupancy_rate`, `library.loans`, `library.overdue_rate`, `discipline.incidents` (by `severity`), `staff.headcount`. Each of these is gated by its own module key (see Q9 for discipline).

---

## 5. Proposed dynamic dimensions

Every dimension declares which fact grains it applies to. The registry greys out incompatible dimension/metric combinations, the way DHIS2 does.

| Dimension | Grouping field(s) | Applies to | Notes |
|---|---|---|---|
| **Org unit: level group** | derived from level with `level_group()`, pushed into SQL as a `CASE` expression | all student-linked facts | enum |
| **Org unit: level** | marks: `exam.level`; fees: `invoice_line.level_snapshot`; attendance / SMS / enrolment: `student.level` (current) | all | Source differs per fact; see §3.3 and Q2 |
| **Org unit: stream** | marks: `exam.stream` if set, else `student.stream`; others: `UPPER(student.stream)` | all | Normalise case; blank → "—" |
| **Period** | see §3.2 | all | year / term / quarter / month |
| Subject | `mark_entry.subject_id` (label `code`/`name`) | marks | |
| Subject level group | `subject.level_group` | marks | |
| Compulsory vs optional | `subject.is_compulsory` | marks | |
| Exam type | `exam.exam_type` | marks, skills | CA1/CA2/WEEKLY/MIDTERM/TERMINAL/MOCK |
| Exam | `exam_id` | marks, skills | high-cardinality: filter only |
| Grade band | `mark_entry.grade` (A–F) | marks | stored column, so no CASE needed |
| Score band | `CASE` on `score` (0–29, 30–44, 45–59, 60–74, 75–100, or deciles) | marks | |
| Skill | `student_skill_assessment.skill` | skills | |
| Gender | `student.gender` | all student-linked facts | |
| Special needs | `student.has_special_needs` | all student-linked facts | |
| Student status | `student.status` | all student-linked facts | |
| Age band | derived from `date_of_birth` at the period end | all student-linked facts | |
| Boarding vs day | `EXISTS(BoardingAssignment active for the year)` | student-linked facts; needs `boarding` | Mirrors `fees.resolvers.is_boarding` |
| Dormitory | `boarding_assignment.dormitory_id` | same | boarding |
| Transport route | `transport_assignment.route_id` | same | transport |
| Fee category | `invoice_line.category` | fees | |
| Invoice kind | `invoice.kind` | fees | ANNUAL/QUARTERLY/SALE |
| Line status | `invoice_line.status` | fees charges | |
| Payment method | `payment.payment_method` | fees collections | |
| Adjustment kind | `fee_adjustment.kind` | adjustments | |
| Attendance status | `attendance_record.status` | attendance | |
| Attendance session | `attendance_record.session` | attendance | MORNING/AFTERNOON |
| Day of week | `EXTRACT(dow FROM date)` | attendance | |
| SMS kind | `sms_batch.kind` | sms | |
| SMS status | `sms_message.status` | sms | |
| Class teacher | `class_teacher_assignment.teacher` on (level, stream, year) | marks, attendance | staff; the join is on text columns |
| Subject teacher | none | — | **No reliable mapping.** `StaffProfile.subjects` is M2M with no class, and `TimetableEntry` is only indirect. Not proposed. |

---

## 6. Risks

### 6.1 Missing indexes (for the dimensional queries)

Django adds indexes to FK columns automatically. The ones below are missing for analytics-style filters and group-bys:

| Table | Missing | Why it matters |
|---|---|---|
| `exams_exam` | (`academic_year_id`, `term`, `quarter`), `level`, `exam_type`, `start_date` | Every marks query filters exams by period and level. The table is small, so this is low risk, but the join fans out into MarkEntry. |
| `exams_markentry` | `subject_id` and `student_id` exist as FK indexes; the unique index starts with `exam_id`. OK as it stands. | A composite (`exam_id`, `subject_id`) would help, but the unique index already covers it partly. |
| `fees_invoiceline` | `category`, `level_snapshot`, `status` | Core group-bys for the fee metrics. `fees/reports.py` scans on them today. |
| `fees_invoice` | (`academic_year_id`, `kind`, `term`, `quarter`) | Period filter for every fee metric. Only the `status, due_date` index exists. |
| `fees_payment` | (`status`, `payment_method`) | Filter on every collections metric. `paid_at` is indexed. |
| `attendance_attendancerecord` | (`date`, `status`) composite | The rate metric filters on date and groups by status. `date` is indexed alone. |
| `communications_smsmessage` | `student_id` is an FK index, fine; `(status, created_at)` exists | OK |
| `students_student` | `gender` | Low cardinality; probably fine without one. |

Recommendation: measure with `EXPLAIN ANALYZE` on a realistic dataset before adding any of these. Postgres will scan small tables sequentially regardless.

### 6.2 N+1 and Python-side aggregation already in the codebase

These are not bugs today, but they are patterns analytics must **not** copy:
- `exams/views.py` class results (≈L566–620) and subject analysis (≈L717–760) load every MarkEntry into Python and compute totals and averages in loops. Analytics must do this in SQL (`values().annotate()`).
- `exams/views.py` report-card ranking (≈L367–375) loads **all** entries for an exam to rank one student.
- `SchoolPerformanceView` (≈L812) uses `Avg('score')` at mark grain. That is weighted correctly, but it groups by **current** `student__level/stream` (the historical drift in §3.3).
- `fees/summaries.py` `student_fee_summary` / `outstanding_breakdown` loop over lines per student. Fine for one student, O(N) queries if reused for a class.
- `InvoiceLine.adjustment_total` / `net_required` / `outstanding` are **properties that each run a query**. Any code that touches them across many lines is N+1. `fees/reports._outstanding_lines` already has the correct Subquery version, so reuse that.
- `Dormitory.occupied_count` and `Route.occupied_count` are properties that query per row.
- `recompute_line` / `recompute_invoice` signals mean `amount_allocated`, `amount_due` and `amount_paid` are denormalised. They are trustworthy only as long as every write goes through the ORM, and `QuerySet.update()` bypasses them.

### 6.3 Nullable or inconsistent fields

| Field | Issue |
|---|---|
| `AttendanceRecord.quarter` | Nullable, and never set by the bulk endpoint. Do not use it; derive the period from `date`. |
| `AcademicYear.q1_start…q4_end` | Nullable. The date→quarter mapping silently drops rows if they are empty. The registry must detect this and warn. |
| `Invoice.term` / `quarter` | NULL by design for ANNUAL and SALE. Per-quarter fee views must handle it explicitly. |
| `InvoiceLine.level_snapshot` | `blank=True`. Legacy or backfilled lines (`is_legacy=True`) may be empty. Needs a fallback to `student.level`, or an "Unknown" bucket. |
| `Payment.student` | Nullable ("Phase 1 backfill window"). Needs a check for rows that are still NULL. |
| `Payment.invoice` | Legacy only; don't use it. |
| `Student.stream`, `Exam.stream` | Free text with mixed case. Blank means different things on each model. |
| `Exam.stream` blank vs set | A stream-specific exam and a whole-level exam can coexist for the same level and period. Mixing them could double-count a pupil's subject in a "mean score by level" query. The pupil×subject×exam grain keeps it correct, but the "candidates" count is by exam. |
| `MarkEntry.score` | The 0–100 range is enforced only in the serializer, with no DB CheckConstraint. The admin or shell could insert out-of-range values. |
| `MarkEntry.grade` | Uses one A–F scale for **all** levels, including A-Level and nursery. It may not match NECTA A-Level grading. |
| `StudentSkillAssessment.marks` | Nullable (grade-only assessments). Exclude NULLs from both numerator and denominator. |
| `SmsBatch.dry_run` | Dry-run rows exist and must be excluded from every SMS metric. |
| `SmsMessage.student` | Nullable (announcements to guardians without a pupil link?). No org-unit breakdown is possible for those rows. |
| `exams.LevelGroup` vs `students.level_groups.LevelGroup` | Two enums with the same values and different labels. Use the `students` one. |
| Staff and discipline gating | Staff views are role-gated, not `ModuleEnabled`-gated, so it's unclear whether discipline metrics should follow the `staff` key. |

### 6.4 Privacy and aggregate leakage

The CLAUDE.md rule "never return individual pupil rows" also needs a **minimum cell size**. A cell such as "FORM6 · Stream B · Girls · Special needs · Physics" can be a single pupil, and its mean score then *is* that pupil's mark. See Q8.

### 6.5 Module-awareness

The fee metrics need `fees`. Mark metrics need `exams` (and `reports`? see Q4). Attendance metrics need `attendance`, SMS metrics need `sms`, and boarding, dormitory and route dimensions need `boarding` / `transport`. The registry must filter metrics **and** dimensions on `shule.modules.module_enabled`. Note the back-compat rule: when `ENABLED_MODULES` is unset, *every* module is on.

---

## 7. Clarifying questions

1. ~~**Enrolment over time.**~~ **Resolved:** we added `students.Enrolment`, a core students-app model rather than an analytics model, so the Phase 1 "no new analytics models" rule still holds. Open follow-up: should past years be backfilled from `exam.level` and `invoice_line.level_snapshot`?
2. **Historical org unit.** For marks and attendance, should a fact roll up by the pupil's class **at the time** (possible for marks via `exam.level` and partly `exam.stream`, impossible for attendance) or by their **current** class? Proposal: marks use exam level; attendance uses current class, with a visible caveat.
3. **Annual charges in quarterly views.** When the user picks a term or quarter, should tuition and uniform (ANNUAL) be excluded (the current `fees/reports.py` behaviour), shown under a separate "Annual" period bucket, or pro-rated (tuition / 4 per quarter)?
4. **Which key gates mark analytics:** `exams`, `reports`, or both? Today `exams` gates mark entry and `reports` gates the performance views.
5. **Divisions and PSLE aggregates.** They are per-student best-N computations, so they are not additive. Should Phase 1 include "% Division I–IV" or "PSLE aggregate distribution"? That would need a per-student subquery or window function rather than a simple SUM/COUNT.
6. **Mark-entry completion.** What is the "expected" number of marks per pupil per exam? All active subjects in the level group? Compulsory subjects only? Timetabled subjects?
7. **Attendance semantics.** Does LATE count as present? Does EXCUSED count in the denominator? Is a day made of two sessions, or should rates be per day?
8. **Minimum cell size.** Should cells below a threshold (for example n < 5 pupils) be suppressed or masked for pupil-level metrics such as scores and attendance? What threshold?
9. **Who is "analytics staff"?** Which roles get `IsAnalyticsStaff`: OWNER, HEADTEACHER and ACADEMIC_TEACHER? BURSAR (fees metrics only)? CLASS_TEACHER (limited to their own class)? Should each metric group carry its own role list, so that a bursar sees fees and not marks?
10. **Discipline and staff metrics.** Are `DisciplinaryIncident` and staff/leave in scope at all? If so, which module key gates them, given that the staff views don't use `ModuleEnabled` today?
11. **Pass mark.** Is 45 (grade C) the pass threshold for every level, including A-Level and nursery? Should it be configurable?
12. **Score scale.** Are all exam scores percentages (0–100), or do CA/weekly tests have different maximums that were already normalised before entry?
13. **Collections period default.** Should "Collected in Q2" default to billing period (`fees.collected`) or cash-receipt date (`fees.cash_in`)? Bursars usually mean cash-in.
14. **Legacy data.** Are there production rows with `Payment.student IS NULL`, blank `InvoiceLine.level_snapshot`, or empty `AcademicYear` quarter dates? That decides whether we need backfill commands before Phase 1.
15. **Msewe and other deployments.** Which `ENABLED_MODULES` sets are live today, so the registry's module filtering can be tested against real combinations?
