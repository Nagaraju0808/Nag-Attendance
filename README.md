# Academic Dashboard — Attendance, Results & Planning

A secure, modular, single-user academic dashboard. Rebuilt from the original
2,889-line `index.html` monolith into a real project structure.

Read this top to bottom before deploying — it explains what's fully working,
what needs *your* one-time setup (Supabase project, Vercel env vars), and
one important correction to the original brief.

---

## 1. Architecture Review

**Before:** one HTML file containing markup, CSS, and all JS, with hardcoded
identity and a hardcoded Supabase key.

**After:**
```
/
├── index.html              ← thin shell: loads CSS/JS, no logic, no secrets
├── manifest.json / sw.js    ← PWA, updated for the new file paths
├── css/
│   ├── style.css            ← theme tokens, layout, sidebar, cards, auth screens
│   ├── dashboard.css        ← wizard, calendar, periods, results, insights
│   └── responsive.css       ← breakpoints
├── js/                      ← ES Modules, one responsibility each
│   ├── supabase-client.js   ← single client singleton
│   ├── auth.js              ← login/logout/session (Supabase Auth)
│   ├── profile.js           ← replaces hardcoded identity
│   ├── attendance.js        ← semesters, timetable, marking, analytics
│   ├── result-tracker.js    ← SGPA/CGPA, backlog tracker
│   ├── calendar.js          ← reminders, .ics export, Google Cal quick-add
│   ├── charts.js            ← Chart.js wrappers
│   ├── ui.js                ← toast, nav, theme, sidebar
│   ├── app.js               ← composes everything, renders the shell
│   └── config.js            ← generated, gitignored (see §3)
├── api/
│   └── supabase-proxy.js    ← Vercel serverless fn for service-role-only ops
├── sql/schema.sql           ← tables + Row Level Security policies
├── scripts/generate-config.js
├── vercel.json / package.json / .env.example / .gitignore
```

Why this split: each module can be read, tested, and changed independently.
`attendance.js` doesn't know how `result-tracker.js` renders its cards; they
only share `supabase-client.js`, `auth.js`, and `ui.js`. Adding a feature
(e.g. a study-planner page) means adding one new module + one nav item,
not editing a 2,889-line file.

---

## 2. Security Audit — and one correction to the original brief

**The brief assumed the anon key being visible in `index.html` was *the*
vulnerability. That's not quite right, and it matters for what you actually
need to do:**

> The Supabase anon key is *designed* to be public. It ships inside every
> Supabase web/mobile app there is. Putting it in an env var doesn't hide
> it from a determined user — open dev tools → Network tab, and any env
> var gets sent to the browser anyway for a static site to call Supabase
> at all. **The real vulnerability was the absence of Row Level Security.**
> Without RLS, that visible (and harmless-by-design) key was actually a
> master key to every row in every table.

What was actually fixed:

| Issue | Status | How |
|---|---|---|
| No RLS — anyone with the anon key could read/write all data | ✅ Fixed | `sql/schema.sql` — every table has `owner_id` + an `auth.uid() = owner_id` policy |
| No authentication at all | ✅ Fixed | Supabase Auth email/password gate (`js/auth.js`), enforced both client-side and by RLS |
| Public sign-up could create extra accounts | ✅ Fixed | Documented Supabase Dashboard toggle (§4) — disables signup at the platform level, not just hidden in the UI |
| Hardcoded identity (name, roll no.) in source | ✅ Fixed | `profiles` table + setup wizard (`js/profile.js`) |
| Service-role key (the *actual* secret) never existed in old app, but is needed for any future "bulk export/admin" feature | ✅ Handled | `api/supabase-proxy.js` — only place it's ever referenced, server-side only, verifies the caller's JWT before doing anything |
| Hardcoded key string visible in a public GitHub repo's history | ⚠️ Your action needed | Rotate the anon key in Supabase Dashboard → Settings → API once, after migrating, so the old committed key stops being valid even if it's in old git history |
| `js/config.js` accidentally committed in the future | ✅ Mitigated | `.gitignore` excludes it; `vercel.json` sets `Cache-Control: no-store` on it; it only ever contains the anon key + your email, nothing sensitive |

**Residual risk you should know about:** this is a static site with no
server-side session beyond what Supabase Auth provides. If someone steals
your logged-in browser's session token, they're in — same as any SPA. The
mitigations are normal ones: HTTPS only (Vercel does this by default),
short session expiry (configurable in Supabase Auth settings), and not
using this app on shared/public computers.

---

## 3. Environment & Secrets Setup — ✅ DONE for this deployment

`js/config.js` and `.env.local` are already filled in with your real
Supabase project URL, anon key, authorized email, and Google Calendar
OAuth Client ID. You can open `index.html` right now and it will connect.

**Still required, one-time, in your Google Cloud Console** (the Client ID
alone isn't enough — Google blocks unverified apps from signing in anyone
who isn't explicitly allowlisted):
1. console.cloud.google.com → your project → **APIs & Services → Library**
   → enable **"Google Calendar API"** if not already enabled.
2. **APIs & Services → OAuth consent screen → Audience** → under
   "Test users," add `nagaraju080505@gmail.com`. Without this, clicking
   "Connect Google Calendar" will show *"Access blocked: this app's
   request is invalid."*
3. **APIs & Services → Credentials** → click your OAuth Client → under
   **Authorized JavaScript origins**, add:
   - `http://localhost:PORT` (whatever port you test locally on)
   - your real Vercel domain once deployed, e.g. `https://your-app.vercel.app`

If you redeploy to Vercel, also add these as Environment Variables so
`npm run build` regenerates `js/config.js` automatically instead of you
hand-editing it:
```
VITE_SUPABASE_URL=https://nogzeebpyewftcxbnjax.supabase.co
VITE_SUPABASE_ANON_KEY=<the anon key you shared>
AUTHORIZED_EMAIL=nagaraju080505@gmail.com
GOOGLE_CALENDAR_CLIENT_ID=395053948017-tppmi7mn95bc74o2chnbvego35m505li.apps.googleusercontent.com
```

**Important:** `.env.local` and `js/config.js` are in `.gitignore`. If you
push this folder to a *public* GitHub repo, double check they're not
accidentally included (`git status` before your first commit) — the anon
key itself is safe to expose, but no reason to make rotating it harder
later if you ever go public with the repo.

---

## 4. Database Setup (Supabase)

1. Supabase Dashboard → SQL Editor → paste all of `sql/schema.sql` → Run.
2. **Disable public signups** (this is the real single-user enforcement,
   not just hiding a button): Authentication → Providers → Email →
   turn OFF "Allow new users to sign up."
3. Create your one account manually: Authentication → Users → Add User →
   your email + a strong password.
4. Set `AUTHORIZED_EMAIL` in your env vars to that exact email — it's a
   second, client-side check on top of RLS.

---

## 5. Authentication

- Supabase Auth, email + password, session persisted in `localStorage`
  by the Supabase SDK (`persistSession: true`), auto-refreshed.
- No registration form exists anywhere in the UI.
- `js/auth.js` additionally rejects login attempts for any email other
  than `APP_CONFIG.AUTHORIZED_EMAIL` *before* even calling Supabase —
  cosmetic, but avoids leaking "wrong password" vs "no such account."
- Logging out calls `supabase.auth.signOut()` and reloads the page.

---

## 6. Google Calendar Integration — now wired for real

**Fully working, with your Client ID already in `js/config.js`:**
- A **"🔗 Connect Google Calendar"** button on the Calendar page (uses
  Google Identity Services' client-side token flow — `js/calendar.js`).
  No client secret needed; the access token lives only in that browser
  tab's `sessionStorage` for the session.
- Once connected, **"⬆️ Sync All Reminders to Google Calendar"** pushes
  every reminder into your real Google Calendar as an actual event via
  the Calendar API (`POST /calendars/primary/events`).
- "+ Google Cal" quick-add links and ".ics" export still work with zero
  auth, as a fallback.
- ⚠️ **One Google Cloud Console step is required before the Connect
  button will work** — see §3 above (adding yourself as a test user).
  Skip it and Google will show "Access blocked."

**What this does NOT do (and why):** automatic *pull* of events you add
directly in Google Calendar back into this app. That's a second, separate
API call (`GET /calendars/primary/events`) plus a background poll/webhook
— doable, but I held off adding it until you confirm the push direction
works for you first (it's the more commonly wanted direction for class/
assignment reminders). Say the word and I'll add the pull side too.

---

## 7. Semester Result Tracker — what's real vs. what needs more work

**Fully working:** manual entry grid with live SGPA preview, "paste text"
smart-fill (paste the copied text from your marks-memo PDF and it detects
`Subject ... Credits ... Grade` lines automatically), CGPA roll-up,
SGPA trend chart, backlog/supply tracker with CGPA-impact projection, all
persisted to Supabase.

**Honest limitation:** true OCR of an uploaded *image/scanned PDF* (not
just pasted text) needs either a server-side OCR service or a vision-model
API call — that's a real backend dependency, not something a static site
can do for free. The "paste text" flow covers the common case (most PDFs
let you select/copy text) without needing that infrastructure.

---

## 8. Performance

- No framework/bundler overhead — plain ES modules, loaded once.
- Chart.js and Supabase JS loaded from CDN with browser caching.
- Service worker caches all static assets (`sw.js`), excludes `config.js`
  and Supabase API calls from the cache so data is never stale.
- Single shared Supabase client (no duplicate connections per module).
- Module code only renders what's visible (event-driven nav, no heavy
  framework re-render cycles).

To verify: deploy, then run Lighthouse in Chrome DevTools. The biggest
remaining lever for score is converting the Google Fonts `<link>` to
`font-display: swap` (already default in the Google Fonts URL used) and
self-hosting Chart.js if you want to shave the CDN round-trip.

---

## 9. Deployment (Vercel)

```bash
git init
git add .
git commit -m "Modular academic dashboard"
git remote add origin <your-repo-url>
git push -u origin main
```
Then in Vercel: **New Project → Import this repo** → it auto-detects
`vercel.json` and runs `npm run build` → deploys. Add the environment
variables from §3 *before* the first deploy (or redeploy after adding them).

---

## 10. Final Testing Checklist

- [ ] `sql/schema.sql` run successfully in Supabase SQL editor
- [ ] "Allow new signups" turned OFF in Supabase Auth settings
- [ ] One user created manually, matches `AUTHORIZED_EMAIL`
- [ ] `.env.local` filled, `npm run build:config` produces a real `js/config.js`
- [ ] Can log in with the one account; a second/wrong email is rejected
- [ ] First login shows the profile setup wizard; saving it persists and shows on reload
- [ ] Semester wizard / settings creates a semester + subjects + timetable
- [ ] Mark Attendance saves and reflects instantly in Dashboard %s
- [ ] Holiday marking excludes that day from percentages
- [ ] Analytics charts render (bar + trend) once some records exist
- [ ] Result Tracker: add a semester manually → SGPA preview updates live → saves → CGPA updates
- [ ] Paste-text parser correctly detects rows from a copied PDF excerpt
- [ ] Backlog tracker shows projected CGPA change
- [ ] Add a reminder → "+ Google Cal" link opens prefilled event → ".ics" download opens in a calendar app
- [ ] Click "Connect Google Calendar" → Google consent popup appears (if "Access blocked," add your email as a test user — §3) → after approving, status shows "🟢 Connected"
- [ ] Click "Sync All Reminders to Google Calendar" → events appear in your actual Google Calendar within a few seconds
- [ ] Notification permission prompt appears and a same-day reminder fires a browser notification
- [ ] Logout clears the session; reload shows the login screen again
- [ ] On Vercel: deployed URL loads with no console errors, `js/config.js` returns real (not placeholder) values
- [ ] Confirm in Supabase Table Editor that `rowsecurity` is `true` on every table

---

## What I did *not* fully build, and why

- **Pulling events *from* Google Calendar back into this app** — push
  (this app → Google) is implemented; pull is a follow-up if you want it.
- **Image/scanned-PDF OCR for results** — needs a paid OCR/vision backend.
  Replaced with a working paste-text parser that covers most real PDFs.
- **A full second backend "API layer" for every single CRUD operation** —
  not how Supabase is meant to be used. The brief's intent (don't let the
  browser do whatever it wants) is achieved by RLS, which is the
  Supabase-native way to do this; `api/supabase-proxy.js` exists for the
  genuinely sensitive operations that need to bypass RLS deliberately
  (bulk export, hard wipe).

If you want the Google Calendar pull direction added, or you hit the
"Access blocked" screen and want help debugging the OAuth consent screen
config, come back and I'll finish it.
