// middleware.ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export const config = {
  // Aplica solo a / y /login (deja fuera _next, api, etc.)
  matcher: ['/', '/login'],
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // ✅ Nunca interceptar assets ni APIs (defensa adicional)
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname === '/favicon.ico' ||
    pathname === '/robots.txt' ||
    pathname === '/sitemap.xml'
  ) {
    return NextResponse.next()
  }

  try {
    // Chequear modo setup mediante la API
    const checkUrl = new URL('/api/users/check', request.url)
    const res = await fetch(checkUrl.toString(), { cache: 'no-store' })

    if (!res.ok) {
      // ❗ Si falla la API, NO redirijas /login. Deja pasar /login.
      if (pathname === '/') {
        const url = request.nextUrl.clone()
        url.pathname = '/login'
        return NextResponse.redirect(url)
      }
      return NextResponse.next()
    }

    const data = await res.json()
    const setupMode = data.userCount === 0

    if (setupMode) {
      // En setup: / y /login → /admin
      if (pathname === '/' || pathname === '/login') {
        const url = request.nextUrl.clone()
        url.pathname = '/admin'
        return NextResponse.redirect(url)
      }
      return NextResponse.next()
    }

    // No setup: / → /login, pero /login debe cargar
    if (pathname === '/') {
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      return NextResponse.redirect(url)
    }

    // Si ya estás en /login, permitir
    return NextResponse.next()
  } catch {
    // ❗ Fallback seguro: nunca redirigir /login en error
    if (pathname === '/') {
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      return NextResponse.redirect(url)
    }
    return NextResponse.next()
  }
}
