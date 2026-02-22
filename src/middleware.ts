/**
 * Next.js middleware — protects admin routes from unauthenticated access.
 *
 * Uses a lightweight cookie check (no heavy JWT verification) to keep the
 * middleware small and fast in CF Workers edge runtime.
 * Routes: / and all public API routes remain fully accessible.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export default function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith('/admin')) {
    // NextAuth v5 sets authjs.session-token (http) or __Secure-authjs.session-token (https)
    const sessionToken =
      req.cookies.get('authjs.session-token') ??
      req.cookies.get('__Secure-authjs.session-token');

    if (!sessionToken) {
      const signInUrl = new URL('/auth/signin', req.url);
      signInUrl.searchParams.set('callbackUrl', req.url);
      return NextResponse.redirect(signInUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin', '/admin/:path*'],
};
