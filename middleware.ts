import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  try {
    console.log(`[Middleware] Processing request for: ${pathname}`);
    
    // Check setup mode by calling the API route instead of importing Node.js modules
    const checkUrl = new URL('/api/users/check', request.url);
    const response = await fetch(checkUrl.toString());
    
    if (!response.ok) {
      console.error('[Middleware] Failed to check setup mode, assuming setup mode');
      // In case of error, assume setup mode and redirect to admin
      if (pathname === '/' || pathname === '/login') {
        console.log('[Middleware] Error occurred, redirecting to /admin');
        return NextResponse.redirect(new URL('/admin', request.url));
      }
      return NextResponse.next();
    }
    
    const data = await response.json();
    const setupMode = data.userCount === 0;
    
    console.log(`[Middleware] Setup mode: ${setupMode}, User count: ${data.userCount}`);
    
    // Si estamos en modo setup (sin usuarios)
    if (setupMode) {
      console.log('[Middleware] In setup mode');
      // Redirigir / y /login a /admin
      if (pathname === '/' || pathname === '/login') {
        console.log(`[Middleware] Redirecting ${pathname} to /admin (setup mode)`);
        return NextResponse.redirect(new URL('/admin', request.url));
      }
      // Permitir acceso a todas las demás rutas en modo setup
      console.log(`[Middleware] Allowing access to ${pathname} in setup mode`);
      return NextResponse.next();
    }
    
    // Si NO estamos en modo setup (hay usuarios)
    console.log('[Middleware] Not in setup mode (users exist)');
    // Redirigir / a /login
    if (pathname === '/') {
      console.log('[Middleware] Redirecting / to /login (normal mode)');
      return NextResponse.redirect(new URL('/login', request.url));
    }
    
    console.log(`[Middleware] Allowing access to ${pathname}`);
    return NextResponse.next();
  } catch (error) {
    console.error('[Middleware] Error occurred:', error);
    // En caso de error, asumir modo setup y redirigir a admin
    if (pathname === '/' || pathname === '/login') {
      console.log('[Middleware] Error fallback, redirecting to /admin');
      return NextResponse.redirect(new URL('/admin', request.url));
    }
    return NextResponse.next();
  }
}

export const config = {
  matcher: ['/', '/login']
};