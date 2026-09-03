import fs from 'node:fs';
import path from 'node:path';
import { createClient } from 'redis';

// Any Redis with a redis:// URL works — Vercel's Redis Cloud integration
// injects REDIS_URL, and Upstash exposes the same shape.
const url =
  process.env.REDIS_URL ||
  process.env.KV_URL ||
  process.env.UPSTASH_REDIS_URL ||
  null;

// One connection per server process, reused across requests. Cached on
// globalThis so dev's hot reload doesn't open a new one on every edit.
const globalForRedis = globalThis;

function connect() {
  if (!url) return null;
  if (globalForRedis.__parlayRedis) return globalForRedis.__parlayRedis;

  const client = createClient({ url });
  client.on('error', (err) => console.error('redis error', err.message));

  globalForRedis.__parlayRedis = client.connect().catch((err) => {
    // Don't cache a failed connection — the next request should retry.
    globalForRedis.__parlayRedis = null;
    throw err;
  });

  return globalForRedis.__parlayRedis;
}

export const hasRedis = Boolean(url);

// Local fallback so `npm run dev` works before you've provisioned Redis.
// It's a file rather than a Map because Next serves dev requests from several
// worker processes, which don't share memory.
const DEV_FILE = path.join(process.cwd(), '.picks.dev.json');

function devReadAll() {
  try {
    return JSON.parse(fs.readFileSync(DEV_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function devWriteAll(all) {
  // Checked here rather than at import, so `next build` still works without
  // Redis. A deploy with no Redis would silently drop every write and look
  // like the buttons do nothing, so say so instead.
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'No Redis configured — set REDIS_URL (Vercel → Storage → your Redis ' +
        'database → Connect to Project), then redeploy.'
    );
  }
  fs.writeFileSync(DEV_FILE, JSON.stringify(all, null, 2));
}

const picksKey = (season, week) => `picks:${season}:${week}`;

// One hash per week: field = roster_id, value = { playerId, playerName, ... }
export async function getPicks(season, week) {
  const key = picksKey(season, week);
  if (!hasRedis) return devReadAll()[key] || {};

  const client = await connect();
  const raw = (await client.hGetAll(key)) || {};
  const out = {};
  for (const [rosterId, value] of Object.entries(raw)) {
    out[rosterId] = JSON.parse(value);
  }
  return out;
}

export async function setPick(season, week, rosterId, pick) {
  const key = picksKey(season, week);

  if (!hasRedis) {
    const all = devReadAll();
    all[key] = { ...(all[key] || {}), [String(rosterId)]: pick };
    devWriteAll(all);
    return;
  }

  const client = await connect();
  await client.hSet(key, String(rosterId), JSON.stringify(pick));
}

export async function clearPick(season, week, rosterId) {
  const key = picksKey(season, week);

  if (!hasRedis) {
    const all = devReadAll();
    if (all[key]) delete all[key][String(rosterId)];
    devWriteAll(all);
    return;
  }

  const client = await connect();
  await client.hDel(key, String(rosterId));
}

// Cache for the big Sleeper player dump and the weekly schedule. Best-effort:
// a cache miss just means another call to Sleeper. node-redis stores strings,
// so these serialize by hand.
export async function cacheGet(key) {
  if (!hasRedis) return null;
  try {
    const client = await connect();
    const raw = await client.get(key);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    console.error('cache read failed', err.message);
    return null;
  }
}

export async function cacheSet(key, value, ttlSeconds) {
  if (!hasRedis) return;
  try {
    const client = await connect();
    await client.set(key, JSON.stringify(value), { EX: ttlSeconds });
  } catch (err) {
    console.error('cache write failed', err.message);
  }
}
