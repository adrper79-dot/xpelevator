
/**
 * GET    /api/orgs/[id]/members  — list members of an org
 * POST   /api/orgs/[id]/members  — invite a user by email (creates User record if new)
 * DELETE /api/orgs/[id]/members  — remove a user from the org (body: { userId })
 */
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, AuthError } from '@/lib/auth-api';


export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Require admin role for listing org members
    await requireAuth(request, 'ADMIN');

    const { id } = await params;
    const members = await prisma.user.findMany({
      where: { orgId: id },
      select: { id: true, email: true, name: true, role: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
    return NextResponse.json(members);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Failed to list members:', error);
    return NextResponse.json({ error: 'Failed to list members' }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Require admin role for adding org members
    await requireAuth(request, 'ADMIN');

    const { id: orgId } = await params;
    const body = (await request.json()) as { email: string; name?: string; role?: string };

    if (!body.email?.trim()) {
      return NextResponse.json({ error: 'email is required' }, { status: 400 });
    }

    // Upsert user — create if new, update orgId if existing
    const user = await prisma.user.upsert({
      where: { email: body.email.trim().toLowerCase() },
      create: {
        email: body.email.trim().toLowerCase(),
        name: body.name?.trim(),
        orgId,
        role: (body.role as 'ADMIN' | 'MEMBER') ?? 'MEMBER',
      },
      update: {
        orgId,
        ...(body.role ? { role: body.role as 'ADMIN' | 'MEMBER' } : {}),
      },
    });

    return NextResponse.json(user, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Failed to add member:', error);
    return NextResponse.json({ error: 'Failed to add member' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Require admin role for removing org members
    await requireAuth(request, 'ADMIN');

    const { id: orgId } = await params;
    const { userId } = (await request.json()) as { userId: string };

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    // Remove org association (don't delete the user record)
    const user = await prisma.user.findFirst({ where: { id: userId, orgId } });
    if (!user) {
      return NextResponse.json({ error: 'User not found in this org' }, { status: 404 });
    }

    await prisma.user.update({
      where: { id: userId },
      data: { orgId: null },
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Failed to remove member:', error);
    return NextResponse.json({ error: 'Failed to remove member' }, { status: 500 });
  }
}
