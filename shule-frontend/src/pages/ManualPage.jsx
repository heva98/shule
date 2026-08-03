// Serves docs/Shule_SMS_User_Manual.html (copied to public/manual.html by
// docs/build_manual.py) full-screen at /manual — the manual is its own
// standalone document with a cover page and per-role chapters, so it's
// embedded as-is rather than re-implemented as JSX.
export default function ManualPage() {
  return (
    <iframe
      src="/manual.html"
      title="Shule SMS User Manual"
      style={{ width: '100%', height: '100vh', border: 'none', display: 'block' }}
    />
  )
}
