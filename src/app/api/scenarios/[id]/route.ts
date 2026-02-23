import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, AuthError } from '@/lib/auth-api';


export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Require authentication for reading scenarios
    const { session } = await requireAuth();
    const userOrgId = session.user.orgId;

    const { id } = await params;
    const scenario = await prisma.scenario.findUnique({
      where: { id },
      include: { jobTitle: { select: { id: true, name: true } } },
    });
    if (!scenario) {
      return NextResponse.json({ error: 'Scenario not found' }, { status: 404 });
    }
    // Multi-tenancy: verify user can access (same org or global)
    if (scenario.orgId && scenario.orgId !== userOrgId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }
    return NextResponse.json(scenario);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[scenarios/[id]] GET failed:', error);
    return NextResponse.json({ error: 'Failed to fetch scenario' }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Require admin role for updating scenarios
    const { session } = await requireAuth(request, 'ADMIN');
    const userOrgId = session.user.orgId;

    const { id } = await params;

    // Verify ownership: must belong to user's org or be global
    const existing = await prisma.scenario.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Scenario not found' }, { status: 404 });
    }
    if (existing.orgId && existing.orgId !== userOrgId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const body = await request.json();
    await prisma.scenario.update({
      where: { id },
      data: {
        name: body.name,
        description: body.description ?? null,
        type: body.type,
        script: body.script ?? {},
      },
    });
    // PrismaNeonHTTP does not support implicit transactions;
    // fetch relations separately after update.
    const scenario = await prisma.scenario.findUnique({
      where: { id },
      include: { jobTitle: { select: { id: true, name: true } } },
    });
    return NextResponse.json(scenario);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[scenarios/[id]] PUT failed:', error);
    return NextResponse.json({ error: 'Failed to update scenario' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Require admin role for deleting scenarios
    const { session } = await requireAuth(request, 'ADMIN');
    const userOrgId = session.user.orgId;

    const { id } = await params;

    // Verify ownership: must belong to user's org or be global
    const existing = await prisma.scenario.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Scenario not found' }, { status: 404 });
    }
    if (existing.orgId && existing.orgId !== userOrgId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    await prisma.scenario.delete({ where: { id } });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[scenarios/[id]] DELETE failed:', error);
    return NextResponse.json({ error: 'Failed to delete scenario' }, { status: 500 });
  }
}
