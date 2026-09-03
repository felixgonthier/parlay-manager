import { getState, getLeagueTeams, isLocked } from '@/lib/sleeper';
import { getPicks } from '@/lib/store';
import PickForm from './pick-form';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const state = await getState();
  const [teams, picks] = await Promise.all([
    getLeagueTeams(state),
    getPicks(state.season, state.week),
  ]);

  const submitted = Object.keys(picks).length;

  return (
    <>
      <h1>Week {state.week} — pick your TD scorer</h1>
      <p className="sub">
        One player from your roster who you think scores a rushing or receiving TD —
        QBs count too, on a rushing TD. Only players in the Sunday and Monday
        games are listed. They all go into one parlay. {submitted}/{teams.length}{' '}
        teams in.
      </p>

      <PickForm teams={teams} picks={picks} locked={isLocked()} />

      <h2>Picks so far</h2>
      <table>
        <thead>
          <tr>
            <th>Team</th>
            <th>Pick</th>
          </tr>
        </thead>
        <tbody>
          {teams.map((t) => {
            const pick = picks[t.rosterId];
            return (
              <tr key={t.rosterId}>
                <td>{t.teamName}</td>
                {pick ? (
                  <td>
                    {pick.playerName} <span className="muted">{pick.nflTeam}</span>
                  </td>
                ) : (
                  <td className="muted">—</td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}
