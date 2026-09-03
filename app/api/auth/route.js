import { checkAdminPassword, ADMIN_COOKIE } from '@/lib/auth';

export async function POST(request) {
  const { password } = await request.json().catch(() => ({}));

  if (!checkAdminPassword((password || '').trim())) {
    return Response.json({ error: 'Wrong password' }, { status: 401 });
  }

  const res = Response.json({ ok: true });
  res.headers.set(
    'Set-Cookie',
    `${ADMIN_COOKIE}=${encodeURIComponent(process.env.ADMIN_PASSWORD)}; Path=/; Max-Age=${60 * 60 * 24 * 365}; HttpOnly; SameSite=Lax; Secure`
  );
  return res;
}
