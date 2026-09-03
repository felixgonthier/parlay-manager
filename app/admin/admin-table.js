'use client';

import { useState } from 'react';

const POSITION_ORDER = ['RB', 'WR', 'TE', 'QB'];

function playerLabel(p) {
  const game = [p.team, p.opponent].filter(Boolean).join(' ');
  return `${p.name}${game ? ` (${game})` : ''}${p.starter ? ' • starter' : ''}`;
}

function groupPlayers(players) {
  return POSITION_ORDER.map((position) => ({
    position,
    players: players.filter((p) => p.position === position),
  })).filter((g) => g.players.length);
}

export default function AdminTable({ teams, picks: initialPicks }) {
  const [picks, setPicks] = useState(initialPicks);
  const [drafts, setDrafts] = useState({});
  const [busyRoster, setBusyRoster] = useState(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  // A team with no submitted pick falls back to its best starter.
  const rows = teams.map((t) => {
    const pick = picks[t.rosterId];
    return {
      team: t,
      name: pick?.playerName ?? t.suggested?.name ?? null,
      nflTeam: pick?.nflTeam ?? t.suggested?.team ?? null,
      source: pick ? pick.source || 'owner' : 'auto',
    };
  });

  const parlay = rows
    .filter((r) => r.name)
    .map(
      (r) =>
        `${r.name} (${r.nflTeam}) — ${r.team.teamName}${
          r.source === 'auto' ? ' [auto]' : ''
        }`
    )
    .join('\n');

  const submitted = rows.filter((r) => r.source !== 'auto').length;

  async function save(rosterId, playerId) {
    setBusyRoster(rosterId);
    setError('');
    const res = await fetch('/api/admin/pick', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rosterId, playerId: playerId || null }),
    });
    const data = await res.json().catch(() => ({}));
    setBusyRoster(null);
    if (res.ok) {
      setPicks(data.picks);
      setDrafts((d) => ({ ...d, [rosterId]: '' }));
    } else {
      setError(data.error || 'Could not save that pick');
    }
  }

  async function copy() {
    await navigator.clipboard.writeText(parlay);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <>
      <p className="sub">
        {submitted}/{teams.length} teams have a pick. Anyone missing is auto-filled
        with their best starter — override or clear any row below.
      </p>

      {error && <div className="msg err">{error}</div>}

      <table>
        <thead>
          <tr>
            <th>Team</th>
            <th>Pick</th>
            <th>Override</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const id = r.team.rosterId;
            const busy = busyRoster === id;
            return (
              <tr key={id}>
                <td>
                  {r.team.teamName}
                  <br />
                  <span className="muted">
                    {r.source === 'auto'
                      ? 'no submission'
                      : r.source === 'admin'
                        ? 'set by you'
                        : 'submitted'}
                  </span>
                </td>
                <td className="pick">
                  {r.name || '—'} <span className="muted">{r.nflTeam}</span>
                </td>
                <td>
                  <div className="row-actions">
                    <select
                      value={drafts[id] || ''}
                      disabled={busy}
                      onChange={(e) => {
                        const playerId = e.target.value;
                        setDrafts((d) => ({ ...d, [id]: playerId }));
                        if (playerId) save(id, playerId);
                      }}
                    >
                      <option value="">Change to…</option>
                      {groupPlayers(r.team.players).map((g) => (
                        <optgroup key={g.position} label={g.position}>
                          {g.players.map((p) => (
                            <option key={p.id} value={p.id}>
                              {playerLabel(p)}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                    {picks[id] && (
                      <button
                        type="button"
                        className="secondary"
                        disabled={busy}
                        onClick={() => save(id, null)}
                        title="Clear the pick and fall back to their best starter"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <h2>Parlay legs</h2>
      <pre>{parlay || 'Nothing yet.'}</pre>
      <button onClick={copy}>{copied ? 'Copied!' : 'Copy parlay list'}</button>
    </>
  );
}
