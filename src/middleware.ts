/**
 * Next.js middleware — protects training routes behind authentication.
 *
 * Unauthenticated users are redirected to /auth/signin.
 * Public routes (home, API, auth itself) pass through freely.
 */
import { auth } from '@/auth';
import { NextResponse } from 'next/server';

export default auth(req => {
  const { pathname } = req.nextUrl;
  const isSignedIn = !!req.auth;

  // Routes that require authentication
  const protectedPrefixes = ['/simulate', '/sessions', '/analytics'];
  const needsAuth = protectedPrefixes.some(p => pathname.startsWith(p));

  if (needsAuth && !isSignedIn) {
    const signInUrl = new URL('/auth/signin', req.url);
    signInUrl.searchParams.set('callbackUrl', req.url);
    return NextResponse.redirect(signInUrl);
  }

  return NextResponse.next();
});

export const config = {
  // Run on relevant pages; exclude static files, Next.js internals, and auth routes
  matcher: [
    '/simulate/:path*',
    '/sessions/:path*',
    '/analytics/:path*',
    '/admin/:path*',
  ],
};
