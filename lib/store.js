import fs from 'node:fs';
import path from 'node:path';
import { Redis } from '@upstash/redis';

// Works with either the Upstash-native env vars or the ones Vercel's
// Upstash/KV integration injects.
const url =
  process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const token =
  process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

export const redis = url && token ? new Redis({ url, token }) : null;

// Local fallback so `npm run dev` works before you've provisioned Redis.
// It's a file rather than a Map because Next serves dev requests from several
// worker processes, which don't share memory. Never used in production —
// deploys have Redis, and Vercel's filesystem is read-only anyway.
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
      'No Redis configured — connect Upstash for Redis in Vercel (Storage → ' +
        'Create Database).'
    );
  }
  // Deliberately unguarded: a write that fails must surface, not vanish.
  fs.writeFileSync(DEV_FILE, JSON.stringify(all, null, 2));
}

const picksKey = (season, week) => `picks:${season}:${week}`;

// One hash per week: field = roster_id, value = { playerId, playerName, ... }
export async function getPicks(season, week) {
  if (!redis) return devReadAll()[picksKey(season, week)] || {};

  const raw = (await redis.hgetall(picksKey(season, week))) || {};
  const out = {};
  for (const [rosterId, value] of Object.entries(raw)) {
    out[rosterId] = typeof value === 'string' ? JSON.parse(value) : value;
  }
  return out;
}

export async function setPick(season, week, rosterId, pick) {
  const key = picksKey(season, week);

  if (!redis) {
    const all = devReadAll();
    all[key] = { ...(all[key] || {}), [String(rosterId)]: pick };
    devWriteAll(all);
    return;
  }

  await redis.hset(key, { [String(rosterId)]: JSON.stringify(pick) });
}

export async function clearPick(season, week, rosterId) {
  const key = picksKey(season, week);

  if (!redis) {
    const all = devReadAll();
    if (all[key]) delete all[key][String(rosterId)];
    devWriteAll(all);
    return;
  }

  await redis.hdel(key, String(rosterId));
}

// Cache for the big Sleeper player dump and the weekly schedule.
export async function cacheGet(key) {
  if (!redis) return null;
  try {
    return await redis.get(key);
  } catch {
    return null;
  }
}

export async function cacheSet(key, value, ttlSeconds) {
  if (!redis) return;
  try {
    await redis.set(key, value, { ex: ttlSeconds });
  } catch {
    /* cache is best-effort */
  }
}
