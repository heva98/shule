# Shule SMS — User Manual
## Role: Bursar

---

## 1. Introduction

As the **Bursar**, you are responsible for all financial operations in Shule SMS. You manage fee structures, generate invoices, record payments, and follow up on defaulters. You also have read access to student records. You do not manage attendance, exams, or staff.

---

## 2. Getting Started

### Logging In
1. Open the Shule SMS URL in your browser.
2. Enter your **email address** and **password**.
3. Click **Sign In**. You land on the **Dashboard**.

### Your Sidebar
| Menu Item | What it does |
|---|---|
| Dashboard | Fee collection overview and defaulters |
| Students | View student records and fee history |
| Fees | Fee structures, invoices, payments, defaulters |

---

## 3. Dashboard

Your Dashboard shows the most important financial metrics at a glance:

- **Fees Collected** — total payments received this academic year
- **Outstanding Fees** — total unpaid and partially-paid balances
- **Today's Attendance** — school-wide attendance rate (read-only)
- **Total Students** — active enrolments

**Monthly Revenue Chart** — bar chart showing fee collection per month. Use this to spot slow months and plan follow-up campaigns.

**Top Fee Defaulters** — the 5 students with the highest outstanding balance. Click **Send Reminder** to open a pre-filled WhatsApp message to the guardian, or the system will send an email if configured.

---

## 4. Students

You have read access to student records.

1. Click **Students** in the sidebar.
2. Search by name, student ID, or phone number.
3. Filter by **Level** or **Status** (Active, Transferred, etc.).
4. Click a student to open their profile.

### Relevant Student Profile Tabs

| Tab | What you can see |
|---|---|
| Overview | Personal details and guardian contact information |
| Fees | All invoices and payment history for this student |
| Attendance | Attendance record (read-only) |
| Exams | Exam results (read-only) |

> To view a student's complete fee history, open their profile and click the **Fees** tab. You can see every invoice and every payment linked to that student.

---

## 5. Fees

This is your primary working area in Shule SMS.

### Understanding the Academic Calendar
The school uses **2 terms** per year, each divided into **2 quarters**:

| Quarter | Period | Term |
|---|---|---|
| Q1 | January – March | Term 1 |
| Q2 | April – June | Term 1 |
| Q3 | July – September | Term 2 |
| Q4 | October – November | Term 2 |

Fee structures and invoices are created per quarter.

---

### Tab 1: Fee Structures

Fee structures define how much each level is charged per quarter.

#### Adding a Fee Structure
1. Click **Fees** → **Fee Structures** tab.
2. Click **+ Add Structure**.
3. Fill in:
   - **Academic Year** — e.g. 2025
   - **Level** — e.g. Form 2, Std 5
   - **Term** — Term 1 or Term 2
   - **Quarter** — Q1, Q2, Q3, or Q4 (Quarter list updates based on your Term selection)
   - **Amount (TZS)** — the fee for this level/quarter
4. Click **Save**.

> Repeat this process for every level and quarter. For example, if you have 7 primary levels and 4 secondary levels across 4 quarters, you will create 44 fee structures for the year.

#### Editing a Fee Structure
Click the **edit icon** on any row to update the amount. Changes do not affect already-generated invoices — only new invoices going forward.

---

### Tab 2: Invoices

Invoices are generated from fee structures and link to individual students.

#### Generating Invoices for a Quarter
1. Click the **Invoices** tab.
2. Click **Generate Invoices**.
3. Select:
   - **Academic Year**
   - **Term** (Term 1 or Term 2)
   - **Quarter** (Q1–Q4, filtered by your term selection)
   - Optionally filter by **Level** to generate for one level at a time
4. Click **Generate**.

> The system creates one invoice per student per fee structure that matches. If a student's level has no fee structure, no invoice is created for them — you must first add a fee structure for that level.

#### Viewing and Searching Invoices
Use the filters on the Invoices tab:
- **Student name or ID** — search for a specific student
- **Level** — filter by class level
- **Term / Quarter** — filter by period
- **Status** — Paid, Partial, Unpaid, Overdue

Each invoice row shows: student name, level, period, total amount, amount paid, balance, and status badge.

#### Invoice Status Badges
| Badge | Meaning |
|---|---|
| **Paid** (green) | Full amount has been received |
| **Partial** (yellow) | Some payment has been made but balance remains |
| **Unpaid** (red) | No payment received yet |
| **Overdue** (dark red) | Unpaid past the quarter end date |

---

### Tab 3: Recording Payments

You record each payment as it comes in.

1. In the **Invoices** tab, find the student's invoice.
2. Click the **Record Payment** button on the invoice row.
3. In the payment dialog, fill in:
   - **Amount Paid** — the cash received (can be partial)
   - **Payment Method** — Cash, M-Pesa, or Bank Transfer
   - **Reference** — M-Pesa code, bank slip number, or cash receipt number (optional but recommended)
   - **Date** — defaults to today, change if recording a backdated payment
4. Click **Save**.

> A receipt number is automatically generated (e.g. `RCP-2025-00042`). You can print or share this as a receipt.

#### Partial Payments
The system fully supports partial payments. If a parent pays half the fees:
1. Record the payment with the actual amount received.
2. The invoice status changes from **Unpaid** to **Partial**.
3. When the balance is paid, record another payment.
4. Once fully paid, the status changes to **Paid**.

---

### Tab 4: Defaulters

The Defaulters tab lists all students with outstanding balances.

1. Click the **Defaulters** tab.
2. Use the **Term** and **Quarter** filters to see defaulters for a specific period.
3. Each row shows: student name, level, term/quarter, total fee, amount paid, balance, and guardian phone number.

#### Sending a Fee Reminder
1. Click **Send Reminder** on a defaulter's row.
2. If the guardian has a WhatsApp number, a pre-filled WhatsApp message opens. Send it from your phone or computer.
3. If the guardian has only an email, a reminder email is sent automatically.

> The system also runs an automatic fee reminder every Monday morning for all overdue invoices. You can trigger it manually from the Dashboard's **Send Reminder** button on the defaulters card.

---

## 6. Common Workflows

**Beginning of each quarter:**
1. Verify the fee structures for the new quarter are correct (**Fee Structures** tab).
2. Click **Generate Invoices** to create invoices for all students.
3. Confirm the count of invoices matches your expected student numbers.

**Daily payment recording:**
1. Collect payment from the parent/guardian.
2. Open **Fees → Invoices**, search for the student.
3. Click **Record Payment**, enter the details.
4. Note the receipt number and give a manual receipt if required.

**End-of-month report:**
1. Go to **Fees → Invoices**, filter by the current month/quarter.
2. Note the total of **Paid** invoices vs. **Unpaid/Partial**.
3. Check the **Dashboard** Monthly Revenue chart for the trend.
4. Go to **Defaulters** tab for the full outstanding list.

**A parent disputes a payment:**
1. Go to **Students**, find the student.
2. Open their **Fees** tab.
3. You can see every invoice and every payment with exact amounts, dates, methods, and receipt numbers.
4. This is the official record.

**Preparing an end-of-term fee report:**
1. Go to **Fees → Invoices**, filter by the relevant Term and Quarter.
2. Note total invoiced vs. total collected vs. outstanding.
3. Go to **Defaulters**, filter by the same period.
4. Export or screenshot as needed for your records.

---

## 7. Tips

- **Always record M-Pesa codes** in the Reference field — this prevents duplicate payment disputes.
- **Generate invoices early** at the start of each quarter so parents know what is due.
- **Use the Defaulters tab** for phone calls — it shows the guardian's phone number next to the balance, making it efficient to work through the list.
- If a student transfers to another school, their fee balance is still visible on their profile. Collect any outstanding amount before finalising the transfer.
