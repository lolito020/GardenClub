import { NextResponse } from 'next/server';
import { COOKIE_NAME } from '@/lib/auth';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

export async function POST() {
  cookies().set(COOKIE_NAME, '', { path: '/', maxAge: 0 });
  return NextResponse.json({ ok: true });
}