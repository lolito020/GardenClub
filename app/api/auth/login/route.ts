import { NextRequest, NextResponse } from 'next/server';
import { signIn, COOKIE_NAME } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();
    const result = await signIn(email, password);
    
    if (!result) {
      return NextResponse.json({ ok: false, msg: 'Credenciales inválidas' }, { status: 401 });
    }
    
    // Create response and set cookie using NextResponse
    const response = NextResponse.json({ ok: true, user: result.user });
    response.cookies.set(COOKIE_NAME, result.token, { 
      httpOnly: true, 
      sameSite: 'lax', 
      path: '/', 
      maxAge: 8 * 60 * 60 
    });
    
    return response;
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json({ ok: false, msg: 'Error interno' }, { status: 500 });
  }
}