import { cacheGet, cacheSet } from './store';

const BASE = 'https://api.sleeper.app/v1';
export const LEAGUE_ID = process.env.SLEEPER_LEAGUE_ID || '1389734249816428544';

// Anytime-TD (rush or receive) is only realistic for these.
export const TD_POSITIONS = ['RB', 'WR', 'TE', 'QB'];

async function j(path) {
  const res = await fetch(`${BASE}${path}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Sleeper ${path} -> ${res.status}`);
  return res.json();
}

export function getState() {
  return j('/state/nfl');
}

// The schedule lives outside /v1 and its dates are already US-local, so a
// Sunday night game reads as Sunday and a Monday nighter as Monday.
// Returns { [nflTeam]: opponentLabel } for Sunday games only, or null if the
// schedule can't be read — in which case we fall back to showing everyone
// rather than an empty dropdown.
async function getSundayOpponents(season, week) {
  const cacheKey = `schedule:${season}:${week}:v1`;
  const cached = await cacheGet(cacheKey);
  if (cached) return cached;

  let games;
  try {
    const res = await fetch(
      `https://api.sleeper.app/schedule/nfl/regular/${season}`,
      { cache: 'no-store' }
    );
    if (!res.ok) return null;
    games = await res.json();
  } catch {
    return null;
  }

  const map = {};
  for (const g of games) {
    if (g.week !== Number(week)) continue;
    // Parsed as UTC midnight, so getUTCDay() reads the date as written.
    if (new Date(`${g.date}T00:00:00Z`).getUTCDay() !== 0) continue;
    map[g.home] = `vs ${g.away}`;
    map[g.away] = `@ ${g.home}`;
  }

  if (!Object.keys(map).length) return null;
  await cacheSet(cacheKey, map, 60 * 60 * 6);
  return map;
}

// The full player dump is ~5MB, so trim it to the fields we need and keep the
// trimmed version in Redis for a day.
async function getPlayers() {
  const cached = await cacheGet('players:nfl:v1');
  if (cached) return cached;

  const all = await j('/players/nfl');
  const slim = {};
  for (const [id, p] of Object.entries(all)) {
    if (!TD_POSITIONS.includes(p.position)) continue;
    slim[id] = {
      name: p.full_name || `${p.first_name} ${p.last_name}`,
      position: p.position,
      team: p.team,
      rank: p.search_rank ?? 999999,
      status: p.injury_status || null,
    };
  }
  await cacheSet('players:nfl:v1', slim, 60 * 60 * 24);
  return slim;
}

// Everything the UI needs: one team per league member, with their eligible
// players. Pass the Sleeper state to drop players whose NFL team isn't playing
// on the Sunday of that week (byes, and Thu/Sat/Mon games).
export async function getLeagueTeams(state) {
  const [users, rosters, players, sunday] = await Promise.all([
    j(`/league/${LEAGUE_ID}/users`),
    j(`/league/${LEAGUE_ID}/rosters`),
    getPlayers(),
    state ? getSundayOpponents(state.season, state.week) : null,
  ]);

  const userById = Object.fromEntries(users.map((u) => [u.user_id, u]));

  return rosters
    .map((r) => {
      const user = userById[r.owner_id] || {};
      const starters = new Set(r.starters || []);
      const eligible = (r.players || [])
        .filter((id) => players[id])
        .filter((id) => !sunday || sunday[players[id].team])
        .map((id) => ({
          id,
          ...players[id],
          starter: starters.has(id),
          opponent: sunday ? sunday[players[id].team] : null,
        }))
        .sort(
          (a, b) =>
            Number(b.starter) - Number(a.starter) || a.rank - b.rank
        );

      return {
        rosterId: r.roster_id,
        teamName:
          user.metadata?.team_name || user.display_name || `Team ${r.roster_id}`,
        owner: user.display_name || 'unknown',
        players: eligible,
      };
    })
    .sort((a, b) => a.teamName.localeCompare(b.teamName));
}

// Fallback used for teams that never submitted: their best non-QB starter.
export function suggestPick(team) {
  const pool = team.players.filter((p) => p.position !== 'QB');
  return pool.find((p) => p.starter) || pool[0] || team.players[0] || null;
}

// Picks close Sunday at LOCK_SUNDAY_HOUR_ET, if that env var is set.
export function isLocked(now = new Date()) {
  const hour = process.env.LOCK_SUNDAY_HOUR_ET;
  if (!hour) return false;
  const et = new Date(
    now.toLocaleString('en-US', { timeZone: 'America/New_York' })
  );
  return et.getDay() === 0 && et.getHours() >= Number(hour);
}
