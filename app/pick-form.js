'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

const STORAGE_KEY = 'wp_roster_id';
const POSITION_ORDER = ['RB', 'WR', 'TE', 'QB'];

function label(p) {
  return [
    `${p.name}${p.team ? ` (${p.team})` : ''}`,
    p.starter ? 'starter' : null,
    p.status || null,
  ]
    .filter(Boolean)
    .join(' • ');
}

export default function PickForm({ teams, picks: initialPicks, locked }) {
  const router = useRouter();
  const [rosterId, setRosterId] = useState('');
  const [playerId, setPlayerId] = useState('');
  const [picks, setPicks] = useState(initialPicks);
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);

  // Remember which team you are, so you never pick it twice.
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && teams.some((t) => String(t.rosterId) === saved)) setRosterId(saved);
  }, [teams]);

  const team = teams.find((t) => String(t.rosterId) === rosterId);
  const existing = picks[rosterId];

  function selectTeam(id) {
    setRosterId(id);
    setPlayerId('');
    setStatus(null);
    if (id) localStorage.setItem(STORAGE_KEY, id);
    else localStorage.removeItem(STORAGE_KEY);
  }

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setStatus(null);
    const res = await fetch('/api/picks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rosterId, playerId }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) {
      setPicks(data.picks);
      setPlayerId('');
      setStatus({ ok: true, text: 'Pick saved. You can change it until kickoff.' });
      router.refresh(); // keep the table below in sync
    } else {
      setStatus({ ok: false, text: data.error || 'Something went wrong' });
    }
  }

  if (locked) {
    return (
      <div className="msg err">
        Picks are locked for this week. Submissions reopen after the games.
      </div>
    );
  }

  const groups = POSITION_ORDER.map((position) => ({
    position,
    players: (team?.players || []).filter((p) => p.position === position),
  })).filter((g) => g.players.length);

  return (
    <form className="card" onSubmit={submit}>
      {team ? (
        <div className="whoami">
          <span>
            Picking for <strong>{team.teamName}</strong>
          </span>
          <button type="button" className="link" onClick={() => selectTeam('')}>
            Not you?
          </button>
        </div>
      ) : (
        <>
          <label htmlFor="team">Your team</label>
          <select id="team" value={rosterId} onChange={(e) => selectTeam(e.target.value)}>
            <option value="">Select your team…</option>
            {teams.map((t) => (
              <option key={t.rosterId} value={t.rosterId}>
                {t.teamName} ({t.owner}){picks[t.rosterId] ? ' ✓' : ''}
              </option>
            ))}
          </select>
        </>
      )}

      {existing && (
        <div className="msg ok">
          Current pick: <strong>{existing.playerName}</strong> — pick again to change it.
        </div>
      )}

      <label htmlFor="player">Player to score an anytime TD</label>
      <select
        id="player"
        value={playerId}
        disabled={!team}
        onChange={(e) => setPlayerId(e.target.value)}
      >
        <option value="">{team ? 'Select a player…' : 'Pick your team first'}</option>
        {groups.map((g) => (
          <optgroup key={g.position} label={g.position}>
            {g.players.map((p) => (
              <option key={p.id} value={p.id}>
                {label(p)}
              </option>
            ))}
          </optgroup>
        ))}
      </select>

      <button disabled={busy || !rosterId || !playerId}>
        {busy ? 'Saving…' : 'Submit pick'}
      </button>

      {status && <div className={`msg ${status.ok ? 'ok' : 'err'}`}>{status.text}</div>}
    </form>
  );
}
