import { NextResponse } from 'next/server';
import { NextRequest } from 'next/server';
import { requireAuth, isSetupMode } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    if (await isSetupMode()) {
      return NextResponse.json({
        ok: true,
        user: { rol: 'admin', nombre: 'Administrador (setup)', email: 'setup@local' },
        setup: true
      });
    }
    
    const user = await requireAuth(request);
    if (!user) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }
    
    return NextResponse.json({ ok: true, user, setup: false });
  } catch (error) {
    console.error('Profile API error:', error);
    return NextResponse.json({ ok: false, error: 'profile_failed' }, { status: 500 });
  }
}