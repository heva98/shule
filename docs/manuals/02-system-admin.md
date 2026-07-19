# Shule SMS — User Manual
## Role: System Administrator

---

## 1. Introduction

As the **System Administrator**, you are responsible for configuring and maintaining the Shule SMS platform. Your panel focuses on system management — not day-to-day school operations. You manage user accounts, assign roles, configure the school profile, manage subjects and academic years, and monitor system health.

You **do not** have access to students, fees, attendance, or exam data. Those are handled by teaching and finance staff.

---

## 2. Getting Started

### Logging In
1. Open your browser and go to the Shule SMS URL.
2. Enter your **email address** and **password**.
3. Click **Sign In**.
4. You will land directly on the **System Dashboard** (Admin Panel).

> If you forget your password, contact the school Owner to reset it.

### Navigation
Your sidebar shows only the Admin Panel section:

| Menu Item | What it does |
|---|---|
| System Dashboard | Overview of users, students, health status, recent activity |
| User Management | Create, edit, deactivate user accounts, bulk import |
| Role Assignment | Change roles for existing users |
| Subjects & Classes | Manage subject catalogue and view class structure |
| Academic Year Setup | Create academic years and set quarter date ranges |
| School Settings | Update school profile, logo, and notification channels |
| Audit Logs | Review all admin actions taken in the system |
| System Health | Monitor database, Celery, email, and storage status |

---

## 3. System Dashboard

The dashboard shows a live overview:

**Row 1 — Stat cards:**
- **Total Users** with a role breakdown donut chart
- **Total Students** enrolled (active)
- **System Health** indicator (green = all OK, red = issue detected)

**Row 2 — Quick Actions:**
Click any card for the most common tasks: Add User, Assign Role, Add Subject, Academic Year, School Settings, View Audit Log.

**Row 3 — Recent Activity:**
The last 10 audit log entries. Each shows what was done, by whom, and how long ago.

---

## 4. User Management

### Viewing Users
1. Click **User Management** in the sidebar.
2. The table shows all system users with their role, status, and last login.
3. Use the **search bar** to find a user by name or email.
4. Use the **Role** dropdown to filter by a specific role.
5. Use the **Status** filter to show only Active or Inactive users.

### Creating a Single User
1. Click **+ Add User**.
2. Fill in:
   - **Full Name** (required)
   - **Email** (required, must be unique)
   - **Phone** (optional, used for WhatsApp notifications)
   - **Role** — select from the role cards (see Section 4.5 for role descriptions)
   - **Password** — auto-generate is on by default. Click **Refresh** to generate a new one.
3. Click **Create User**.
4. A success dialog shows the generated password. Click **Copy Password** before closing.
5. Share the password with the new user securely (WhatsApp or in person).

### Editing a User
1. Find the user in the table.
2. Click the **⋮** menu on their row → **Edit details**.
3. You can update **Full Name** and **Phone**.
4. Click **Save**.

> Email addresses cannot be changed after account creation.

### Resetting a Password
1. Find the user in the table.
2. Click **⋮** → **Reset password**.
3. A new password is pre-generated. You can enable **"Send new password to [email]"** to notify the user automatically.
4. Click **Reset Password** and share the new password with the user.

### Activating / Deactivating a User
1. Find the user in the table.
2. Click **⋮** → **Deactivate** (or **Activate** if currently inactive).
3. Confirm the action.

> Deactivated users cannot log in. Their data and history are fully preserved.

### Bulk Importing Users (CSV)
1. Click **Bulk Import CSV**.
2. Click **Template** to download a CSV template file.
3. Fill in the template:

| full_name | email | phone | role |
|---|---|---|---|
| Amina Hassan | amina@school.tz | +255712345678 | TEACHER |
| John Mwenda | john@school.tz | | BURSAR |

4. Drag and drop your CSV onto the upload area, or click to browse.
5. A preview shows the first 5 rows — verify the data looks correct.
6. Click **Import**.
7. Results show: **Created**, **Skipped** (duplicate emails), and **Errors** (invalid roles, etc.).

> Passwords are auto-generated for bulk-imported users. Download the results to see the temporary passwords and distribute them to staff.

### Role Descriptions

| Role | Access |
|---|---|
| **OWNER** | Full system access — all modules including admin panel |
| **SYSTEM_ADMIN** | Admin panel only — user management, settings, subjects, years |
| **HEADTEACHER** | Dashboard, students, fees, attendance, exams, staff, communications |
| **ACADEMIC_TEACHER** | Dashboard, students, attendance, exams, staff, communications |
| **DISCIPLINE_TEACHER** | Dashboard, students, attendance, discipline management |
| **CLASS_TEACHER** | Dashboard, students, attendance (own class only), exams |
| **SUBJECT_TEACHER** | Dashboard, students, exams (own subjects only) |
| **TEACHER** | Dashboard, students, attendance, exams (legacy general role) |
| **BURSAR** | Dashboard, students (view), fees |

---

## 5. Role Assignment

The Role Assignment page gives you a focused two-column interface for changing user roles.

1. Click **Role Assignment** in the sidebar.
2. On the **left panel**, find and click the user whose role you want to change.
3. Their current role is displayed prominently.
4. On the **right panel**, click the new role card to select it.
5. Optionally type a **reason** for the change (appears in the audit log).
6. Click **Confirm Role Change**.
7. A confirmation dialog asks: "Are you sure?" — click **Yes, change role**.

> Every role change is automatically recorded in the Audit Log with your name, the old role, the new role, the reason, and your IP address.

---

## 6. Subjects & Classes

### Managing the Subject Catalogue (Subjects tab)
1. Click **Subjects & Classes** in the sidebar.
2. The **Subjects** tab shows all subjects with their code, level group, and status.

**Adding a subject:**
1. Click **+ Add Subject**.
2. Enter:
   - **Subject Name** — e.g. "Kiswahili"
   - **Code** — short code, e.g. "KSW" (auto-uppercased)
   - **Level Group** — Primary, O-Level, or A-Level
   - **Compulsory** — tick if all students at this level must sit the subject
3. Click **Add Subject**.

**Editing a subject:**
Click the **pencil icon** on any row to edit name, code, level group, or compulsory status.

**Deactivating a subject:**
Click the **trash icon** → confirm. The subject is soft-deleted — historical exam records are preserved, but it no longer appears in new exam creation.

**Show inactive subjects:**
Tick **Show inactive** to see deactivated subjects.

### Classes & Streams (Classes tab)
The Classes tab shows a grid of all classes derived from active student enrolments (e.g. Form 2A, Std 3B). Each card shows the class name and student count.

> Classes are created automatically when students are enrolled into them. To add a new stream, enrol at least one student into the new level+stream combination.

---

## 7. Academic Year Setup

### Creating a New Academic Year
1. Click **Academic Year Setup** in the sidebar.
2. Click **Create Year**.
3. Enter the **Year** (e.g. 2026).
4. For each of the 4 quarters, enter the start and end dates:
   - **Q1** — Term 1, approximately January–March
   - **Q2** — Term 1, approximately April–June
   - **Q3** — Term 2, approximately July–September
   - **Q4** — Term 2, approximately October–November
5. Click **Create Year**.

> Date fields are optional but recommended — they help teachers and bursars see which period is current.

### Setting the Current Year
1. Find the academic year card you want to activate.
2. Click **Set as Current Year**.
3. Confirm. The previously active year is automatically deactivated.

> The current year is shown with a blue **CURRENT** badge on its card.

---

## 8. School Settings

### Updating School Identity
1. Click **School Settings** in the sidebar.
2. In the **School Identity** section:
   - Click the logo box to upload a new school logo (square image recommended, min 256×256 px).
   - Update **School Name**, **Motto**, **School Type**, **Established Year**, and **Registration Number**.
3. Scroll to **Contact & Location** and update phone, email, website, address, region, and district.
4. Click **Save Settings** at the bottom of the page.

### Notification Channels
The **Notification Channels** section shows the status of each channel:

| Channel | Status | How to configure |
|---|---|---|
| **Email (SMTP)** | Configured / Not configured | Edit `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD` in the server `.env` file |
| **WhatsApp** | Always active | Works via wa.me deep-links — no configuration needed |
| **SMS** | Coming soon | Africa's Talking integration is planned |

---

## 9. Audit Logs

The Audit Logs page shows a **timeline** of every admin action taken in the system.

### Reading an Entry
Each entry shows:
- A **colour-coded icon** indicating the action type (green = user created, blue = role changed, orange = settings updated, etc.)
- A **description** of what happened
- The **name** of the person who performed it
- The **timestamp** (exact date and time)
- The **IP address** from which the action was taken

### Filtering Logs
Use the filter row at the top:
- **Action type** — filter by a specific action (User Created, Role Changed, etc.)
- **User** — filter to see only actions by a specific person
- **Date range** — from / to date pickers

### Exporting to CSV
Click **Export CSV** to download the currently-filtered log as a spreadsheet. Useful for compliance audits or monthly reports.

---

## 10. System Health

The System Health page **auto-refreshes every 30 seconds** and shows the real-time status of all backend services.

### Service Cards
| Service | Green means | Red means |
|---|---|---|
| **Database** | PostgreSQL is responding | Connection error — restart Django service |
| **Celery Worker** | Background tasks are running | Worker is offline — restart with `celery -A shule worker` |
| **Email (SMTP)** | EMAIL_HOST is configured | Email not configured in `.env` |
| **WhatsApp** | Always green | wa.me links always work |
| **SMS** | Coming soon | — |

The **DB Latency** figure shows how fast the database is responding (normal is < 10ms).

### Stats Row
Shows: active users, total students, storage used (MB), and current DB latency.

### Manual Actions
**Run Absence Alerts Now** — triggers the absence notification job immediately. This sends WhatsApp/email alerts to guardians of all students marked absent today. Normally runs automatically at 09:00 daily; use this button if it did not run or needs to be re-sent.

---

## 11. Common Workflows

**Onboarding a new teacher:**
1. Go to **User Management → + Add User**.
2. Select the appropriate role (CLASS_TEACHER, SUBJECT_TEACHER, etc.).
3. Copy the generated password.
4. Share credentials with the teacher via WhatsApp or in person.
5. Ask them to log in and change their password.

**Start of academic year:**
1. Go to **Academic Year Setup → Create Year**.
2. Enter the year and all Q1–Q4 date ranges.
3. Click **Set as Current Year**.
4. Notify the Headteacher and Bursar that the year is active.

**Staff member leaves:**
1. Go to **User Management**.
2. Find the user → **⋮ → Deactivate**.
3. Their login is revoked. All records they created are preserved.

**Investigating a suspicious action:**
1. Go to **Audit Logs**.
2. Filter by the user or by date range.
3. Click **Export CSV** to share with management if needed.
