// Secure Airtable proxy. The token never reaches the browser.
// Env vars required in Netlify:  AIRTABLE_TOKEN,  AIRTABLE_BASE
const BASE = process.env.AIRTABLE_BASE;
const TOKEN = process.env.AIRTABLE_TOKEN;

const HEAD = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
  "Content-Type": "application/json"
};

const ok = (b) => ({ statusCode: 200, headers: HEAD, body: JSON.stringify(b) });
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

// Airtable caps writes at 10 records per request
const chunk = (a, n) => a.reduce((s, x, i) => (i % n ? s[s.length - 1].push(x) : s.push([x]), s), []);

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: HEAD, body: "" };

  const q0 = event.queryStringParameters || {};

  // ---- diagnostics: /.netlify/functions/airtable?action=diag
  // Reports what the function can see. Never prints the token itself.
  if (q0.action === "diag") {
    return ok({
      node: process.version,
      AIRTABLE_BASE: BASE ? `set (${BASE})` : "MISSING",
      AIRTABLE_TOKEN: TOKEN
        ? `set (${TOKEN.length} chars, starts "${TOKEN.slice(0, 3)}", ends "${TOKEN.slice(-3)}")`
        : "MISSING",
      airtableEnvKeysVisible: Object.keys(process.env).filter(k => /AIRTABLE/i.test(k)),
      hint: "Both must say 'set'. If a key shows here but the value is MISSING, the name has a typo or stray space."
    });
  }

  if (!BASE || !TOKEN) return bad(500, "AIRTABLE_BASE / AIRTABLE_TOKEN not configured");

  const q = q0;
  const table = q.table;
  const body = event.body ? JSON.parse(event.body) : {};

  try {
    // ---- attachment upload: POST ?action=upload  {recordId, fieldId, filename, contentType, base64}
    if (q.action === "upload") {
      const { recordId, fieldId, filename, contentType, base64 } = body;
      const r = await fetch(
        `https://content.airtable.com/v0/${BASE}/${recordId}/${fieldId}/uploadAttachment`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
          body: JSON.stringify({ contentType, file: base64, filename })
        }
      );
      const j = await r.json();
      if (!r.ok) return bad(r.status, j?.error?.message || "upload failed");
      return ok(j);
    }

    if (!table) return bad(400, "table required");
    const enc = encodeURIComponent(table);

    // ---- read: GET ?table=Objectives   (follows pagination)
    if (event.httpMethod === "GET") {
      let records = [], offset;
      do {
        const url = `${enc}?pageSize=100${offset ? `&offset=${offset}` : ""}`;
        const j = await air(url);
        records = records.concat(j.records);
        offset = j.offset;
      } while (offset);
      return ok({ records });
    }

    // ---- create: POST ?table=Tasks  {records:[{fields:{...}}]}
    if (event.httpMethod === "POST") {
      const out = [];
      for (const c of chunk(body.records || [], 10)) {
        const j = await air(enc, { method: "POST", body: JSON.stringify({ records: c, typecast: true }) });
        out.push(...j.records);
      }
      return ok({ records: out });
    }

    // ---- update: PATCH ?table=Key Results  {records:[{id, fields:{...}}]}
    if (event.httpMethod === "PATCH") {
      const out = [];
      for (const c of chunk(body.records || [], 10)) {
        const j = await air(enc, { method: "PATCH", body: JSON.stringify({ records: c, typecast: true }) });
        out.push(...j.records);
      }
      return ok({ records: out });
    }

    return bad(405, "method not allowed");
  } catch (e) {
    return bad(500, e.message);
  }
};
