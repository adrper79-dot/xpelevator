import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import prisma from '@/lib/prisma';
import { requireAuth, AuthError } from '@/lib/auth-api';


// Start a new simulation session
export async function POST(request: Request) {
  try {
    // Require authentication to create sessions
    const authResult = await requireAuth();

    const body = await request.json();
    const { jobTitleId, scenarioId, type } = body;

    // Use the authenticated user's DB ID if available
    const userId: string = authResult.session.user.id;
    const dbUserId: string | null = authResult.session.user.dbUserId ?? null;
    const orgId: string | null = authResult.session.user.orgId ?? null;

    // PrismaNeonHTTP does not support implicit transactions triggered by create+include.
    // Create plain, then fetch relations separately (same pattern used in scenarios/route.ts).
    const created = await prisma.simulationSession.create({
      data: {
        jobTitleId,
        scenarioId,
        type: type as 'PHONE' | 'CHAT' | 'VOICE',
        status: 'IN_PROGRESS',
        userId,
        dbUserId,
        orgId,
        startedAt: new Date(),
      },
    });
    const newSession = await prisma.simulationSession.findUnique({
      where: { id: created.id },
      include: { scenario: true, jobTitle: true },
    });

    return NextResponse.json(newSession, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const msg = error instanceof Error ? error.message : String(error);
    console.error('Failed to create simulation:', msg);
    return NextResponse.json(
      { error: 'Failed to create simulation', detail: process.env.NODE_ENV !== 'production' ? msg : undefined },
      { status: 500 }
    );
  }
}

// List simulation sessions
export async function GET(request: Request) {
  try {
    // Require authentication to list sessions
    const authResult = await requireAuth();

    const { searchParams } = new URL(request.url);

    // User sees only their own sessions (or org sessions if admin)
    const userId = authResult.session.user.id;
    const userRole = authResult.session.user.role;
    const orgId = authResult.session.user.orgId;

    // Admins can see all sessions in their org; members see only their own
    const whereClause = userRole === 'ADMIN' && orgId
      ? { orgId }
      : { userId };

    const sessions = await prisma.simulationSession.findMany({
      where: whereClause,
      include: {
        scenario: true,
        jobTitle: true,
        scores: { include: { criteria: true } }
      },
      orderBy: { createdAt: 'desc' }
    });
    return NextResponse.json(sessions);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const msg = error instanceof Error ? error.message : String(error);
    console.error('Failed to list simulations:', msg);
    return NextResponse.json(
      { error: 'Failed to list simulations', detail: process.env.NODE_ENV !== 'production' ? msg : undefined },
      { status: 500 }
    );
  }
}
