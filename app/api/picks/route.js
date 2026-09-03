import { getState, getLeagueTeams, isLocked } from '@/lib/sleeper';
import { getPicks, setPick } from '@/lib/store';

// Open to anyone with the link — owners identify themselves by choosing
// their team. No password.
export async function POST(request) {
  if (isLocked()) {
    return Response.json({ error: 'Picks are locked for this week' }, { status: 403 });
  }

  const { rosterId, playerId } = await request.json().catch(() => ({}));
  if (!rosterId || !playerId) {
    return Response.json({ error: 'Pick a team and a player' }, { status: 400 });
  }

  try {
    const state = await getState();
    const teams = await getLeagueTeams(state);
    const team = teams.find((t) => String(t.rosterId) === String(rosterId));
    const player = team?.players.find((p) => p.id === String(playerId));
    if (!player) {
      return Response.json(
        { error: 'That player is not on that roster' },
        { status: 400 }
      );
    }

    await setPick(state.season, state.week, rosterId, {
      playerId: player.id,
      playerName: player.name,
      position: player.position,
      nflTeam: player.team,
      teamName: team.teamName,
      owner: team.owner,
      source: 'owner',
      submittedAt: new Date().toISOString(),
    });

    const picks = await getPicks(state.season, state.week);
    return Response.json({ ok: true, picks });
  } catch (err) {
    console.error('pick failed', err);
    return Response.json(
      { error: `Could not save: ${err.message}` },
      { status: 500 }
    );
  }
}
