// js/config.example.js
// ──────────────────────────────────────────────────────────
// This is a TEMPLATE. The real js/config.js is generated
// automatically at build time on Vercel from environment
// variables (see /scripts/generate-config.js + vercel.json).
//
// For local dev: run `npm run build:config` after creating a
// .env.local file (copy .env.example → .env.local and fill it in).
// That produces a real js/config.js (gitignored) you can open
// directly in the browser — no bundler needed.
// ──────────────────────────────────────────────────────────
window.APP_CONFIG = {
  SUPABASE_URL: "https://your-project-ref.supabase.co",
  SUPABASE_ANON_KEY: "your-anon-public-key-here",
  AUTHORIZED_EMAIL: "nagaraju@example.com", // the single allowed login
  GOOGLE_CALENDAR_CLIENT_ID: ""
};
