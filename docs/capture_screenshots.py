"""
Shule SMS — Automated screenshot capture for user manuals.
Requires:
  - Django server running on http://localhost:8000
  - Vite dev server running on http://localhost:5173
  - playwright installed: pip install playwright && playwright install chromium
Run:
  python docs/capture_screenshots.py
"""

import asyncio
import os
import sys
from pathlib import Path

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

BASE_URL = "http://localhost:5173"
OUT_DIR  = Path(__file__).parent / "screenshots"
OUT_DIR.mkdir(exist_ok=True)

PASSWORD = "Demo1234!"

ROLES = [
    {
        "key":   "owner",
        "email": "owner@shule.tz",
        "label": "Owner / Director",
        "pages": [
            ("dashboard",      "/dashboard",             "Dashboard"),
            ("students",       "/students",              "Students List"),
            ("fees",           "/fees",                  "Fees Overview"),
            ("fees_invoices",  "/fees",                  "Fees — Invoices Tab"),
            ("attendance",     "/attendance",            "Attendance"),
            ("exams",          "/exams",                 "Exams"),
            ("staff",          "/staff",                 "Staff"),
            ("communications", "/communications",        "Communications"),
            ("admin_dash",     "/admin-panel",           "Admin Dashboard"),
            ("admin_users",    "/admin-panel/users",     "User Management"),
            ("admin_settings", "/admin-panel/settings",  "School Settings"),
            ("admin_health",   "/admin-panel/system-health", "System Health"),
        ],
    },
    {
        "key":   "sysadmin",
        "email": "sysadmin@shule.tz",
        "label": "System Administrator",
        "pages": [
            ("admin_dash",      "/admin-panel",                   "System Dashboard"),
            ("admin_users",     "/admin-panel/users",             "User Management"),
            ("admin_roles",     "/admin-panel/roles",             "Role Assignment"),
            ("admin_subjects",  "/admin-panel/subjects",          "Subjects & Classes"),
            ("admin_years",     "/admin-panel/academic-years",    "Academic Year Setup"),
            ("admin_settings",  "/admin-panel/settings",          "School Settings"),
            ("admin_audit",     "/admin-panel/audit-logs",        "Audit Logs"),
            ("admin_health",    "/admin-panel/system-health",     "System Health"),
        ],
    },
    {
        "key":   "headteacher",
        "email": "headteacher@shule.tz",
        "label": "Headteacher",
        "pages": [
            ("dashboard",      "/dashboard",      "Dashboard"),
            ("students",       "/students",       "Students List"),
            ("fees",           "/fees",           "Fees"),
            ("attendance",     "/attendance",     "Attendance"),
            ("exams",          "/exams",          "Exams"),
            ("staff",          "/staff",          "Staff"),
            ("communications", "/communications", "Communications"),
        ],
    },
    {
        "key":   "academic",
        "email": "academic@shule.tz",
        "label": "Academic Teacher",
        "pages": [
            ("dashboard",      "/dashboard",      "Dashboard"),
            ("students",       "/students",       "Students"),
            ("attendance",     "/attendance",     "Attendance"),
            ("exams",          "/exams",          "Exams"),
            ("staff",          "/staff",          "Staff"),
            ("communications", "/communications", "Communications"),
        ],
    },
    {
        "key":   "discipline",
        "email": "discipline@shule.tz",
        "label": "Discipline Teacher",
        "pages": [
            ("dashboard",  "/dashboard",  "Dashboard"),
            ("students",   "/students",   "Students"),
            ("attendance", "/attendance", "Attendance"),
        ],
    },
    {
        "key":   "classteacher",
        "email": "classteacher@shule.tz",
        "label": "Class Teacher",
        "pages": [
            ("dashboard",  "/dashboard",  "Dashboard"),
            ("students",   "/students",   "Students"),
            ("attendance", "/attendance", "Attendance"),
            ("exams",      "/exams",      "Exams"),
        ],
    },
    {
        "key":   "subjectteacher",
        "email": "subjectteacher@shule.tz",
        "label": "Subject Teacher",
        "pages": [
            ("dashboard", "/dashboard", "Dashboard"),
            ("students",  "/students",  "Students"),
            ("exams",     "/exams",     "Exams"),
        ],
    },
    {
        "key":   "teacher",
        "email": "teacher@shule.tz",
        "label": "Teacher",
        "pages": [
            ("dashboard",  "/dashboard",  "Dashboard"),
            ("students",   "/students",   "Students"),
            ("attendance", "/attendance", "Attendance"),
            ("exams",      "/exams",      "Exams"),
        ],
    },
    {
        "key":   "bursar",
        "email": "bursar@shule.tz",
        "label": "Bursar",
        "pages": [
            ("dashboard",          "/dashboard", "Dashboard"),
            ("students",           "/students",  "Students"),
            ("fees",               "/fees",      "Fees Overview"),
        ],
    },
]

# ---------------------------------------------------------------------------
# Screenshot helpers
# ---------------------------------------------------------------------------

async def login(page, email: str, password: str):
    await page.goto(f"{BASE_URL}/login", wait_until="networkidle")
    await page.fill('input[type="email"]', email)
    await page.fill('input[type="password"]', password)
    await page.click('button[type="submit"]')
    await page.wait_for_load_state("networkidle")
    await page.wait_for_timeout(1500)


async def screenshot_page(page, url: str, path: Path, label: str):
    print(f"    → {label}")
    await page.goto(f"{BASE_URL}{url}", wait_until="networkidle")
    await page.wait_for_timeout(1800)  # let charts and queries settle
    # Expand to full page height
    await page.screenshot(path=str(path), full_page=True)


async def capture_role(browser, role: dict):
    role_dir = OUT_DIR / role["key"]
    role_dir.mkdir(exist_ok=True)

    context = await browser.new_context(viewport={"width": 1440, "height": 900})
    page    = await context.new_page()

    print(f"\n  [{role['label']}]  {role['email']}")
    try:
        await login(page, role["email"], PASSWORD)

        # Capture login page itself (before navigating away)
        login_path = OUT_DIR / "login.png"
        if not login_path.exists():
            await page.goto(f"{BASE_URL}/login", wait_until="networkidle")
            await page.wait_for_timeout(800)
            await page.screenshot(path=str(login_path), full_page=True)
            await login(page, role["email"], PASSWORD)

        for page_key, path, label in role["pages"]:
            out_path = role_dir / f"{page_key}.png"
            await screenshot_page(page, path, out_path, label)

    except Exception as exc:
        print(f"    !! ERROR: {exc}")
    finally:
        await context.close()


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

async def main():
    from playwright.async_api import async_playwright

    print("Starting screenshot capture…")
    print(f"Output directory: {OUT_DIR}")
    print(f"Target URL: {BASE_URL}\n")

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        for role in ROLES:
            await capture_role(browser, role)
        await browser.close()

    print("\nDone! Screenshots saved to:", OUT_DIR)
    print("Now run:  python docs/build_manual.py")


if __name__ == "__main__":
    asyncio.run(main())
