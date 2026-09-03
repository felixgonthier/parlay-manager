# Weekly TD Parlay

Each week every owner in the Sleeper league picks one player from their own
roster to score an anytime TD (rushing or receiving). You collect the legs and
place the parlay.

- `/` — open to anyone with the link, no password. Owners pick their team once;
  the browser remembers it, so later weeks are just "pick a player".
- `/admin` — password protected. All picks, auto-fills for anyone who didn't
  submit, per-team overrides, and a copy-ready list of parlay legs.

Rosters, team names and the current NFL week come live from the Sleeper API, so
there is nothing to maintain week to week: the week rolls over on its own and
picks start empty again.

Eligible players are QB, RB, WR and TE — QBs are included because a QB rushing
TD is a real anytime-TD market. The dropdown groups them by position, starters
first.

## Deploy on Vercel

1. **Storage → Create Database → Upstash for Redis** (free tier) on the Vercel
   project and connect it. That injects the Redis env vars automatically.
2. **Settings → Environment Variables**:

   | Variable | Value |
   | --- | --- |
   | `SLEEPER_LEAGUE_ID` | `1389734249816428544` |
   | `ADMIN_PASSWORD` | only you know this; it unlocks `/admin` |
   | `LOCK_SUNDAY_HOUR_ET` | optional, e.g. `13` — picks close Sunday 1pm ET |

3. Redeploy, then share the URL in the Sleeper chat.

Each new season, update `SLEEPER_LEAGUE_ID` to that season's league (Sleeper
creates a new id) — that is the only recurring chore.

## Run locally

```bash
npm install
cp .env.example .env.local   # set ADMIN_PASSWORD
npm run dev
```

Without Redis env vars, picks are held in memory so the app still runs — they
vanish on restart. Provision Redis before you deploy.

## Admin overrides

On `/admin` each row has a **Change to…** dropdown listing that team's roster.
Selecting a player saves immediately and the row is marked *set by you*.
**Clear** removes the pick, so the team falls back to its auto-filled best
starter (tagged `[auto]` in the parlay list — delete those legs if you'd rather
only bet real submissions). Overrides work even when picks are locked.

## How it works

- `lib/sleeper.js` — Sleeper API calls. The ~5MB player dump is trimmed to
  QB/RB/WR/TE and cached in Redis for 24h. `suggestPick()` is the fallback:
  the team's best-ranked starting RB/WR/TE.
- `lib/store.js` — one Redis hash per week (`picks:<season>:<week>`), keyed by
  Sleeper roster id, so re-submitting just overwrites.
- `lib/auth.js` — one shared admin password in a cookie. Owners need no login;
  they identify themselves by choosing their team, which is remembered in
  `localStorage`.

Note: because the pick page is open, it runs on the honour system — anyone with
the link could submit for another team. The `/admin` override is your fix if
someone messes with a pick.
