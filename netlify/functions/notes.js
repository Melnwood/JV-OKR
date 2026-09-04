// Workbench notes -> Airtable. GET list, POST upsert, DELETE remove.
// Screenshots are stored as base64 in a long-text field: simple, no file
// hosting, and they never leave the base. Airtable caps a cell at 100k
// characters, so oversized shots are dropped with a marker rather than
// silently corrupting the record.
const { refuse } = require('./lib/guard');

const BASE  = process.env.AIRTABLE_BASE_ID;
const TABLE = process.env.AIRTABLE_NOTES_TABLE || 'Workbench';
const KEY   = process.env.AIRTABLE_API_KEY;
const UPLOAD_MAX = 5 * 1024 * 1024;        // Airtable's own cap on one attachment
const SHOTS_FIELD = 'Screenshots';

const url = (p = '') => `https://api.airtable.com/v0/${BASE}/${encodeURIComponent(TABLE)}${p}`;
const H = { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

const out = (rec) => {
  const f = rec.fields || {};
  // Real attachments first. `Shots` is the old base64-in-a-text-cell field and
  // is only read so notes logged before 31 Aug 2026 still show their images —
  // which in practice means the few small enough to have survived at all.
  let shots = (f[SHOTS_FIELD] || []).map(a => ({ name: a.filename, data: a.url, type: a.type }));
  if (!shots.length) {
    try { shots = f.Shots ? JSON.parse(f.Shots) : []; } catch { shots = []; }
  }
  return {
    rec: rec.id,
    id: Number(f.LocalId) || Date.parse(f.LoggedAt) || Date.now(),
    who: f.Who || 'Unknown',
    text: f.Note || '', area: f.Screen || '', kind: f.Kind || 'idea',
    state: f.State || 'open', at: f.LoggedAt || new Date().toISOString(),
    reply: f.ClaudeRead || null, fix: f.Fix || null, context: f.Context || null, shots
  };
};

exports.handler = async (event) => {
  // GET returns every note in the base, so this runs before anything else.
  const no = refuse(event);
  if (no) return no;

  if (!BASE || !KEY) return { statusCode: 500, body: JSON.stringify({ error: 'Airtable env vars not set' }) };

  try {
    if (event.httpMethod === 'GET') {
      const r = await fetch(url('?pageSize=100&sort%5B0%5D%5Bfield%5D=LoggedAt&sort%5B0%5D%5Bdirection%5D=desc'), { headers: H });
      const d = await r.json();
      if (!r.ok) return { statusCode: r.status, body: JSON.stringify(d) };
      return { statusCode: 200, headers: { 'Content-Type': 'application/json' },
               body: JSON.stringify((d.records || []).map(out)) };
    }

    if (event.httpMethod === 'POST') {
      const n = JSON.parse(event.body || '{}');
      // Nothing new goes into Shots. Images are attachments now; this only
      // keeps the column from being rewritten on an update of an old note.
      const shotsJson = undefined;
      const fields = {
        Who: n.who || 'Unknown',
        LocalId: String(n.id), Note: n.text || '', Screen: n.area || '',
        Kind: n.kind || 'idea', State: n.state || 'open',
        LoggedAt: n.at || new Date().toISOString(),
        ClaudeRead: n.reply || '', Context: n.context || ''
      };
      const has = n.rec;
      const send = (body) => fetch(has ? url('/' + n.rec) : url(), {
        method: has ? 'PATCH' : 'POST', headers: H, body: JSON.stringify(body)
      });

      let r = await send({ fields });
      let d = await r.json();

      // The Who column is optional. If the base does not have it yet, save the
      // note anyway rather than losing it — better a note without a name than
      // no note at all. Everything else still fails loudly.
      if (!r.ok && r.status === 422 && /unknown field name/i.test(JSON.stringify(d))) {
        const { Who, ...rest } = fields;
        r = await send({ fields: rest });
        d = await r.json();
        if (r.ok) {
          const rec = out(d); rec.who = n.who || 'Unknown'; rec.whoNotStored = true;
          return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(rec) };
        }
      }

      if (!r.ok) return { statusCode: r.status, body: JSON.stringify(d) };

      // Attachments upload one at a time against the saved record, so this can
      // only run once the record exists. A failure here must not lose the note:
      // the text is already saved, so we report the note as saved either way
      // and say which images did not make it.
      const shots = (n.shots || []).filter(sh => sh && typeof sh.data === 'string' && sh.data.startsWith('data:'));
      const failed = [];
      for (const sh of shots) {
        const m = /^data:([^;]+);base64,(.*)$/.exec(sh.data);
        if (!m) { failed.push(sh.name); continue; }
        const [, contentType, b64] = m;
        if (b64.length * 0.75 > UPLOAD_MAX) { failed.push(sh.name); continue; }
        try {
          const up = await fetch(
            `https://content.airtable.com/v0/${BASE}/${d.id}/${SHOTS_FIELD}/uploadAttachment`,
            { method: 'POST', headers: H,
              body: JSON.stringify({ contentType, file: b64, filename: sh.name || 'screenshot.png' }) });
          if (!up.ok) { failed.push(sh.name); console.error('attachment upload failed', up.status, await up.text()); }
        } catch (err) { failed.push(sh.name); console.error('attachment upload threw', err); }
      }

      // Re-read so the response carries the attachment urls the app will show.
      let fresh = d;
      if (shots.length > failed.length) {
        try {
          const rr = await fetch(url('/' + d.id), { headers: H });
          if (rr.ok) fresh = await rr.json();
        } catch (err) { console.error('could not re-read after upload', err); }
      }
      const rec = out(fresh);
      if (failed.length) rec.shotsFailed = failed.length;
      return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(rec) };
    }

    if (event.httpMethod === 'DELETE') {
      const id = (event.queryStringParameters || {}).id;
      if (!id || !id.startsWith('rec')) return { statusCode: 400, body: JSON.stringify({ error: 'Need an Airtable record id' }) };
      const r = await fetch(url('/' + id), { method: 'DELETE', headers: H });
      return { statusCode: r.status, body: await r.text() };
    }

    return { statusCode: 405, body: 'Method not allowed' };
  } catch (err) {
    return { statusCode: 502, body: JSON.stringify({ error: String(err.message || err) }) };
  }
};
