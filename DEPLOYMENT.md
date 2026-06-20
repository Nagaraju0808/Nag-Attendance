# Deployment Guide — Updating Your Existing Setup

You already have a GitHub repo (`github.com/Nagaraju0808/Nag-Attendance`)
and a Supabase database with real attendance records in it. This guide
is written for **that** situation — updating in place, not starting
fresh. Follow it top to bottom.

---

## PART 1 — Update your GitHub repo (no command line needed)

The easiest way when you already have a repo, with zero risk of git
commands going wrong:

1. Unzip `nagaraju-dashboard.zip` on your computer.
2. Open `github.com/Nagaraju0808/Nag-Attendance` in your browser.
3. Click **Add file** (top right, near the green "Code" button) →
   **Upload files**.
4. Open your unzipped folder, select **everything inside it** (all files
   and folders: `index.html`, `css/`, `js/`, `api/`, `sql/`, `manifest.json`,
   `sw.js`, `package.json`, `vercel.json`, `README.md`, `DEPLOYMENT.md`,
   `.gitignore`, `.env.example`) — **except** `.env.local` and
   `js/config.js`, which you should leave on your computer and not
   upload (see the note below on why).
5. Drag all of that into the GitHub upload box, or use "choose your
   files." Scroll down, write a commit message like "Modular rewrite v2,"
   click **Commit changes**.
6. GitHub will overwrite any file with the same name (like `index.html`)
   and add the new ones. The old `sem-result-tracker.html` file will
   still sit there unused — you can delete it from the repo later
   (open it on GitHub → trash icon → commit), it's harmless either way
   since the result tracker now lives inside the main app.

**Why skip `.env.local` and `js/config.js`:** they contain your real
Supabase key and email. They're not dangerous if uploaded, but there's
no reason to put them in a place you don't need to (Vercel gets these
values from its own Environment Variables settings instead — see Part 4).

*(If you're comfortable with git command-line instead, that works too —
`git add .`, `git commit -m "v2"`, `git push` from inside the folder,
just check `git status` first like before.)*

---

## PART 2 — Update Supabase WITHOUT touching your existing records

This is the step that needs the most care, because you have real data.
Read this whole section before clicking anything.

**What's about to happen, in one sentence:** we're adding a security
label to your existing rows (saying "this row belongs to you") and then
turning on a lock that only opens for rows with your label — nothing
gets deleted, moved, or changed in content.

1. Open your Supabase project → **Authentication** → **Users**.
2. Check: does a user with email `nagaraju080505@gmail.com` already
   exist there?
   - **If yes** — good, skip to step 4.
   - **If no** — click **Add User** → **Create new user** → enter that
     email and a password you'll remember → **Create User**.
3. Authentication → **Providers** → **Email** → turn **OFF** "Allow new
   users to sign up" → Save. (This stops anyone else from ever creating
   a second account.)
4. Left sidebar → **SQL Editor** → **New Query**.
5. Open `sql/migrate-existing-data.sql` from your unzipped folder (not
   `schema.sql` — that one's only for empty databases and would lock you
   out without fixing anything, since it doesn't know about your
   existing rows).
6. Copy all of its contents, paste into the SQL Editor.
7. Read the comment block at the top once if you want the plain-English
   explanation of each step — it's written for exactly this situation.
8. Click **Run**.
9. You should see "Success. No rows returned." If you see a red error
   instead, **nothing was changed** (the whole script is wrapped in a
   transaction that undoes itself completely on any failure) — copy the
   error text and send it to me before trying anything else.
10. Double-check your data is intact: in the SQL editor, run:
    ```sql
    select count(*) from attendance_records;
    ```
    Compare that number to what you'd expect. If it looks right, you're done.

---

## PART 3 — Google Cloud setup (for the Calendar feature)

Same as before — skip if you don't need Calendar sync yet.

1. console.cloud.google.com, logged in as `nagaraju080505@gmail.com`.
2. Select the project matching Client ID `395053948017-...` (check
   **APIs & Services → Credentials** if unsure which project).
3. **APIs & Services → Library** → search "Google Calendar API" → **Enable**.
4. **APIs & Services → OAuth consent screen → Audience** → **Test users**
   → **+ Add Users** → `nagaraju080505@gmail.com` → Save.
5. **APIs & Services → Credentials** → click your OAuth Client →
   **Authorized JavaScript origins** → add `http://localhost:3000` for now.
   (You'll add your live Vercel URL here too, right after Part 4.)

---

## PART 4 — Deploy to Vercel

1. vercel.com → log in with GitHub.
2. **Add New... → Project** → find `Nag-Attendance` → **Import**.
3. Before clicking Deploy, scroll to **Environment Variables**, add:

   | Name | Value |
   |---|---|
   | `VITE_SUPABASE_URL` | `https://nogzeebpyewftcxbnjax.supabase.co` |
   | `VITE_SUPABASE_ANON_KEY` | *(the long key you shared earlier)* |
   | `AUTHORIZED_EMAIL` | `nagaraju080505@gmail.com` |
   | `GOOGLE_CALENDAR_CLIENT_ID` | `395053948017-tppmi7mn95bc74o2chnbvego35m505li.apps.googleusercontent.com` |

4. Click **Deploy**. Wait ~30-60 seconds.
5. You'll get a live URL like `https://nag-attendance.vercel.app`. Open it.
6. Go back to Google Cloud Console (Part 3, step 5) and add this real
   URL to Authorized JavaScript origins too.

**Already had a Vercel project from before, pointing at the same repo?**
Vercel auto-redeploys on every push to GitHub — so once Part 1's upload
lands, it may have already started a new deployment automatically. Check
your Vercel dashboard; if a deployment is sitting there, just make sure
the 4 environment variables above are set (Project → Settings →
Environment Variables), then click **Redeploy** to be sure it picks them up.

---

## PART 5 — First login after the update

1. Open the live URL, log in with `nagaraju080505@gmail.com` + the
   password from Part 2.
2. Because this is the *first* login under the new system, you'll see
   the **Profile Setup** screen once — fill in your name/roll/branch/etc.
   This does not touch your attendance data; it's a separate new table.
3. Go to **Dashboard** — your existing attendance percentages, subjects,
   and history should all be exactly as they were before.
4. If Dashboard looks empty instead of showing your old data, **don't
   panic and don't delete anything** — it almost always means the
   migration script's email didn't exactly match your login email, or
   the active semester's `status` wasn't `'active'`. Tell me what you
   see and I'll help you check it; your rows are still in the database
   either way (the migration script never deletes anything).

---

## Troubleshooting

| What you see | Likely cause | Fix |
|---|---|---|
| Dashboard shows 0% / no subjects after logging in, but you know you have data | The semester that has your data isn't marked `status = 'active'`, or migration ran with a slightly different email | Run `select id, name, status from semesters;` in SQL Editor and tell me what it shows |
| Migration script errors with "No Supabase Auth user found" | You ran Part 2 step 5 before step 2 | Go back, create the user first, then re-run the migration script |
| "Access blocked" on Google Calendar connect | Email not added as test user | Part 3, step 4 |
| Vercel deploy succeeds but page is blank | Wrong/missing environment variables | Re-check Part 4, step 3 for typos |

If anything looks off after the migration, stop and tell me exactly what
you see (a screenshot of the Dashboard, or the output of `select count(*)
from attendance_records;`) before doing anything else — your data is safe
in the database regardless of what the app displays, so there's no rush
and no risk in pausing to double check.
