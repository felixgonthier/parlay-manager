'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginForm({ title = 'League password' }) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    setBusy(false);
    if (res.ok) router.refresh();
    else setError((await res.json().catch(() => ({}))).error || 'Wrong password');
  }

  return (
    <form className="card" onSubmit={submit}>
      <label htmlFor="pw">{title}</label>
      <input
        id="pw"
        type="password"
        value={password}
        autoFocus
        onChange={(e) => setPassword(e.target.value)}
      />
      <button disabled={busy || !password}>{busy ? 'Checking…' : 'Enter'}</button>
      {error && <div className="msg err">{error}</div>}
    </form>
  );
}
