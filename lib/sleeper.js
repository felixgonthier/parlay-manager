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

// Days of the week we'll accept, as getUTCDay() values: Sunday and Monday.
const SLATE_DAYS = { 0: '', 1: ' · Mon' };

// The schedule lives outside /v1 and its dates are already US-local, so a
// Sunday night game reads as Sunday and a Monday nighter as Monday.
// Returns { opponents: { [nflTeam]: label }, sundayDate: 'YYYY-MM-DD' } for
// that week's slate, or null if the schedule can't be read — in which case we
// show everyone rather than an empty dropdown, and never lock.
async function getSlate(season, week) {
  const cacheKey = `schedule:${season}:${week}:v3`;
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

  const opponents = {};
  const sundays = [];
  for (const g of games) {
    if (g.week !== Number(week)) continue;
    // Parsed as UTC midnight, so getUTCDay() reads the date as written.
    const weekday = new Date(`${g.date}T00:00:00Z`).getUTCDay();
    const day = SLATE_DAYS[weekday];
    if (day === undefined) continue;
    if (weekday === 0) sundays.push(g.date);
    opponents[g.home] = `vs ${g.away}${day}`;
    opponents[g.away] = `@ ${g.home}${day}`;
  }

  if (!Object.keys(opponents).length) return null;

  const slate = { opponents, sundayDate: sundays.sort()[0] || null };
  await cacheSet(cacheKey, slate, 60 * 60 * 6);
  return slate;
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
// players. Pass the Sleeper state to drop players whose NFL team isn't on that
// week's Sunday/Monday slate (byes, and Wed/Thu/Fri/Sat games).
export async function getLeagueTeams(state) {
  const [users, rosters, players, slateData] = await Promise.all([
    j(`/league/${LEAGUE_ID}/users`),
    j(`/league/${LEAGUE_ID}/rosters`),
    getPlayers(),
    state ? getSlate(state.season, state.week) : null,
  ]);

  const slate = slateData?.opponents || null;

  const userById = Object.fromEntries(users.map((u) => [u.user_id, u]));

  return rosters
    .map((r) => {
      const user = userById[r.owner_id] || {};
      const starters = new Set(r.starters || []);
      const eligible = (r.players || [])
        .filter((id) => players[id])
        .filter((id) => !slate || slate[players[id].team])
        .map((id) => ({
          id,
          ...players[id],
          starter: starters.has(id),
          opponent: slate ? slate[players[id].team] : null,
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
// Today's date and hour in New York, without any UTC-offset arithmetic.
function nowInET(now) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (t) => parts.find((p) => p.type === t).value;
  return { date: `${get('year')}-${get('month')}-${get('day')}`, hour: Number(get('hour')) };
}

// Picks close at LOCK_SUNDAY_HOUR_ET on the Sunday of that week's slate — not
// on every Sunday, which would lock the app during the days before week 1 and
// on any Sunday the league isn't playing. Unset the env var to never lock.
// Fails open: no schedule, no lock.
export async function isLocked(state, now = new Date()) {
  const hour = process.env.LOCK_SUNDAY_HOUR_ET;
  if (!hour || !state) return false;

  const slate = await getSlate(state.season, state.week);
  if (!slate?.sundayDate) return false;

  const et = nowInET(now);
  if (et.date > slate.sundayDate) return true;
  return et.date === slate.sundayDate && et.hour >= Number(hour);
}
