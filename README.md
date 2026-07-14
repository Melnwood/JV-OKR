# JV OKR

Single-page app on Netlify, backed by the **JV OKR** Airtable base (`app70cjJzoUHQZtHA`),
with a serverless function proxying every call so the Airtable token never reaches the browser.

## Deploy

1. Push this folder to a GitHub repo.
2. In Netlify: **Add new site → Import from GitHub**, pick the repo. No build command needed.
3. **Site settings → Environment variables**, add:
   - `AIRTABLE_BASE` = `app70cjJzoUHQZtHA`
   - `AIRTABLE_TOKEN` = a personal access token from https://airtable.com/create/tokens
     with scopes `data.records:read`, `data.records:write` on the **JV OKR** base.
4. Redeploy. Done.

## First things to do in the base

- Replace the four **PLACEHOLDER — JV5 key result** rows and two **PLACEHOLDER — JV five-year objective**
  rows with the real JV five-year OKR. Everything ladders to those key results.
- Add people to **People**. Set `Role` (Country leader / Division leader / Team leader / OKR Director)
  and `Coaching cadence (days)` — that's what drives "overdue for a 1:1".

## Tables

| Table | What it holds |
|---|---|
| **People** | Everyone. `Last coached`, `Days since 1:1` and `Overdue for a 1:1` are computed. |
| **Cycles** | 5-year, annual, trimester — all coexist. Objectives point at one. |
| **Objectives** | Every level. `Parent Key Result` is the ladder: a country objective points at ONE JV five-year key result. `Progress` rolls up from its key results; `Days since check-in` is the honest health metric. |
| **Key Results** | `Original target` is preserved forever. `Target changed` flags any KR whose target no longer matches it. |
| **Tasks** | Under a key result. Anyone can add one. |
| **Check-ins** | Proof the conversation happened, plus what moved. `Reply` closes the loop. |
| **Reviews** | A midterm or retrospective for one objective. |
| **Review Responses** | One row per person per review. Attributed, never anonymous. |
| **Decisions** | Attached to the objective. `Why` is the whole point. |
| **Coaching Notes** | The OKR director's notebook. `Visibility` defaults to Private. `Files` holds attachments. |
| **Resources** / **Resource Shares** | The coaching library, and who actually opened what. |

## The app

| View | For |
|---|---|
| **Dashboard** | Every objective cascading under the JV five-year key result it serves. Tiles filter. |
| **Alignment map** | Org-chart view. Hover any box to trace its line up to the JV objective. |
| **My work** | One page per leader: what needs them, all their objectives, recent movement. |
| **Check in** | KR sliders + inline tasks (tick off, add new) + what moved + confidence. Ends with the ripple up to the JV key result. |
| **Reviews** | Midterm and retro. You can't see anyone's answers until you submit your own. Facilitator view shows the confidence spread. |
| **Objectives** | Key results with target history, the decision log, and check-in history with replies. |
| **Coaching** | Queue ranked by need, private-by-default notes with file attachments, the library, and three generated reports. |

## Notes

- Identity is a simple "I'm…" picker, remembered in the browser. If you need real auth, put
  Netlify Identity in front of it — the function already runs server-side, so the token stays safe.
- Attachments upload through the function to Airtable's content endpoint. Airtable caps attachments
  at 5 MB per file via that route; anything bigger should live in Drive with the link on the record.
- `Days since check-in` and `Days since 1:1` use `TODAY()` in Airtable, so they refresh daily.

## Icon

JV orange `#FF6600`. The "ladder" mark — three rising bars (team → country → JV) with OKR above them.
The lettering is converted to vector paths, so it renders identically with no font installed.

| File | Used for |
|---|---|
| `icon.svg` | Favicon in modern browsers; scales to any size |
| `favicon-32.png` | Fallback favicon |
| `apple-touch-icon.png` | iOS home screen (180×180) |
| `icon-192.png` / `icon-512.png` | Android / PWA install, Slack, Airtable |
| `site.webmanifest` | Lets staff add JV OKR to a phone home screen; theme colour is JV orange |

All of it is already wired into `index.html` — nothing else to do.
