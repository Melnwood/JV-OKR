# JV OKR — project guide for Claude Code

This is a single-file web app for Josiah Venture's OKR tracking. Read this first.

## What it is
A ministry OKR tool for ~400 staff across 16+ countries. Design goal, in the
owner's words: **"eloquent simplicity."** Built to be usable by other
organizations too (white-label): the accent color is a single swappable CSS
variable, and neutrals are near-gray so they work with any accent.

## Architecture (deliberately simple — do not over-engineer)
- **`index.html`** — the ENTIRE front end. One file: HTML + CSS in `<style>` +
  all JS in one `<script>`. ~2,400 lines. No build step, no framework, no npm.
  Vanilla JS, rendered by view functions on a `V` object.
- **`netlify/functions/airtable.js`** — the ONLY backend. A serverless proxy to
  Airtable that also (a) enforces Google auth + roles server-side, and (b) hosts
  the Sounding Board AI endpoint. The Airtable token never reaches the browser.
- **`netlify.toml`** — publishes from repo root (`publish = "."`), functions in
  `netlify/functions`. **Keep this flat.** No `src/`, no `public/`, no
  `package.json` — those broke the deploy for two hours once (see History).

## Deploy (this is the whole thing)
Site is **GitHub-linked**: `github.com/Melnwood/JV-OKR` → Netlify auto-builds on
every push to `main`. Live at **jv-okr.netlify.app**.
- **Commit to `main` and it deploys.** That's it.
- **NEVER** do a manual Netlify drag-drop upload — it overrides the repo and
  desyncs everything. GitHub is the single source of truth.
- After a commit, watch Netlify → Deploys for a green "Published."
- Verify a deploy landed: view-source `jv-okr.netlify.app/index.html`, search a
  known-recent string. First nav tab should read **JV 2030**.

## Environment variables (Netlify → Site config → Environment variables)
All scoped to Functions (Builds/Runtime fine too):
- `AIRTABLE_BASE` = `app70cjJzoUHQZtHA`
- `AIRTABLE_TOKEN` = Airtable personal access token (starts `pat…`)
- `GOOGLE_CLIENT_ID` = the OAuth client (…apps.googleusercontent.com)
- `ALLOWED_DOMAIN` = `josiahventure.com`
- `ANTHROPIC_API_KEY` = Anthropic key (starts `sk-ant-…`) — powers the Sounding Board
Diagnostic: `jv-okr.netlify.app/.netlify/functions/airtable?action=diag` lists
which vars are set.

## Before every commit — CHECK SYNTAX. Both files, every time:
```bash
# index.html — extract the script and parse it
node -e "const s=require('fs').readFileSync('index.html','utf8');new Function(s.match(/<script>([\s\S]*)<\/script>/)[1]);console.log('index OK')"
# the function
node --check netlify/functions/airtable.js
```
There is a headless "smoke test" pattern (stub the DOM, call every `V.*` view)
used throughout this project to catch runtime errors before deploy — worth
recreating as `smoke.js` and running before each commit. It stubs document/
window/fetch, loads the `<script>` body, seeds `DB` with mock records, and calls
each view function. If a view throws, it prints which one.

## The data model (Airtable base `app70cjJzoUHQZtHA`)
Tables (referred to in code via the `T` map): People, Cycles, Org Units,
Objectives, Key Results, Tasks, Check-ins, Reviews, Review Responses, Decisions,
Coaching Notes, Resources, Resource Shares.
- **Org Units** are a self-referencing hierarchy (Country/Division/Department/
  Team, each with a Parent unit). A person's team = their `Org Unit` link.
- **Objectives** carry Scope, Alignment (ladders / supports / standalone),
  Parent Key Result (if it ladders), Org Unit, Owner, Cycle, Confidence, Status.
- **Key Results** carry current/target/start values, Commit, Stretch, Progress,
  Archived. **Changing a target should be recorded as a Decision** (keeps the
  original + the reason) — that's a core principle, not a nicety.
- Field access in code: `f(record,"Field")` reads a field; `one(r,"Link")` first
  linked id; `lnk(r,"Link")` the array; `rec("table",id)` fetches; `nm("table",id)`
  a name. Views live on `V.<name>`; the JV 2030 lenses on `LENS.<name>`.

## Navigation (current, intentional — restructured 2026-09-01)
**`JV 2030 · Team · My work · Coaching`** + icons: ✦ Workshop, ⚙ gear (Org,
Archive — leaders), "?" guide. Three layers, per Mike's original design: JV 2030
= everyone (view-only, three lenses), Team = the team's room (season, the three
meetings, the weekly team check-in, the record; coaches get a team picker),
My work = the personal walk. Coaching is Mike + Mel only, enforced server-side.
The old OKRs and Meetings tabs are retired from the nav — `V.okrs` and
`V.meetings` still exist and are reached internally (new-objective flow lands on
V.okrs with the form open). The per-objective check-in (`V.checkin`) is retired
from all routes — every Check in button leads to the team check-in
(`V.teamcheckin`), using `teamUnitOverride` when crossing teams. Do not add nav
tabs without strong reason — "eloquent simplicity" lost once already.

## Key features and where they live in index.html
- **OKRs tab = expand-in-place workspace** (`V.okrs`): objectives as a collapsed
  list grouped by unit; click one to unfold its key results with tasks nested
  under each (tick/add/delete inline). "Check in" + "Full workspace →".
- **Full workspace** (`V.objective`): the deep single-objective view — decisions,
  full check-in history, edit. Reached via "Full workspace →"; has "← All OKRs."
- **My work** (`V.mine`): the signed-in person's ground level — my tasks
  (soonest first), our team's OKRs (team = my Org Unit), team movement. The
  parent-ladder line is intentionally demoted to a small "where this lands at JV"
  link. Helper `myOkrs(pid)` combines owned + team + task-owned, de-duped.
- **Sounding Board** (`?action=sounding` in airtable.js; UI in `objForm`/
  `wireSoundingBoard`): AI thinking partner in the New Objective form. NOT called
  a coach (Mike is the coach). Two rounds: it reads the objective and asks 3–4
  questions the person WRITES ANSWERS to; round 2 reads their answers and offers
  a sharpened objective. **Grace for building seasons** — never scold system-
  building work; name the "building season" and bless it when they can name the
  behavioral change it "leads toward." Server-side, model `claude-sonnet-4-6`.
- **Check-in** (`V.checkin`), **Reviews** (`V.reviews`), **Org** (`V.org`),
  **Archive** (`V.archive`), **Coaching** (`V.coaching`).

## Still to build (backlog, roughly in priority order)
1. **Midterm & retrospective reviews** — Mike specified exact 6 midterm + 6
   retrospective questions (in the meeting transcript). Confirm the reviews view
   carries those question sets; each team member answers before the meeting.
2. **Review date automation** — store midterm/retro dates → auto-send the
   questions the week before → reminders + questionnaire link into Google
   Calendar / email. Biggest remaining build.
3. **Configurable notifications** — by group (whole-team / subgroup / person) and
   timing. Comment + check-in notifications. "Useful, not noisy."
4. **Task comments + Kanban movement** — Mike wanted both on tasks.
5. **Confirm the check-in asks Mike's 3 elements** — outcome & progress /
   resources & roadblocks / what's next.
6. **Planning whiteboard** — sticky cards you group; a group promotes into a key
   result. Prototype exists (cards + grouping only; no freehand, no live multi-
   user); fold it into the app.
7. **A warmer product name** than "JV OKR" (undecided).

## Sandbox (build-time tester feedback — installed 2026-09-04)
The feedback pencil from `Documents/sandbox-kit/` (see its README for the full
philosophy). Testers: Mel, Mike, Chris. Files: `sandbox.js` + `sandbox.css`
(repo root, kit files — kept neutral grey on purpose: it should read as a tool,
not the product), `netlify/functions/notes.js` + `netlify/functions/lib/guard.js`
(the endpoint + origin/X-Sandbox guard), `.checks/render-check.js` (console
script — paste into DevTools, checks all 14 views + bot + notes page) and
`.checks/shot.sh`. Wiring in index.html: `Sandbox.init` at the end of the
script (screen names per view, context adds obj/kr/team), `V.notes` renders
`Sandbox.notesHTML()`, Notes lives in the GEAR menu (leaders' gear — Chris
uses the pencil's own list instead). `netlify.toml` carries the version.json
build command, the `/api/notes` redirect, and `Referrer-Policy: same-origin`
(NOT no-referrer — the guard needs the Referer on same-origin GETs).
**Notes go to a SEPARATE Airtable base** `appUJ0xJCit7WOJzk` ("JV OKR Sandbox",
table `Workbench`) — the sandbox endpoint is the weakest door; its token must
not open the product base. Env vars for it (Netlify): `AIRTABLE_API_KEY` (a
token whose Access list has ONLY the sandbox base), `AIRTABLE_BASE_ID` =
`appUJ0xJCit7WOJzk`, `AIRTABLE_NOTES_TABLE` = `Workbench`. Note these are
different names from the product proxy's `AIRTABLE_BASE`/`AIRTABLE_TOKEN` —
that separation is the point.

## After every feature ships
Add a Mike-readable entry (WHAT / TRY IT / WATCH FOR, newest first) to the
Google Doc **"JV OKR — What's New (how to try it)"** in Mel's Drive — current
file id `1i0_ZhF3_tDuzg8Hxd84FEtgM32jWo-xBmvJzeHeN7oQ`. The Drive connector
can't edit Doc content, so the pattern is: recreate the Doc with the full
updated text (same title), trash the old one, and update this id here and in
memory. Mike tests from this doc.

## Working style the owner prefers
Concise. Iterate fast. **Do not over-engineer.** Make reversible decisions
rather than asking — only stop for facts you can't obtain or where a wrong guess
costs real money/data. Show a visual/preview before big changes. Keep the
single-file, no-build-step architecture unless there's a strong reason not to.

## History worth knowing (so you don't repeat it)
The repo once got polluted with a different app's files (Pulse Report: `src/`,
`public/`, `package.json`). Because `netlify.toml` publishes from root, a shadow
`public/index.html` silently caught edits while the served root file stayed old —
hours lost. The repo is now exactly these files: `index.html`, `netlify.toml`,
`netlify/functions/airtable.js`, `icon.svg`, `favicon-32.png`, `icon-192.png`,
`icon-512.png`, `apple-touch-icon.png`, `site.webmanifest`, `README.md`, this
`CLAUDE.md`, `smoke.js`, plus the sandbox set: `sandbox.js`, `sandbox.css`,
`netlify/functions/notes.js`, `netlify/functions/lib/guard.js`, `.checks/`.
Keep it that clean.
