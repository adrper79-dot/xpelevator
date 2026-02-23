
/**
 * GET  /api/orgs  — list all organizations (admin only)
 * POST /api/orgs  — create a new organization (admin only)
 */
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, AuthError } from '@/lib/auth-api';


export async function GET() {
  try {
    // Require admin role for listing organizations
    await requireAuth(undefined, 'ADMIN');

    const orgs = await prisma.organization.findMany({
      include: {
        _count: { select: { users: true, sessions: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(orgs);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Failed to list organizations:', error);
    return NextResponse.json({ error: 'Failed to list organizations' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    // Require admin role for creating organizations
    await requireAuth(request, 'ADMIN');

    const body = (await request.json()) as { name: string; slug?: string };

    if (!body.name?.trim()) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }

    // Auto-generate slug if not provided
    const slug =
      body.slug?.trim() ??
      body.name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');

    const org = await prisma.organization.create({
      data: { name: body.name.trim(), slug },
    });

    return NextResponse.json(org, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Failed to create organization:', error);
    return NextResponse.json({ error: 'Failed to create organization' }, { status: 500 });
  }
}
