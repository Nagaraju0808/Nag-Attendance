// api/supabase-proxy.js
// Vercel Serverless Function.
// This is the ONLY place SUPABASE_SERVICE_ROLE_KEY is ever used.
// It bypasses RLS, so every action here must independently verify
// the caller is the authorized owner via their Supabase JWT.
//
// Use this for operations the anon key + RLS genuinely cannot do
// safely from the browser, e.g.:
//   - full account data export across all tables in one call
//   - irreversible "wipe everything" with extra server-side checks
//   - server-side semester-end archival jobs
//
// Everyday reads/writes (attendance, results, profile) should go
// straight from the browser to Supabase using the anon key — that
// is the supported pattern and is what /js/*.js does.

const { createClient } = require('@supabase/supabase-js');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*'); // tighten to your domain in production
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const authHeader = req.headers.authorization || '';
  const jwt = authHeader.replace('Bearer ', '');
  if (!jwt) return res.status(401).json({ error: 'Missing auth token' });

  const url = process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !serviceKey) {
    return res.status(500).json({ error: 'Server misconfigured: missing Supabase keys' });
  }

  // 1. Verify the JWT belongs to a real, currently-logged-in user
  const authClient = createClient(url, anonKey);
  const { data: userData, error: userErr } = await authClient.auth.getUser(jwt);
  if (userErr || !userData?.user) {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }

  // 2. Enforce single-owner restriction — belt-and-suspenders on top of RLS
  const authorizedEmail = process.env.AUTHORIZED_EMAIL;
  if (authorizedEmail && userData.user.email !== authorizedEmail) {
    return res.status(403).json({ error: 'Not authorized' });
  }

  const ownerId = userData.user.id;
  const admin = createClient(url, serviceKey);
  const { action } = req.body || {};

  try {
    if (action === 'full-export') {
      const tables = ['profiles', 'semesters', 'semester_subjects', 'semester_timetable',
                       'attendance_records', 'subject_initial', 'result_semesters',
                       'backlog_items', 'reminders'];
      const out = {};
      for (const t of tables) {
        const filterCol = t === 'profiles' ? 'id' : 'owner_id';
        const { data, error } = await admin.from(t).select('*').eq(filterCol, ownerId);
        if (error) throw error;
        out[t] = data;
      }
      return res.status(200).json({ exportedAt: new Date().toISOString(), data: out });
    }

    if (action === 'wipe-all') {
      const tables = ['attendance_records', 'subject_initial', 'semester_timetable',
                       'semester_subjects', 'semesters', 'result_semesters',
                       'backlog_items', 'reminders'];
      for (const t of tables) {
        const { error } = await admin.from(t).delete().eq('owner_id', ownerId);
        if (error) throw error;
      }
      return res.status(200).json({ wiped: true });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
