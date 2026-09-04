/* Paste into the console (or run headless) before every push.

   Renders every view and every panel that only appears after a click, and
   reports anything that throws or comes back empty. Written after a day of
   shipping first and finding the fault afterwards.

   ADAPT THE TWO LISTS BELOW to this app. Everything else is generic. */
(function(){
  /* ---- adapt ---- */
  const VIEWS = ['jv','team','teamcheckin','mine','workshop','objective','checkin','reviews','okrs','meetings','org','archive','coaching','notes'];
  const setView = v => { VIEW = v; };               // this app's view variable
  const draw    = () => render();                   // this app's render
  const APP     = 'view';                           // element id the view paints into
  /* ---- /adapt ---- */

  const out = {threw:[], empty:[], notes:[]};

  /* Seed the sandbox so its list and its before/after both render without
     touching the network. A 1x1 gif stands in for a screenshot. */
  const PX='data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
  if(window.Sandbox && Sandbox._seed) Sandbox._seed([
    {id:1, rec:'r1', who:'Tester', text:'An open note', area:'Home',
     state:'open', at:new Date().toISOString(), shots:[]},
    {id:2, rec:'r2', who:'Tester', text:'A fixed note with a shot', area:'List',
     state:'done', at:new Date().toISOString(), fix:'Changed it.', shots:[{data:PX}]}
  ]);

  VIEWS.forEach(v=>{
    try{
      setView(v); draw();
      const n = document.getElementById(APP).innerHTML.length;
      /* 300 is a heuristic for "this view rendered nothing useful". Tune it
         to the app: a screen that is legitimately a single sentence will
         report as empty until you do. */
      if(n < 300) out.empty.push(v+' ('+n+' chars)');
    }catch(e){ out.threw.push(v+': '+e.message); }
  });

  /* the bot, in each of its states */
  const mount = () => document.getElementById('sandbox-bot');
  [['closed', ()=>{ document.querySelector('[data-sb="close"]')?.click(); }],
   ['open',   ()=>{ document.querySelector('[data-sb="open"]')?.click(); }]
  ].forEach(([name,act])=>{
    try{ act(); if(!mount() || mount().innerHTML.length < 20) out.notes.push('bot/'+name); }
    catch(e){ out.threw.push('bot/'+name+': '+e.message); }
  });

  /* the notes page, with both a plain note and a before/after one */
  try{
    if(window.Sandbox){
      const h = Sandbox.notesHTML();
      if(!/sb-note/.test(h)) out.notes.push('notes page rendered no rows');
      if(!/sb-ba/.test(h))   out.notes.push('notes page rendered no before/after');
    }
  }catch(e){ out.threw.push('notes page: '+e.message); }

  out.ok = !out.threw.length && !out.empty.length && !out.notes.length;
  return out;
})()
