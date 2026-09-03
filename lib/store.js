import { Redis } from '@upstash/redis';

// Works with either the Upstash-native env vars or the ones Vercel's
// Upstash/KV integration injects.
const url =
  process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const token =
  process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

export const redis = url && token ? new Redis({ url, token }) : null;

// Fallback so `npm run dev` works before you've provisioned Redis.
// Not persistent — every deploy needs the real thing.
const memory = new Map();

const picksKey = (season, week) => `picks:${season}:${week}`;

// One hash per week: field = roster_id, value = { player_id, player_name, ... }
export async function getPicks(season, week) {
  if (!redis) return { ...(memory.get(picksKey(season, week)) || {}) };

  const raw = (await redis.hgetall(picksKey(season, week))) || {};
  const out = {};
  for (const [rosterId, value] of Object.entries(raw)) {
    out[rosterId] = typeof value === 'string' ? JSON.parse(value) : value;
  }
  return out;
}

export async function setPick(season, week, rosterId, pick) {
  if (!redis) {
    const key = picksKey(season, week);
    memory.set(key, { ...(memory.get(key) || {}), [String(rosterId)]: pick });
    return;
  }
  await redis.hset(picksKey(season, week), {
    [String(rosterId)]: JSON.stringify(pick),
  });
}

export async function clearPick(season, week, rosterId) {
  if (!redis) {
    const key = picksKey(season, week);
    const current = { ...(memory.get(key) || {}) };
    delete current[String(rosterId)];
    memory.set(key, current);
    return;
  }
  await redis.hdel(picksKey(season, week), String(rosterId));
}

// Cache for the big Sleeper player dump.
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
