"""
Shule SMS — Build illustrated HTML user manuals from captured screenshots.
Run AFTER capture_screenshots.py has completed.

Usage:
    python docs/build_manual.py
Output:
    docs/Shule_SMS_User_Manual.html   — single-file manual (open in any browser, print to PDF)
"""

import base64
import json
from datetime import date
from pathlib import Path

SCREENSHOT_DIR = Path(__file__).parent / "screenshots"
OUT_FILE       = Path(__file__).parent / "Shule_SMS_User_Manual.html"

TODAY = date.today().strftime("%d %B %Y")

# ---------------------------------------------------------------------------
# Manual content: (role_key, role_label, sections)
# Each section: (heading, body_html, screenshot_key_or_None)
# ---------------------------------------------------------------------------

MANUALS = [
    # ── 1. Login page (shared) ───────────────────────────────────────────────
    {
        "key": "_login",
        "label": "Getting Started — Logging In",
        "intro": "All staff access Shule SMS through the same login page. Enter your email address and password, then click <strong>Sign In</strong>.",
        "sections": [
            ("Login Page", "Enter your <strong>email</strong> and <strong>password</strong> provided by the System Administrator. If you forget your password, contact the System Administrator.", "login"),
        ],
    },
    # ── 2. Owner ─────────────────────────────────────────────────────────────
    {
        "key": "owner",
        "label": "Owner / Director",
        "intro": "The Owner has full access to all modules — students, fees, attendance, exams, staff, communications, and the System Administrator panel.",
        "sections": [
            ("Dashboard", "The Dashboard shows school-wide metrics: total students, fees collected, outstanding fees, and today's attendance rate. The <strong>Monthly Revenue</strong> chart and <strong>Top Defaulters</strong> list are also shown.", "dashboard"),
            ("Students", "View, search, and enrol students. Filter by level or status. Click any row to open the full student profile with fees, attendance, and exam tabs.", "students"),
            ("Fees Overview", "Manage fee structures, generate invoices for each quarter, and record payments.", "fees"),
            ("Attendance", "Mark and review the daily register for any class. View per-student summaries and school-wide daily rates.", "attendance"),
            ("Exams", "Create exams, enter marks, and view results. Report cards are generated automatically.", "exams"),
            ("Staff", "Manage staff profiles, approve leave requests, assign class teachers, and record disciplinary incidents.", "staff"),
            ("Communications", "Send WhatsApp or email broadcast messages to parents by level, class, or individually.", "communications"),
            ("Admin Dashboard", "The System Admin panel shows user stats, quick actions, and a live activity feed.", "admin_dash"),
            ("User Management", "Create, edit, deactivate, and bulk-import user accounts.", "admin_users"),
            ("School Settings", "Update school name, logo, contact details, and notification channel status.", "admin_settings"),
            ("System Health", "Monitor database, Celery worker, email, and storage in real time.", "admin_health"),
        ],
    },
    # ── 3. System Admin ───────────────────────────────────────────────────────
    {
        "key": "sysadmin",
        "label": "System Administrator",
        "intro": "The System Administrator manages the platform configuration. Access is limited to the Admin Panel — no day-to-day school operations.",
        "sections": [
            ("System Dashboard", "Overview of total users (with role breakdown chart), total students, health status, and the last 10 admin actions.", "admin_dash"),
            ("User Management", "Create individual users or bulk-import via CSV. Edit details, reset passwords, change roles, and activate/deactivate accounts.", "admin_users"),
            ("Role Assignment", "Two-column interface: select a user on the left, choose their new role from the card grid on the right, then confirm.", "admin_roles"),
            ("Subjects & Classes", "Manage the subject catalogue (add, edit, deactivate) and view the class/stream structure derived from enrolments.", "admin_subjects"),
            ("Academic Year Setup", "Create academic years with Q1–Q4 date ranges. Set the current active year.", "admin_years"),
            ("School Settings", "Update school identity (logo, name, motto), contact details, and Tanzania region. View notification channel status.", "admin_settings"),
            ("Audit Logs", "Timeline of every admin action: who did what, when, and from which IP address. Filterable and exportable to CSV.", "admin_audit"),
            ("System Health", "Live service status: Database (with latency), Celery worker, Email (SMTP), WhatsApp, SMS. Auto-refreshes every 30 seconds.", "admin_health"),
        ],
    },
    # ── 4. Headteacher ────────────────────────────────────────────────────────
    {
        "key": "headteacher",
        "label": "Headteacher",
        "intro": "The Headteacher has full oversight of school operations — students, fees, attendance, exams, staff management, and parent communications.",
        "sections": [
            ("Dashboard", "School-wide metrics and top defaulters list with one-click WhatsApp fee reminders.", "dashboard"),
            ("Students", "Enrol new students, view and edit profiles, access guardian contact details.", "students"),
            ("Fees", "View fee structures, generate invoices, record payments, and manage defaulters.", "fees"),
            ("Attendance", "Mark attendance for any class, view daily summaries and per-student attendance rates.", "attendance"),
            ("Exams", "Create exams, supervise mark entry, view results and report cards.", "exams"),
            ("Staff", "View and edit staff profiles, approve leave requests, assign class teachers, review disciplinary incidents.", "staff"),
            ("Communications", "Send WhatsApp or email messages to parents — by level, class, or individually.", "communications"),
        ],
    },
    # ── 5. Academic Teacher ────────────────────────────────────────────────────
    {
        "key": "academic",
        "label": "Academic Teacher",
        "intro": "The Academic Teacher coordinates academic matters across the school — attendance oversight, exam management, and parent communications.",
        "sections": [
            ("Dashboard", "School overview with attendance and fee summaries.", "dashboard"),
            ("Students", "View all student records, profiles, and results.", "students"),
            ("Attendance", "Mark attendance for any class. View school-wide patterns and absentee lists.", "attendance"),
            ("Exams", "Create exams for any level. Enter marks for any exam. Review all results.", "exams"),
            ("Staff", "View staff profiles and class assignments.", "staff"),
            ("Communications", "Send messages to parents by level, class, or individually.", "communications"),
        ],
    },
    # ── 6. Discipline Teacher ─────────────────────────────────────────────────
    {
        "key": "discipline",
        "label": "Discipline Teacher",
        "intro": "The Discipline Teacher manages student conduct. They can view student records, attendance patterns, and handle incident referrals.",
        "sections": [
            ("Dashboard", "School-wide overview. Informational for this role.", "dashboard"),
            ("Students", "Search and view student profiles, including guardian contacts and attendance history.", "students"),
            ("Attendance", "View attendance records across all classes to identify patterns of absence or lateness.", "attendance"),
        ],
    },
    # ── 7. Class Teacher ──────────────────────────────────────────────────────
    {
        "key": "classteacher",
        "label": "Class Teacher",
        "intro": "The Class Teacher is assigned to one class. They mark the daily register for that class and enter exam marks for their students.",
        "sections": [
            ("Dashboard", "School overview. Informational for this role.", "dashboard"),
            ("Students", "View all student profiles including attendance and exam results.", "students"),
            ("Attendance", "Mark the daily register for your assigned class (level + stream). Your class is pre-selected automatically.", "attendance"),
            ("Exams", "Enter marks for exams involving your class. Results and report cards are generated automatically.", "exams"),
        ],
    },
    # ── 8. Subject Teacher ────────────────────────────────────────────────────
    {
        "key": "subjectteacher",
        "label": "Subject Teacher",
        "intro": "The Subject Teacher enters marks for their assigned subjects. They receive notifications when a new exam is created for their subject.",
        "sections": [
            ("Dashboard", "School overview. Informational for this role.", "dashboard"),
            ("Students", "View student profiles and exam results.", "students"),
            ("Exams", "Enter marks for exams in your subjects. Grades are auto-calculated. View results and report cards.", "exams"),
        ],
    },
    # ── 9. Teacher (legacy) ────────────────────────────────────────────────────
    {
        "key": "teacher",
        "label": "Teacher (General)",
        "intro": "The general Teacher role provides broad access to students, attendance, and exams across the school.",
        "sections": [
            ("Dashboard", "School overview.", "dashboard"),
            ("Students", "View and search all student profiles.", "students"),
            ("Attendance", "Mark attendance for any class.", "attendance"),
            ("Exams", "Enter marks and view results for any exam.", "exams"),
        ],
    },
    # ── 10. Bursar ────────────────────────────────────────────────────────────
    {
        "key": "bursar",
        "label": "Bursar",
        "intro": "The Bursar manages all fee operations — structures, invoices, payments, and defaulters. They have read access to student records.",
        "sections": [
            ("Dashboard", "Fees Collected, Outstanding Fees, and the Top Defaulters list with direct WhatsApp reminder buttons.", "dashboard"),
            ("Students", "View student records and their complete fee history.", "students"),
            ("Fees", "Manage fee structures per level/quarter, generate invoices, record payments (including partial), and chase defaulters.", "fees"),
        ],
    },
]

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def img_src(role_key: str, page_key: str) -> str:
    """Return a base64 data URI for the screenshot, or a placeholder."""
    if role_key == "_login":
        path = SCREENSHOT_DIR / f"{page_key}.png"
    else:
        path = SCREENSHOT_DIR / role_key / f"{page_key}.png"

    if path.exists():
        data = base64.b64encode(path.read_bytes()).decode()
        return f"data:image/png;base64,{data}"
    return ""  # will show placeholder


def section_html(role_key: str, heading: str, body: str, screenshot_key: str) -> str:
    src = img_src(role_key, screenshot_key) if screenshot_key else ""
    img_block = ""
    if src:
        img_block = f'<figure><img src="{src}" alt="{heading}" /></figure>'
    else:
        img_block = f'<figure class="placeholder"><div class="placeholder-box">[Screenshot: {heading}]</div></figure>'

    return f"""
    <div class="section">
      <h3>{heading}</h3>
      <p>{body}</p>
      {img_block}
    </div>"""


# ---------------------------------------------------------------------------
# CSS
# ---------------------------------------------------------------------------

CSS = """
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: 'Segoe UI', Arial, sans-serif;
  font-size: 13px;
  color: #222;
  background: #fff;
  line-height: 1.6;
}
.cover {
  page-break-after: always;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background: #1B4F72;
  color: white;
  text-align: center;
  padding: 40px;
}
.cover h1 { font-size: 36px; font-weight: 700; margin-bottom: 12px; }
.cover h2 { font-size: 20px; font-weight: 300; opacity: .8; }
.cover .date { margin-top: 40px; font-size: 12px; opacity: .6; }
.cover .badge {
  display: inline-block;
  margin-top: 20px;
  background: rgba(255,255,255,.15);
  padding: 6px 18px;
  border-radius: 20px;
  font-size: 11px;
  letter-spacing: 1px;
}
.toc-page {
  page-break-after: always;
  padding: 60px 80px;
}
.toc-page h2 { font-size: 22px; color: #1B4F72; margin-bottom: 24px; }
.toc-page ol { padding-left: 20px; }
.toc-page li { padding: 4px 0; font-size: 13px; }
.role-chapter {
  page-break-before: always;
}
.role-header {
  background: #1B4F72;
  color: white;
  padding: 40px 60px;
}
.role-header h2 { font-size: 28px; font-weight: 700; }
.role-header .intro { margin-top: 12px; font-size: 14px; opacity: .85; max-width: 600px; }
.role-body { padding: 40px 60px; }
.section {
  margin-bottom: 48px;
}
.section h3 {
  font-size: 16px;
  font-weight: 600;
  color: #1B4F72;
  margin-bottom: 8px;
  padding-bottom: 6px;
  border-bottom: 2px solid #e8f0f8;
}
.section p { margin-bottom: 14px; color: #444; }
figure {
  margin: 10px 0 0 0;
  border: 1px solid #dde6f0;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0,0,0,.08);
}
figure img {
  width: 100%;
  height: auto;
  display: block;
}
.placeholder { background: #f8f9fb; }
.placeholder-box {
  text-align: center;
  padding: 60px 20px;
  color: #999;
  font-size: 12px;
  font-style: italic;
}
@media print {
  .cover { min-height: 100vh; }
  .role-chapter { page-break-before: always; }
  figure { break-inside: avoid; }
}
"""

# ---------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------

def build():
    chapters = []

    # Cover
    chapters.append(f"""
<div class="cover">
  <h1>Shule SMS</h1>
  <h2>Staff User Manual</h2>
  <div class="badge">CONFIDENTIAL — STAFF ONLY</div>
  <div class="date">Generated: {TODAY}</div>
</div>""")

    # Table of contents
    toc_items = ""
    num = 1
    for m in MANUALS:
        if m["key"] == "_login":
            continue
        toc_items += f"<li>{num}. {m['label']}</li>\n"
        num += 1

    chapters.append(f"""
<div class="toc-page">
  <h2>Table of Contents</h2>
  <ol>{toc_items}</ol>
  <br/><br/>
  <p style="font-size:12px;color:#888;">
    Password for all accounts: <strong>Demo1234!</strong> (change after first login).<br>
    Contact the System Administrator for access issues.
  </p>
</div>""")

    # Login page (shared section)
    login_manual = next(m for m in MANUALS if m["key"] == "_login")
    login_sections = "\n".join(
        section_html("_login", h, b, s) for h, b, s in login_manual["sections"]
    )
    chapters.append(f"""
<div class="role-chapter">
  <div class="role-header">
    <h2>{login_manual["label"]}</h2>
    <div class="intro">{login_manual["intro"]}</div>
  </div>
  <div class="role-body">{login_sections}</div>
</div>""")

    # Per-role chapters
    for manual in MANUALS:
        if manual["key"] == "_login":
            continue
        sections_html = "\n".join(
            section_html(manual["key"], h, b, s) for h, b, s in manual["sections"]
        )
        chapters.append(f"""
<div class="role-chapter">
  <div class="role-header">
    <h2>{manual["label"]}</h2>
    <div class="intro">{manual["intro"]}</div>
  </div>
  <div class="role-body">{sections_html}</div>
</div>""")

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Shule SMS — Staff User Manual</title>
  <style>{CSS}</style>
</head>
<body>
{"".join(chapters)}
</body>
</html>"""

    OUT_FILE.write_text(html, encoding="utf-8")
    size_kb = round(OUT_FILE.stat().st_size / 1024)
    print(f"Manual written to: {OUT_FILE}  ({size_kb} KB)")
    print("Open in Chrome/Edge and use File → Print → Save as PDF to get the PDF.")


if __name__ == "__main__":
    build()
