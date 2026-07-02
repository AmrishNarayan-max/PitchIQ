// /api/evaluations — serverless function (Vercel Node runtime)
//
// GET  /api/evaluations         -> latest 20 scored pitches, newest first
// POST /api/evaluations         -> insert a new scored pitch { name, snippet, score, level }
//
// Talks to Supabase's auto-generated REST API using the project's secret key.
// The secret key NEVER reaches the browser — it only lives here, as a
// Vercel environment variable, which is what makes this a real backend instead
// of just another client-side call.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

function isConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_SECRET_KEY);
}

function supabaseHeaders() {
  // Supabase's newer sb_secret_... keys authenticate via the apikey header only —
  // unlike the old service_role JWT, they should NOT also be sent as
  // "Authorization: Bearer ..." (that's reserved for JWTs and will be rejected).
  return {
    apikey: SUPABASE_SECRET_KEY,
    "Content-Type": "application/json",
  };
}

// very small sanity limits — this is a public write endpoint, keep it modest
function sanitize(body) {
  const name = String(body.name || "").slice(0, 40);
  const snippet = String(body.snippet || "").slice(0, 140);
  const score = Math.max(0, Math.min(100, Number(body.score) || 0));
  const level = ["good", "neutral", "bad"].includes(body.level) ? body.level : "neutral";
  if (!snippet) return null;
  return { name, snippet, score, level };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();

  if (!isConfigured()) {
    return res.status(503).json({
      error: "Backend not configured. Set SUPABASE_URL and SUPABASE_SECRET_KEY as Vercel environment variables.",
    });
  }

  if (req.method === "GET") {
    try {
      const url = `${SUPABASE_URL}/rest/v1/evaluations?select=name,snippet,score,level,created_at&order=created_at.desc&limit=20`;
      const r = await fetch(url, { headers: supabaseHeaders() });
      if (!r.ok) throw new Error(`Supabase GET failed: ${r.status}`);
      const rows = await r.json();
      return res.status(200).json(rows);
    } catch (err) {
      return res.status(502).json({ error: "Failed to reach database.", detail: String(err) });
    }
  }

  if (req.method === "POST") {
    const clean = sanitize(req.body || {});
    if (!clean) return res.status(400).json({ error: "Invalid payload." });

    try {
      const url = `${SUPABASE_URL}/rest/v1/evaluations`;
      const r = await fetch(url, {
        method: "POST",
        headers: { ...supabaseHeaders(), Prefer: "return=representation" },
        body: JSON.stringify(clean),
      });
      if (!r.ok) throw new Error(`Supabase POST failed: ${r.status}`);
      const [row] = await r.json();
      return res.status(201).json(row);
    } catch (err) {
      return res.status(502).json({ error: "Failed to write to database.", detail: String(err) });
    }
  }

  return res.status(405).json({ error: "Method not allowed." });
}
