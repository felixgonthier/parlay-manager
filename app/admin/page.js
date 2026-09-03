import { isAdmin } from '@/lib/auth';
import { getState, getLeagueTeams, suggestPick, isLocked } from '@/lib/sleeper';
import { getPicks } from '@/lib/store';
import LoginForm from '../login-form';
import AdminTable from './admin-table';

export const dynamic = 'force-dynamic';

export default async function Admin() {
  if (!(await isAdmin())) {
    return (
      <>
        <h1>Admin</h1>
        <p className="sub">Enter the admin password.</p>
        <LoginForm title="Admin password" />
      </>
    );
  }

  const state = await getState();
  const [teams, picks] = await Promise.all([
    getLeagueTeams(),
    getPicks(state.season, state.week),
  ]);

  // suggestPick lives server-side, so resolve the fallback here.
  const withSuggestions = teams.map((t) => ({ ...t, suggested: suggestPick(t) }));

  return (
    <>
      <h1>Week {state.week} admin</h1>
      <AdminTable teams={withSuggestions} picks={picks} />
      <p className="sub" style={{ marginTop: 24 }}>
        Picks are {isLocked() ? 'locked' : 'open'} for the league. Your overrides here
        work either way.
      </p>
    </>
  );
}
