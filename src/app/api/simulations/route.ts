import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';


// Start a new simulation session
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { userId, jobTitleId, scenarioId, type } = body;

    // Use raw SQL to insert - generate UUID client-side for better compatibility
    const sessionId = crypto.randomUUID();
    
    await prisma.$queryRaw`
      INSERT INTO simulation_sessions (id, user_id, job_title_id, scenario_id, type, status, started_at, created_at)
      VALUES (${sessionId}, ${userId}, ${jobTitleId}, ${scenarioId}, ${type}, 'IN_PROGRESS', NOW(), NOW())
    `;

    // Fetch the created session
    const session = await prisma.simulationSession.findUnique({
      where: { id: sessionId },
      include: { scenario: true, jobTitle: true },
    });
    return NextResponse.json(session, { status: 201 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('Failed to create simulation:', msg);
    return NextResponse.json({ error: 'Failed to create simulation', detail: msg }, { status: 500 });
  }
}

// List simulation sessions
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    const sessions = await prisma.simulationSession.findMany({
      where: userId ? { userId } : undefined,
      include: {
        scenario: true,
        jobTitle: true,
        scores: { include: { criteria: true } }
      },
      orderBy: { createdAt: 'desc' }
    });
    return NextResponse.json(sessions);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('Failed to list simulations:', msg);
    return NextResponse.json({ error: 'Failed to list simulations', detail: msg }, { status: 500 });
  }
}
