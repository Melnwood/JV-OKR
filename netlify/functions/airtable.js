// Secure Airtable proxy with Google sign-in + role enforcement.
// The Airtable token never reaches the browser, and permissions are decided HERE,
// not in the UI — hiding a tab in the browser is decoration, not security.
//
// Env vars required in Netlify (scope: Functions):
//   AIRTABLE_TOKEN     pat...
//   AIRTABLE_BASE      app70cjJzoUHQZtHA
//   GOOGLE_CLIENT_ID   ....apps.googleusercontent.com
//   ALLOWED_DOMAIN     josiahventure.com    (optional, recommended)

const BASE = process.env.AIRTABLE_BASE;
const TOKEN = process.env.AIRTABLE_TOKEN;
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const DOMAIN = process.env.ALLOWED_DOMAIN || "";

const HEAD = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
  "Content-Type": "application/json"
};
const ok  = (b) => ({ statusCode: 200, headers: HEAD, body: JSON.stringify(b) });
const bad = (c, m) => ({ statusCode: c, headers: HEAD, body: JSON.stringify({ error: m }) });

async function air(path, opts = {}) {
  const r = await fetch(`https://api.airtable.com/v0/${BASE}/${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json", ...(opts.headers || {}) }
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error?.message || JSON.stringify(j));
  return j;
}
const chunk = (a, n) => a.reduce((s, x, i) => (i % n ? s[s.length - 1].push(x) : s.push([x]), s), []);

const readAll = async (table) => {
  let records = [], offset;
  do {
    const j = await air(`${encodeURIComponent(table)}?pageSize=100${offset ? `&offset=${offset}` : ""}`);
    records = records.concat(j.records);
    offset = j.offset;
  } while (offset);
  return records;
};

/* ---------------------------------------------------------------- */
/* WHO IS THIS?                                                      */
/* ---------------------------------------------------------------- */
// Verify the Google ID token with Google, then match the email to a row in
// People. Signed in with Google but not in People = no access.
async function whoami(event) {
  const h = event.headers || {};
  const idToken = (h.authorization || h.Authorization || "").replace(/^Bearer\s+/i, "");
  if (!idToken) throw Object.assign(new Error("Not signed in."), { code: 401 });

  const r = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
  const g = await r.json();
  if (!r.ok) throw Object.assign(new Error("Sign-in expired — reload and sign in again."), { code: 401 });
  if (g.aud !== CLIENT_ID) throw Object.assign(new Error("That token wasn't issued for this app."), { code: 401 });
  if (String(g.email_verified) !== "true") throw Object.assign(new Error("Google hasn't verified that email."), { code: 401 });
  if (DOMAIN && g.hd !== DOMAIN) throw Object.assign(new Error(`Please sign in with your ${DOMAIN} account.`), { code: 403 });

  const email = String(g.email || "").toLowerCase();
  const people = await readAll("People");
  const me = people.find(p => String(p.fields.Email || "").toLowerCase() === email);
  if (!me) throw Object.assign(new Error(`${email} isn't in the People table. Ask Mike or Mel to add you.`), { code: 403 });

  return { id: me.id, email, name: me.fields.Name || g.name || email,
           role: me.fields.Role || "Staff", area: me.fields.Area || "" };
}

/* ---------------------------------------------------------------- */
/* WHAT MAY THEY DO?                                                 */
/* ---------------------------------------------------------------- */
const COACH  = ["OKR Director", "Executive"];                 // Mike + Mel
const LEADER = ["Country leader", "Division leader", ...COACH];
const isCoach  = u => COACH.includes(u.role);
const isLeader = u => LEADER.includes(u.role);

const COACH_ONLY   = ["Resources"];                                   // library: Mike + Mel only
const LEADER_WRITE = ["Objectives", "Key Results", "Decisions", "Cycles", "People"];
const NO_DELETE    = ["Check-ins", "Decisions"];                      // the record stands

// A leader sees a coaching note ONLY if it was explicitly shared with them.
function filterForUser(u, table, records) {
  if (table !== "Coaching Notes") return records;
  if (isCoach(u)) return records;
  return records.filter(r =>
    r.fields["Shared with leader"] === true && (r.fields.Leader || []).includes(u.id));
}

function canWrite(u, table, method) {
  if (table === "Coaching Notes" || COACH_ONLY.includes(table)) return isCoach(u);
  if (method === "DELETE" && NO_DELETE.includes(table)) return false;
  if (LEADER_WRITE.includes(table)) return isLeader(u);
  return true;   // Tasks, Check-ins, Reviews, Review Responses — everyone
}

// Stamp writes with who did it, server-side. The browser can't lie about this.
function stamp(table, records, u) {
  const field = { "Check-ins": "Person", "Tasks": "Created by", "Review Responses": "Person",
                  "Decisions": "Recorded by", "Coaching Notes": "Author" }[table];
  if (!field) return records;
  return records.map(r => ({ ...r, fields: { ...r.fields, [field]: [u.id] } }));
}

/* ---------------------------------------------------------------- */
exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: HEAD, body: "" };
  const q = event.queryStringParameters || {};

  // Public — the browser needs this to draw the Google button.
  if (q.action === "config") return ok({ googleClientId: CLIENT_ID || null, domain: DOMAIN || null });

  if (q.action === "diag") return ok({
    node: process.version,
    AIRTABLE_BASE:    BASE      ? `set (${BASE})` : "MISSING",
    AIRTABLE_TOKEN:   TOKEN     ? `set (${TOKEN.length} chars, starts "${TOKEN.slice(0,3)}")` : "MISSING",
    GOOGLE_CLIENT_ID: CLIENT_ID ? `set (${CLIENT_ID.slice(0,14)}…)` : "MISSING",
    ALLOWED_DOMAIN:   DOMAIN || "(not set — any Google account listed in People can sign in)"
  });

  if (!BASE || !TOKEN)  return bad(500, "AIRTABLE_BASE / AIRTABLE_TOKEN not configured");
  if (!CLIENT_ID)       return bad(500, "GOOGLE_CLIENT_ID not configured");

  let me;
  try { me = await whoami(event); }
  catch (e) { return bad(e.code || 401, e.message); }

  if (q.action === "me") return ok({ me });

  const table = q.table;
  const body = event.body ? JSON.parse(event.body) : {};

  try {
    if (q.action === "upload") {
      if (!isCoach(me)) return bad(403, "Only Mike and Mel can upload coaching files.");
      const { recordId, fieldId, filename, contentType, base64 } = body;
      const r = await fetch(`https://content.airtable.com/v0/${BASE}/${recordId}/${fieldId}/uploadAttachment`, {
        method: "POST",
        headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({ contentType, file: base64, filename })
      });
      const j = await r.json();
      if (!r.ok) return bad(r.status, j?.error?.message || "upload failed");
      return ok(j);
    }

    if (!table) return bad(400, "table required");
    const enc = encodeURIComponent(table);

    if (event.httpMethod === "GET") {
      if (COACH_ONLY.includes(table) && !isCoach(me)) return bad(403, "Not yours to see.");
      return ok({ records: filterForUser(me, table, await readAll(table)) });
    }

    if (!canWrite(me, table, event.httpMethod)) {
      if (NO_DELETE.includes(table) && event.httpMethod === "DELETE")
        return bad(403, `${table} are the record — they can't be deleted, only added to.`);
      return bad(403, `Your role (${me.role}) can't change ${table}.`);
    }

    if (event.httpMethod === "POST") {
      const out = [];
      for (const c of chunk(stamp(table, body.records || [], me), 10)) {
        const j = await air(enc, { method: "POST", body: JSON.stringify({ records: c, typecast: true }) });
        out.push(...j.records);
      }
      return ok({ records: out });
    }

    if (event.httpMethod === "PATCH") {
      const out = [];
      for (const c of chunk(body.records || [], 10)) {
        const j = await air(enc, { method: "PATCH", body: JSON.stringify({ records: c, typecast: true }) });
        out.push(...j.records);
      }
      return ok({ records: out });
    }

    if (event.httpMethod === "DELETE") {
      const ids = (q.ids || "").split(",").filter(Boolean);
      if (!ids.length) return bad(400, "ids required");
      const out = [];
      for (const c of chunk(ids, 10)) {
        const j = await air(`${enc}?${c.map(i => `records[]=${i}`).join("&")}`, { method: "DELETE" });
        out.push(...j.records);
      }
      return ok({ records: out });
    }

    return bad(405, "method not allowed");
  } catch (e) {
    return bad(500, e.message);
  }
};
