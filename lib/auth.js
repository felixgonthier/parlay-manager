import { cookies } from 'next/headers';

export const ADMIN_COOKIE = 'wp_admin';

const adminPassword = () => process.env.ADMIN_PASSWORD || '';

export async function isAdmin() {
  const pw = adminPassword();
  if (!pw) return false;
  const c = await cookies();
  return c.get(ADMIN_COOKIE)?.value === pw;
}

export function checkAdminPassword(password) {
  return Boolean(adminPassword()) && password === adminPassword();
}
