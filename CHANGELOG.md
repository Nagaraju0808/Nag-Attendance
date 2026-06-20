# Upgrade Changelog — Feature Gap Analysis & Roadmap Implementation

Mapped directly to the priority tiers in your audit document. Everything
in 🔴 Critical and 🟠 High is fully built and wired up. 🟡 Medium is fully
built except where noted. 🟢 Future is intentionally left for later, since
the audit itself labels it lowest priority — implementing it now in the
same pass would've meant rushing the things that actually matter first.

---

## 🔴 Critical — all done

| Feature | Status | Where |
|---|---|---|
| Semester Setup Wizard (4-step: info → subjects → timetable → confirm) | ✅ Done | `js/wizard.js` — calls the existing `createSemester()` directly, no duplicate logic |
| Semester Management (active dashboard, days remaining, status, end-semester, archive) | ✅ Done | `Attendance.renderSemesterManagement()`, `openEndSemModal()` → calls existing `archiveActiveSemester()` |
| Subject Management (add/edit/delete, credits, attendance init) | ✅ Done | New "Subjects" page in sidebar, `Attendance.addOrUpdateSubject()` / `deleteSubject()` |
| Timetable Builder (add/remove periods, day-wise, validation) | ✅ Done | Step 3 of the wizard (`js/wizard.js`) — validates at least one entry before confirming |

## 🟠 High — all done

| Feature | Status | Where |
|---|---|---|
| Planning Insights (safe bunk calc, 75% prediction, required dates, projection) | ✅ Done | `Attendance.renderPlanningInsights()` — now shown on Dashboard |
| Holiday Management (modal instead of prompt, list, edit, delete) | ✅ Done | `#holiday-modal`, `Attendance.renderHolidayManagement()` in Settings |
| Attendance Calendar (monthly heatmap, day detail, navigation) | ✅ Done | New "Attendance Calendar" sidebar page, `Attendance.renderCalendar()` |
| Attendance Alerts (banners + browser notifications, subject-level) | ✅ Done | `renderAlertBanners()` on Dashboard, `checkAndNotifyLowAttendance()` on login |
| Undo Attendance (daily reset, confirm modal, per-period undo) | ✅ Done | Undo strip + confirm on Mark Attendance page, ↩ button per period row |
| Initial Attendance Editor (mid-semester onboarding) | ✅ Done | "Initial Attendance" card in Settings |

## 🟡 Medium — done, one partial

| Feature | Status | Where |
|---|---|---|
| Attendance Streak Tracker | ✅ Done | Dashboard, `renderStreak()` |
| Weekly Goal Progress Ring | ✅ Done | Dashboard, `renderWeeklyGoal()` |
| Recent Activity Feed | ✅ Done | Dashboard, `renderRecentActivity()` |
| Semester Archive History | ✅ Done | History → Archive tab, `renderArchive()` |
| Settings Danger Zone (export, clear) | ✅ Done | Settings → Danger Zone |
| Backup Restore | 🟡 Partial | Export (CSV) works; full JSON restore wasn't added this round — tell me if you want it and I'll add an "Import backup" button next to Export |
| Already-Marked Indicator | ✅ Done | Banner on Mark Attendance when a day already has records |
| Advanced Theme Selector (Light/Dark/System) | ✅ Done | Settings → Appearance, reacts live to OS theme changes |

## 🟢 Future — documented, not built this round

These are explicitly the lowest-priority tier in your own audit, so I
held off building them now rather than rushing them at the expense of
the tiers above:

- **Granular notification controls** — partially started (a "Low
  Attendance Alerts" toggle now exists in Settings); finer controls
  (per-subject thresholds, quiet hours, etc.) not built.
- **Accessibility (ARIA labels, full keyboard navigation, screen reader
  support)** — not yet audited or added. This is real, non-trivial work
  (every interactive element needs review), worth its own focused pass.
- **Dead code / unused CSS cleanup** — turned out to be moot: every
  class your audit listed as "dead" (`.streak-*`, `.weekly-goal-card`,
  `.archive-sem-*`, `.holiday-mgmt-*`, `#undo-day-strip`,
  `#undo-day-confirm`, `#sem-expiry-banner`) is now actively wired up by
  the High/Medium features above, so there's nothing left to remove.

---

## Files touched this round

- **New:** `js/wizard.js` (Semester Setup Wizard)
- **Heavily extended:** `js/attendance.js` (+~590 lines: subject mgmt,
  semester mgmt, planning insights, holiday modal, calendar, alerts,
  undo, streak, weekly goal, activity feed, archive, danger zone)
- **Extended:** `js/app.js` (new pages, modals, wiring), `js/ui.js`
  (3-way theme system), `css/dashboard.css` (theme selector states),
  `sw.js` (cache version bump + new file)
- **Untouched, preserved exactly as-is:** `js/auth.js`, `js/profile.js`,
  `js/result-tracker.js`, `js/calendar.js`, `js/charts.js`,
  `js/supabase-client.js`, `sql/*` — nothing in Authentication, Result
  Tracker, Backlog Tracker, Google Calendar integration, or the database
  schema was touched, exactly as the audit's "must preserve" list required.

## Testing checklist for this round

- [ ] Settings → "+ New Semester" opens the 4-step wizard end to end
- [ ] Wizard's "Load Template"-equivalent (Subjects step, Add Subject)
      lets you build a subject list, Timetable step assigns periods,
      Confirm step creates the semester and refreshes the dashboard
- [ ] Subjects page: add a subject, edit it, delete it — list updates
- [ ] Settings → Semester Management shows days remaining and an
      "Archive This Semester" button that works
- [ ] Mark Attendance: holiday button opens a modal (not a browser
      prompt), holiday shows in Settings → Holiday Management with a
      working Remove button
- [ ] Mark Attendance: each period row has a ↩ undo button; the day-level
      undo strip appears once something's saved
- [ ] Dashboard shows Planning Insights, Streak, Weekly Goal ring, Recent
      Activity, and a low-attendance banner if any subject is under 75%
- [ ] Attendance Calendar page shows a colored heatmap for the current
      month and a day-detail card when you click a day
- [ ] Settings → Appearance: Dark/Light/System all switch correctly,
      System follows your OS setting live
- [ ] Settings → Danger Zone: Export downloads a CSV; Clear History asks
      for confirmation twice before deleting
