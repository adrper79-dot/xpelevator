import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, getAuthOrNull, AuthError } from '@/lib/auth-api';


// GET /api/scenarios?jobTitleId=...
export async function GET(request: Request) {
  try {
    // Public read - optionally scoped to user's org if authenticated
    const authResult = await getAuthOrNull();
    const userOrgId = authResult?.session.user.orgId;

    const { searchParams } = new URL(request.url);
    const jobTitleId = searchParams.get('jobTitleId');

    // Multi-tenancy: show user's org scenarios + global ones
    // If not authenticated, only show global scenarios
    const orgFilter = userOrgId
      ? { OR: [{ orgId: userOrgId }, { orgId: null }] }
      : { orgId: null };

    const scenarios = await prisma.scenario.findMany({
      where: {
        ...orgFilter,
        ...(jobTitleId ? { jobTitleId } : {}),
      },
      include: { jobTitle: { select: { id: true, name: true } } },
      orderBy: [{ jobTitleId: 'asc' }, { name: 'asc' }],
    });
    return NextResponse.json(scenarios);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[scenarios] GET failed:', error);
    return NextResponse.json({ error: 'Failed to fetch scenarios' }, { status: 500 });
  }
}

// POST /api/scenarios
// Body: { jobTitleId, name, description?, type: 'PHONE'|'CHAT', script? }
export async function POST(request: Request) {
  try {
    // Require admin role for creating scenarios
    const { session } = await requireAuth(request, 'ADMIN');
    const userOrgId = session.user.orgId;

    const body = await request.json();

    if (!body.jobTitleId || !body.name || !body.type) {
      return NextResponse.json(
        { error: 'jobTitleId, name, and type are required' },
        { status: 400 }
      );
    }

    const created = await prisma.scenario.create({
      data: {
        jobTitleId: body.jobTitleId,
        name: body.name,
        description: body.description ?? null,
        type: body.type,
        script: body.script ?? {},
        orgId: userOrgId,  // Multi-tenancy: assign to user's org
      },
    });
    // PrismaNeonHTTP does not support implicit transactions;
    // fetch relations separately after creation.
    const scenario = await prisma.scenario.findUnique({
      where: { id: created.id },
      include: { jobTitle: { select: { id: true, name: true } } },
    });
    return NextResponse.json(scenario, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[scenarios] POST failed:', error);
    return NextResponse.json({ error: 'Failed to create scenario' }, { status: 500 });
  }
}
