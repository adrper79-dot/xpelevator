
/**
 * GET    /api/orgs/[id]  — get organization details with member count
 * PUT    /api/orgs/[id]  — update org name / plan
 * DELETE /api/orgs/[id]  — delete organization (only if no sessions)
 */
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, AuthError } from '@/lib/auth-api';


export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Require admin role for viewing org details
    await requireAuth(request, 'ADMIN');

    const { id } = await params;
    const org = await prisma.organization.findUnique({
      where: { id },
      include: {
        users: { select: { id: true, email: true, name: true, role: true, createdAt: true } },
        _count: { select: { sessions: true, jobTitles: true, scenarios: true } },
      },
    });

    if (!org) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }

    return NextResponse.json(org);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Failed to get organization:', error);
    return NextResponse.json({ error: 'Failed to get organization' }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Require admin role for updating orgs
    await requireAuth(request, 'ADMIN');

    const { id } = await params;
    const body = (await request.json()) as { name?: string; plan?: string };

    const org = await prisma.organization.update({
      where: { id },
      data: {
        ...(body.name ? { name: body.name } : {}),
        ...(body.plan ? { plan: body.plan as 'FREE' | 'PRO' | 'ENTERPRISE' } : {}),
      },
    });

    return NextResponse.json(org);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Failed to update organization:', error);
    return NextResponse.json({ error: 'Failed to update organization' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Require admin role for deleting orgs
    await requireAuth(request, 'ADMIN');

    const { id } = await params;

    // Safety check — refuse if org has sessions
    const sessionCount = await prisma.simulationSession.count({
      where: { orgId: id },
    });
    if (sessionCount > 0) {
      return NextResponse.json(
        { error: `Cannot delete: org has ${sessionCount} session(s)` },
        { status: 409 }
      );
    }

    await prisma.organization.delete({ where: { id } });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Failed to delete organization:', error);
    return NextResponse.json({ error: 'Failed to delete organization' }, { status: 500 });
  }
}
