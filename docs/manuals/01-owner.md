# Shule SMS — User Manual
## Role: Owner / Director

---

## 1. Introduction

As the **Owner / Director**, you have full, unrestricted access to every part of Shule SMS. You can view and manage students, fees, attendance, exams, staff, communications, and the system administration panel. This manual covers all areas of the system available to your role.

---

## 2. Getting Started

### Logging In
1. Open your browser and go to the Shule SMS URL provided by your administrator.
2. On the **Login** page, enter your **email address** and **password**.
3. Click **Sign In**.
4. You will land on the **Dashboard**.

> If you forget your password, contact the System Administrator to reset it.

### Navigation
The blue sidebar on the left contains all menu items:

| Menu Item | What it does |
|---|---|
| Dashboard | School-wide overview and key metrics |
| Students | Enrol, view, and manage student records |
| Fees | Fee structures, invoices, payments, defaulters |
| Attendance | Daily attendance register and reports |
| Exams | Create exams, enter marks, view results |
| Staff | Staff profiles, leave requests, class assignments |
| Communications | Send messages to parents via WhatsApp or email |
| **Admin Panel** | System configuration (see Section 9) |

---

## 3. Dashboard

The Dashboard loads automatically after login and shows a live snapshot of school activity.

**Stat cards (top row):**
- **Total Students** — active enrolments
- **Fees Collected** — total payments received this year
- **Outstanding Fees** — unpaid and partial balances
- **Today's Attendance** — present percentage for today

**Monthly Revenue chart** — bar chart of fee collections per month.

**Top Fee Defaulters** — the 5 students with the highest outstanding balance. Click **Send Reminder** on any row to open a pre-filled WhatsApp message to the student's guardian.

---

## 4. Students

### Viewing the Student List
1. Click **Students** in the sidebar.
2. Use the **search bar** to find a student by name, ID, or phone.
3. Use the **Level** and **Status** filters to narrow results.
4. Click a student's row to open their full profile.

### Enrolling a New Student
1. Click **Students → New Student** (or the **+ Add Student** button).
2. Fill in all required fields:
   - **Personal:** First name, last name, date of birth, gender
   - **Academic:** Level (Std 1–7 or Form 1–6), stream, admission date
   - **Guardian:** Full name, relationship, phone, email, WhatsApp number
3. Click **Save**. The system auto-generates a student ID (e.g. `SHULE-2025-0042`).

### Student Detail Page
Clicking a student opens their profile with tabs:
- **Overview** — personal details, guardian contacts
- **Fees** — their invoices and payment history
- **Attendance** — monthly attendance summary
- **Exams** — all exam results and report card

### Editing a Student
On the student detail page, click the **Edit** button to update personal or guardian information.

---

## 5. Fees

### Fee Structures Tab
Fee structures define how much each level is charged per quarter.

**Adding a fee structure:**
1. Click **Fees** in the sidebar.
2. Go to the **Fee Structures** tab.
3. Click **+ Add Structure**.
4. Select **Academic Year**, **Level**, **Term** (Term 1 or Term 2), and **Quarter** (Q1–Q4).
5. Enter the fee amount in TZS.
6. Click **Save**.

> **Academic Calendar:** Term 1 covers Q1 (Jan–Mar) and Q2 (Apr–Jun). Term 2 covers Q3 (Jul–Sep) and Q4 (Oct–Nov).

### Generating Invoices
1. Go to the **Invoices** tab.
2. Click **Generate Invoices**.
3. Select **Academic Year**, **Term**, and **Quarter**.
4. Optionally filter by **Level**.
5. Click **Generate**. Invoices are created for all students at matching levels.

### Recording a Payment
1. Find the student's invoice in the **Invoices** tab (search by name or ID).
2. Click the **Record Payment** button on the invoice row.
3. Enter the **amount**, **payment method** (Cash, M-Pesa, Bank Transfer), and optional **reference**.
4. Click **Save**. A receipt number (e.g. `RCP-2025-00001`) is generated automatically.

### Viewing Defaulters
The **Defaulters** tab lists all students with unpaid or partially-paid invoices.
- Use **Term** and **Quarter** filters to view defaulters for a specific period.
- Click **Send Reminder** to open a WhatsApp message to the student's guardian.

---

## 6. Attendance

### Marking the Daily Register
1. Click **Attendance** in the sidebar.
2. Click **Mark Attendance**.
3. Select **Date**, **Session** (Morning or Afternoon), **Level**, and **Stream**.
4. For each student, select their status: **Present**, **Absent**, **Late**, or **Excused**.
5. Click **Submit**. Records can be updated later if needed.

### Viewing Attendance Reports
- Use the **Date**, **Level**, **Stream**, and **Month** filters to view historical records.
- The **Summary** view shows per-student attendance percentages.
- The **Daily Summary** card shows the school-wide attendance rate for today.

### Absence Notifications
When a student is marked **Absent**, the system can automatically notify the primary guardian by WhatsApp or email. This runs automatically each morning via a scheduled task, or you can trigger it manually from **Admin Panel → System Health → Run Absence Alerts Now**.

---

## 7. Exams

### Creating an Exam
1. Click **Exams** in the sidebar.
2. Click **+ Create Exam**.
3. Fill in:
   - **Title** — e.g. "Mid-Term Examination"
   - **Subject** — select from the subject list
   - **Exam Type** — CA1, CA2, Mid-Term, Terminal, or Mock
   - **Level** — the class level being examined
   - **Term** and **Quarter**
   - **Exam Date** and **Max Score**
4. Click **Create**. Subject teachers assigned to this subject are notified automatically.

### Entering Marks
1. On the Exams list, click the **Enter Marks** (pen) icon on an exam row.
2. For each student, enter their raw score.
3. The system automatically calculates the grade (A–F) and division (for O-Level).
4. Click **Save All Marks**.

### Viewing Results and Report Cards
1. Click the **Results** (chart) icon on any exam row.
2. The Results page shows all marks, grades, and the class average.
3. Click **View Report Card** on any student row to see their full report.

---

## 8. Staff

### Viewing Staff Profiles
1. Click **Staff** in the sidebar.
2. The staff list shows all staff members with their designation, contract type, and contact details.
3. Click a staff member to view their full profile.

### Adding a Staff Member
1. Click **+ Add Staff**.
2. Fill in: full name, employee ID, designation, department, contract type, joining date, subjects (for teachers), and contact details.
3. Click **Save**.

### Managing Leave Requests
- Staff leave requests appear in the **Leave Requests** section.
- Click **Approve** or **Reject** with an optional comment.

### Class Teacher Assignments
1. In the **Staff** section, use the **Class Assignments** tab.
2. Click **+ Assign Class Teacher**.
3. Select the teacher, level, stream, and academic year.
4. Only one class teacher can be assigned per class per year.

### Disciplinary Incidents
1. In the **Staff** section, go to the **Discipline** tab.
2. Click **+ New Incident** to record a disciplinary case against a student.
3. Fill in: student, incident type, date, description, and severity.
4. Assign to a discipline teacher or resolve directly.

---

## 9. Communications

### Sending a Broadcast Message
1. Click **Communications** in the sidebar.
2. Click **+ New Message**.
3. Select the **channel**: WhatsApp (wa.me link) or Email.
4. Select the **audience**: All Students, By Level, By Class, or Individual.
5. Type your subject and message body.
6. Click **Send**.

For WhatsApp messages, the system generates a link that opens WhatsApp with a pre-filled message. You click **Open** for each recipient.

---

## 10. Admin Panel

As Owner, you have access to the full System Administrator panel. See the **[System Administrator Manual](02-system-admin.md)** for complete details.

**Quick access from the Dashboard:**
- **+ Add User** → creates a new system account
- **Assign Role** → change a user's role
- **School Settings** → update school name, logo, and contact details

---

## 11. Tips and Common Workflows

**Start of academic year:**
1. Go to **Admin Panel → Academic Year Setup** → Create the new year with Q1–Q4 date ranges.
2. Set it as the **Current Year**.
3. Go to **Fees → Fee Structures** → Add structures for each level/quarter.

**Fee collection day:**
1. Open **Fees → Invoices**, filter by level.
2. Record payments one by one using **Record Payment**.

**End of term:**
1. Verify all marks are entered in **Exams**.
2. Print report cards from the **Results** page.
3. Run **Fees → Defaulters** and send reminders to outstanding families.

**If a staff member leaves:**
1. Go to **Admin Panel → User Management**.
2. Find the user and click **Deactivate** — they cannot log in but their records are preserved.
