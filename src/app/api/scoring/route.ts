import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';


// Score a simulation session
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { sessionId, scores } = body;

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
    const msg = error instanceof Error ? error.message : String(error);
    console.error('Failed to score simulation:', error);
    return NextResponse.json(
      { error: 'Failed to score simulation', detail: process.env.NODE_ENV !== 'production' ? msg : undefined },
      { status: 500 }
    );
  }
}
