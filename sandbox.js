/* ============================================================
   THE SANDBOX — a feedback bot for an app you are testing with someone.

   Self-contained. It does not read your app's state, your i18n, your
   helpers or your CSS variables beyond the handful it defines itself.
   The only thing it needs from you is the name of the screen the tester
   is looking at.

       Sandbox.init({ screen: () => SCREENS[active] || 'Somewhere' });

   Everything else has a working default. Full options at the bottom.

   Built and hardened on Ministry Map, Aug–Sep 2026, with Dave Patty
   testing. Every comment that says "this happened" means it happened.
   ============================================================ */
const Sandbox = (function(){

'use strict';

const CFG = {
  endpoint : '/api/notes',
  version  : '/version.json',
  after    : 'after/',          /* where committed after-shots live, '' to disable */
  mount    : 'sandbox-bot',     /* element id the pencil paints into */
  screen   : () => 'Somewhere', /* REQUIRED in practice: which screen is showing */
  context  : () => '',          /* optional extra context, one short line */
  rerender : () => {},          /* your render(), so an open Notes page refreshes */
  header   : {'X-Sandbox':'1'}  /* see Traps: same-origin GET sends no Origin */
};

let NOTES=[], draft=[], who=null, askingWho=false, botOpen=false;
let saveErr=null, justSaved=false, shotsFailed=0, confirmDel=null;
let loading=false, storageOK=null;
let BUILD=null, newerBuild=false;

try{ who = localStorage.getItem('sandbox-who') || null; }catch(e){ who=null; }

/* Note text is typed by a person and rendered into innerHTML. A stray "<"
   in "students < 12" would swallow the rest of the panel. */
const esc = s => String(s==null?'':s).replace(/[&<>"]/g,
  c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

/* The commonest cause of "could not reach the server" is not the network:
   it is a local copy — file:, data:, blob: — where a relative /api path has
   no host to resolve against and never can. Say that instead. */
const onTheWeb = () => /^https?:$/.test(location.protocol);
const netMsg = () => onTheWeb()
  ? 'Could not reach the server. Check your connection and try again.'
  : 'This is a local copy of the page, not the live site, so it has no server to save to.';

/* ---------- which build am I looking at ----------
   A tester reported the same chart three times, partly because nothing told
   them whether the page in front of them contained the fix. version.json is
   written at deploy; this reads it at boot, shows the stamp, re-checks on a
   timer and on refocus, and says so when the page has gone stale. */
async function readBuild(){
  try{
    const r = await fetch(CFG.version+'?t='+Date.now(), {cache:'no-store'});
    return r.ok ? await r.json() : null;
  }catch(e){ return null; }
}
async function checkBuild(first){
  const v = await readBuild();
  if(!v) return;
  if(first) BUILD = v;
  else if(BUILD && v.at !== BUILD.at && !newerBuild) newerBuild = true;
  paint();
}
function buildLabel(){
  if(!onTheWeb() || !BUILD || BUILD.at === 'local') return 'Local copy';
  const d = new Date(BUILD.at);
  if(isNaN(d)) return 'Local copy';
  return 'Build ' + d.toLocaleDateString(undefined,{day:'numeric',month:'short'})
       + ', ' + d.toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'});
}

/* What the app knew when the note was written. One line, one field, and the
   tester types none of it. Added after a note reading "still the same
   problem here the graph" arrived from a screen that can show four of them. */
function context(){
  const bits=[];
  let extra=''; try{ extra = CFG.context() || ''; }catch(e){}
  if(extra) bits.push(extra);
  bits.push(Math.round(window.innerWidth)+'px');
  bits.push(onTheWeb()
    ? (BUILD && BUILD.at!=='local' ? buildLabel().replace(/^Build /,'build ') : 'build unknown')
    : 'local copy');
  return bits.join(' · ');
}

/* explain() is for whoever fixes the app. It names env vars and table names,
   and a tester must never see a word of it — that is exactly how a feedback
   bot teaches people not to trust the product it is bolted to. It goes to
   the console. The tester gets one plain sentence about their own note. */
function explain(status, body){
  let msg=''; try{ const j=JSON.parse(body); msg=(j.error&&(j.error.message||j.error))||j.message||''; }
  catch(e){ msg=(body||'').slice(0,120); }
  const isPage = /^\s*</.test(body||'');
  if((status===401||status===403) && isPage)
    return 'The site password session expired — reload and enter it again.';
  if(status===404 && /function/i.test(body||'')) return 'The notes function is not deployed.';
  if(status===404) return 'Table not found — check AIRTABLE_NOTES_TABLE and AIRTABLE_BASE_ID.';
  if((status===401||status===403) && /not allowed from here/i.test(msg))
    return 'The front door refused this request — see guard.js.';
  if(status===429) return 'Rate limited by the front door.';
  if(status===401||status===403)
    return 'Airtable rejected the key — check AIRTABLE_API_KEY and that the token can reach this base.';
  if(status===422) return 'A field name does not match the table — '+msg;
  if(status===500 && /env vars/i.test(msg)) return 'Environment variables are not set on this deploy.';
  return 'HTTP '+status+(msg?' — '+msg:'');
}

/* Failing to LOAD is not failing to save. This used to set the save error, so
   a tester who had typed nothing was told in red that their note was not
   saved and was still in the box — with an empty box in front of them. */
async function load(){
  loading = true; paint();
  try{
    let r;
    try{ r = await fetch(CFG.endpoint, {headers:CFG.header}); }
    catch(e){ throw new Error(netMsg()); }
    const body = await r.text();
    if(!r.ok) throw new Error(explain(r.status, body));
    NOTES = JSON.parse(body); storageOK = true;
  }catch(err){
    storageOK = false;
    console.warn('sandbox notes did not load:', err.message||err);
  }
  loading = false; paint();
}

async function save(note){
  try{
    let r;
    try{
      r = await fetch(CFG.endpoint, {method:'POST',
        headers:{'Content-Type':'application/json', ...CFG.header},
        body: JSON.stringify(note)});
    }catch(e){
      console.error('note save could not reach the server:', e);
      throw new Error(onTheWeb() ? 'we could not reach the server' : 'this is a local copy of the page');
    }
    const body = await r.text();
    if(!r.ok){
      console.error('note save failed:', explain(r.status, body));
      throw new Error(/^\s*</.test(body) ? 'the page needs reloading first'
                                         : 'something on our side is not working');
    }
    const saved = JSON.parse(body);
    shotsFailed = saved.shotsFailed || 0;
    const i = NOTES.findIndex(n=>n.id===note.id); if(i>-1) NOTES[i]=saved;
    storageOK = true; saveErr = null;
  }catch(err){ storageOK=false; saveErr = String(err.message||err); }
  paint();
}

async function add(){
  const box = document.getElementById('sb-text');
  if(!box || !box.value.trim()) return;
  const note = {id:Date.now(), who:who||'Unknown', text:box.value.trim(),
    area:safeScreen(), kind:'idea', context:context(), shots:draft.slice(),
    state:'open', at:new Date().toISOString()};
  NOTES.push(note);
  const keptText = box.value, keptShots = draft.slice();
  draft = []; box.value = ''; justSaved = false; paint();
  await save(note);
  if(saveErr){                                  /* put it back — lose nothing */
    NOTES = NOTES.filter(x=>x.id!==note.id); draft = keptShots; paint();
    const b2 = document.getElementById('sb-text'); if(b2) b2.value = keptText;
  }else{
    justSaved = true; paint(); setTimeout(()=>{justSaved=false; paint();}, 2600);
  }
}

/* The tick moves straight away and the save reconciles behind it. If the save
   fails the tick goes back, so the list never claims something is done that
   Airtable never heard about. */
async function toggle(id){
  const n = NOTES.find(x=>x.id===id); if(!n) return;
  const was = n.state;
  n.state = was==='done' ? 'open' : 'done';
  paint();
  await save(n);
  if(saveErr){ const m=NOTES.find(x=>x.id===id); if(m) m.state=was; paint(); }
}

/* Deleting is not reversible — the row leaves Airtable and there is no bin.
   Two clicks, and the second is a differently-worded button rather than the
   same one again, which is easy to hit twice by accident. */
async function remove(id){
  const i = NOTES.findIndex(x=>x.id===id); if(i<0) return;
  const note = NOTES[i];
  confirmDel = null; NOTES.splice(i,1); paint();
  if(!note.rec) return;                          /* never reached Airtable */
  try{
    const r = await fetch(CFG.endpoint+'?id='+encodeURIComponent(note.rec),
      {method:'DELETE', headers:CFG.header});
    if(!r.ok){
      console.error('note delete failed:', explain(r.status, await r.text()));
      NOTES.splice(i,0,note); saveErr='we could not delete that one'; paint();
    }
  }catch(e){
    console.error('note delete could not reach the server:', e);
    NOTES.splice(i,0,note);
    saveErr = onTheWeb() ? 'we could not reach the server' : 'this is a local copy of the page';
    paint();
  }
}

/* Airtable takes 5 MB per attachment and Netlify caps a function request near
   6 MB. A retina screen grab approaches both. 1600px on the long edge keeps
   text readable and the payload small. */
function shrink(dataUrl, type){
  return new Promise(res=>{
    const img = new Image();
    img.onload = () => {
      const max=1600, sc=Math.min(1, max/Math.max(img.width,img.height));
      if(sc===1) return res(dataUrl);
      const c = document.createElement('canvas');
      c.width = Math.round(img.width*sc); c.height = Math.round(img.height*sc);
      c.getContext('2d').drawImage(img,0,0,c.width,c.height);
      try{ res(c.toDataURL(type==='image/jpeg'?'image/jpeg':'image/png', .92)); }
      catch(e){ res(dataUrl); }
    };
    img.onerror = () => res(dataUrl);
    img.src = dataUrl;
  });
}
function takeShots(files){
  [...files].slice(0,3).forEach(file=>{
    const r = new FileReader();
    r.onload = async () => { const data = await shrink(r.result, file.type);
      draft.push({name:file.name, type:file.type, data}); paint(); };
    r.readAsDataURL(file);
  });
}

function setWho(v){
  v = (v||'').trim(); if(!v) return;
  who = v; try{ localStorage.setItem('sandbox-who', v); }catch(e){}
  askingWho = false; paint();
  setTimeout(()=>{ const b=document.getElementById('sb-text'); b&&b.focus(); }, 40);
}

/* A screen name your app failed to give us must not take the app down. */
function safeScreen(){
  try{ return CFG.screen() || 'Somewhere'; }catch(e){ return 'Somewhere'; }
}

/* ---------- the pencil ---------- */
function botHTML(){
  const n = NOTES.length;
  if(!botOpen) return `<button class="sb-fab" data-sb="open" aria-label="Write a note">
      <span>&#9998;</span></button>`;

  const gate = !who || askingWho;
  return `<div class="sb-wrap"><div class="sb-panel">
    <div class="sb-hd">
      <b>Notes</b>${onTheWeb()?'':'<span class="sb-local">local copy &mdash; will not save</span>'}
      ${newerBuild?'<span class="sb-stale" data-sb="reload">newer version &mdash; reload</span>':''}
      <button class="sb-x" data-sb="close" aria-label="Close">&times;</button>
    </div>
    <div class="sb-body">
      ${gate ? `<div class="sb-gate">
        <label><span>${who?'Change who is logging':'Who is logging notes?'}</span>
          <input id="sb-who" placeholder="First name" value="${esc(who||'')}" autofocus></label>
        <button class="sb-go" data-sbwho="set">${who?'Save':'Start'}</button>
        <p class="sb-hint">Kept on this device so you only say it once. It goes on every
           note so we know who found what.</p>
      </div>` : `
      <div class="sb-whoami">Logging as <b>${esc(who)}</b><button data-sbwho="ask">change</button></div>
      <textarea id="sb-text" rows="4"
        placeholder="What felt wrong? A new idea? Something confusing?"></textarea>
      ${draft.length?`<div class="sb-shots">${draft.map((s,i)=>
        `<div class="sb-shot"><img src="${s.data}" alt=""><button data-sbunshot="${i}">&times;</button></div>`
        ).join('')}</div>`:''}
      <div class="sb-row">
        <label class="sb-file">Screenshot<input type="file" accept="image/*" multiple id="sb-file"></label>
        <button class="sb-go" data-sbadd="1">Log it</button>
      </div>
      ${saveErr
        ? `<p class="sb-hint warn">Not saved &mdash; ${esc(saveErr)}. Your note is still in
             the box, so nothing is lost. Try again in a moment.</p>`
        : justSaved
          ? `<p class="sb-hint ok">Saved. ${n} note${n===1?'':'s'} so far.${
              shotsFailed?` ${shotsFailed} screenshot${shotsFailed===1?'':'s'} could not be attached.`:''}</p>`
          : `<p class="sb-hint">&#8984;V pastes a screenshot straight in. ${esc(buildLabel())}.</p>`}
      ${n?`<div class="sb-mini">${[...NOTES].sort((a,b)=>new Date(b.at)-new Date(a.at)).slice(0,6)
        .map(x=>`<div class="sb-mini-r${x.state==='done'?' done':''}">
          <button data-sbfix="${x.id}" aria-pressed="${x.state==='done'}">${x.state==='done'?'&#10003;':''}</button>
          <span>${esc(x.text).slice(0,90)}</span></div>`).join('')}</div>`:''}
      `}
    </div>
  </div></div>`;
}

/* ---------- the Notes page ----------
   Call this from your own view for a full-width list. Open first, then done:
   a list sorted purely by date buries what is outstanding under what is not. */
function notesHTML(){
  const open = NOTES.filter(x=>x.state!=='done').sort((a,b)=>new Date(b.at)-new Date(a.at));
  const done = NOTES.filter(x=>x.state==='done').sort((a,b)=>new Date(b.at)-new Date(a.at));

  const row = x => {
    const isDone = x.state==='done';
    const before = (x.shots||[]).filter(s=>s&&s.data);
    /* The after-shot is a file in the repo at after/<record id>.jpg, served
       from our own origin — not an Airtable field. A screenshot does not fit
       in a cell, and committing it versions the picture with the change it
       shows. No file, no figure: the img removes itself on error. */
    const shots = (!before.length && !CFG.after) ? '' : `
      <div class="sb-ba">
        ${before.map(s=>`<figure><figcaption>What you saw</figcaption>
          <img src="${s.data}" alt="" onclick="this.closest('figure').classList.toggle('big')">
          <div class="sb-zoom">Click to open out</div></figure>`).join('')}
        ${(CFG.after && x.rec)?`<figure class="after"><figcaption>What it looks like now</figcaption>
          <img src="${CFG.after}${esc(x.rec)}.jpg" alt=""
               onclick="this.closest('figure').classList.toggle('big')"
               onerror="this.closest('figure').remove()">
          <div class="sb-zoom">Click to open out</div></figure>`:''}
      </div>`;
    return `<div class="sb-note${isDone?' done':''}">
      <button class="sb-tick" data-sbfix="${x.id}" aria-pressed="${isDone}"
              title="${isDone?'Mark as not done':'Mark as done'}">${isDone?'&#10003;':''}</button>
      <div class="sb-note-body">
        <div class="sb-note-text">${esc(x.text).replace(/\n/g,'<br>')}</div>
        <div class="sb-note-meta">${esc(x.who||'Unknown')}${x.area?' &middot; '+esc(x.area):''}
          &middot; ${new Date(x.at).toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'})}
          &middot; ${new Date(x.at).toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'})}</div>
        ${(!before.length && (x.shots||[]).some(s=>s&&s.tooBig))
          ? '<div class="sb-note-meta">A screenshot was attached but was too large to store.</div>'
          : shots}
        ${x.context?`<div class="sb-ctx">${esc(x.context)}</div>`:''}
        ${x.fix?`<div class="sb-fix"><span>What changed</span>${esc(x.fix).replace(/\n/g,'<br>')}</div>`:''}
      </div>
      <div class="sb-note-act">${confirmDel===x.id
        ? `<button class="sb-del go" data-sbdel="${x.id}">Delete for good</button>
           <button class="sb-del" data-sbdel="cancel">Keep</button>`
        : `<button class="sb-del" data-sbdel="ask:${x.id}">Delete</button>`}</div>
    </div>`;
  };

  return `<div class="sb-page">
    <div class="sb-page-top">
      <div class="sb-eyebrow">Workbench</div>
      <button class="sb-refresh" data-sbrefresh="1" ${loading?'disabled':''}>${
        loading?'Loading&hellip;':'Refresh'}</button>
    </div>
    <h1 class="sb-h1">${NOTES.length
      ? `${open.length} still open<span class="sb-of">, ${done.length} done</span>`
      : 'Nothing logged yet'}</h1>
    <p class="sb-lede">Everything logged from the pencil, from everyone. Tick one when it is
       dealt with. This reads the same records as the base &mdash; there is no second copy.</p>
    ${!NOTES.length
      ? `<div class="sb-empty">${storageOK===false
          ? 'The list could not be loaded. Nothing is lost &mdash; try Refresh.'
          : 'When someone writes a note with the pencil, bottom right, it appears here.'}</div>`
      : `${open.length?`<div class="sb-sec"><div class="sb-eyebrow">Open</div>${open.map(row).join('')}</div>`:''}
         ${done.length?`<div class="sb-sec"><div class="sb-eyebrow">Done</div>${done.map(row).join('')}</div>`:''}`}
  </div>`;
}

/* Repaint the pencil, and ask the host to repaint in case a Notes page is
   open. Typed text is preserved: losing what somebody just wrote is the one
   unforgivable bug in a tool whose whole job is collecting what they wrote. */
function paint(){
  const box = document.getElementById('sb-text');
  const keep = box ? box.value : null;
  const el = document.getElementById(CFG.mount);
  if(el){
    try{ el.innerHTML = botHTML(); }
    catch(err){ console.error('sandbox bot failed to render', err); }
  }
  if(keep!==null){ const b2 = document.getElementById('sb-text'); if(b2) b2.value = keep; }
  try{ CFG.rerender(); }catch(err){ console.error('sandbox rerender hook threw', err); }
}

function wire(){
  document.addEventListener('click', e => {
    const hit = k => e.target.closest('[data-'+k+']');
    let el;
    if(el=hit('sb')){
      const k = el.dataset.sb;
      if(k==='reload'){ location.reload(); return; }
      botOpen = (k==='open'); paint();
      if(botOpen) setTimeout(()=>{
        const f=document.getElementById(who?'sb-text':'sb-who'); f&&f.focus(); },60);
      return;
    }
    if(el=hit('sbwho')){
      if(el.dataset.sbwho==='ask'){ askingWho=true; paint();
        setTimeout(()=>{const f=document.getElementById('sb-who'); f&&f.focus();},40); return; }
      const f=document.getElementById('sb-who'); setWho(f&&f.value); return;
    }
    if(el=hit('sbadd')){ add(); return; }
    if(el=hit('sbfix')){ toggle(Number(el.dataset.sbfix)); return; }
    if(el=hit('sbunshot')){ draft.splice(+el.dataset.sbunshot,1); paint(); return; }
    if(el=hit('sbrefresh')){ load(); return; }
    if(el=hit('sbdel')){
      const v = el.dataset.sbdel;
      if(v==='cancel'){ confirmDel=null; paint(); return; }
      if(v.startsWith('ask:')){ confirmDel=Number(v.slice(4)); paint(); return; }
      remove(Number(v)); return;
    }
  });

  document.addEventListener('change', e => {
    if(e.target.id==='sb-file' && e.target.files) takeShots(e.target.files);
  });

  /* Paste a screenshot straight in. Only while the panel is open, or we
     would hijack every paste in the host app. */
  document.addEventListener('paste', e => {
    if(!botOpen) return;
    const items = [...(e.clipboardData&&e.clipboardData.items||[])]
      .filter(i=>i.type&&i.type.startsWith('image/'));
    if(!items.length) return;
    e.preventDefault();
    takeShots(items.map(i=>i.getAsFile()).filter(Boolean));
  });

  document.addEventListener('keydown', e => {
    if(e.key==='Escape' && botOpen){ botOpen=false; paint(); }
  });

  /* Is the page in front of you still the current deploy? */
  document.addEventListener('visibilitychange', () => {
    if(document.visibilityState==='visible') checkBuild(false);
  });
  setInterval(()=>checkBuild(false), 5*60*1000);
}

function init(opts){
  Object.assign(CFG, opts||{});
  if(!document.getElementById(CFG.mount)){
    const d = document.createElement('div'); d.id = CFG.mount;
    document.body.appendChild(d);
  }
  wire();
  paint();
  load();
  checkBuild(true);
}

return {
  init,
  notesHTML,                                   /* render this in your own view */
  openCount: () => NOTES.filter(x=>x.state!=='done').length,
  count:     () => NOTES.length,
  reload:    load,
  buildLabel,
  isStale:   () => newerBuild,
  /* for a pre-push render check: seed rows without touching the network */
  _seed: rows => { NOTES = rows; paint(); }
};

})();
