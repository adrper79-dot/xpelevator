import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, AuthError } from '@/lib/auth-api';


// Score a simulation session
export async function POST(request: Request) {
  try {
    // Require authentication for scoring
    const { session: authSession } = await requireAuth();
    const userId = authSession.user.id;
    const userOrgId = authSession.user.orgId;
    const userRole = authSession.user.role;

    const body = await request.json();
    const { sessionId, scores } = body;

    // Verify session exists and user has access
    const session = await prisma.simulationSession.findUnique({
      where: { id: sessionId },
      select: { id: true, userId: true, orgId: true },
    });
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }
    // Multi-tenancy: user must own session or be admin in same org
    const canAccess =
      session.userId === userId ||
      (userRole === 'ADMIN' && session.orgId === userOrgId);
    if (!canAccess) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // scores: [{ criteriaId, score, feedback }]
    // PrismaNeonHTTP does not support transactions; create scores in parallel.
    const createdScores = await Promise.all(
      scores.map((s: { criteriaId: string; score: number; feedback?: string }) =>
        prisma.score.create({
          data: {
            sessionId,
            criteriaId: s.criteriaId,
            score: s.score,
            feedback: s.feedback
          }
        })
      )
    );

    // Mark session as completed
    await prisma.simulationSession.update({
      where: { id: sessionId },
      data: { status: 'COMPLETED', endedAt: new Date() }
    });

    return NextResponse.json(createdScores, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const msg = error instanceof Error ? error.message : String(error);
    console.error('Failed to score simulation:', error);
    return NextResponse.json(
      { error: 'Failed to score simulation', detail: process.env.NODE_ENV !== 'production' ? msg : undefined },
      { status: 500 }
    );
  }
}
