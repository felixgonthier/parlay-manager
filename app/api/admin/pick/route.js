import { isAdmin } from '@/lib/auth';
import { getState, getLeagueTeams } from '@/lib/sleeper';
import { getPicks, setPick, clearPick } from '@/lib/store';

// Admin override: set any team's pick to any player on their roster, or clear
// it back to the auto-filled suggestion. Ignores the weekly lock on purpose.
export async function POST(request) {
  if (!(await isAdmin())) {
    return Response.json({ error: 'Not signed in as admin' }, { status: 401 });
  }

  const { rosterId, playerId } = await request.json().catch(() => ({}));
  if (!rosterId) {
    return Response.json({ error: 'Missing team' }, { status: 400 });
  }

  const state = await getState();

  if (!playerId) {
    await clearPick(state.season, state.week, rosterId);
    const picks = await getPicks(state.season, state.week);
    return Response.json({ ok: true, picks });
  }

  const teams = await getLeagueTeams();
  const team = teams.find((t) => String(t.rosterId) === String(rosterId));
  const player = team?.players.find((p) => p.id === String(playerId));
  if (!player) {
    return Response.json({ error: 'That player is not on that roster' }, { status: 400 });
  }

  await setPick(state.season, state.week, rosterId, {
    playerId: player.id,
    playerName: player.name,
    position: player.position,
    nflTeam: player.team,
    teamName: team.teamName,
    owner: team.owner,
    source: 'admin',
    submittedAt: new Date().toISOString(),
  });

  const picks = await getPicks(state.season, state.week);
  return Response.json({ ok: true, picks });
}
