export const runtime = 'edge';
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';


// Start a new simulation session
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const session = await prisma.simulationSession.create({
      data: {
        userId: body.userId,
        jobTitleId: body.jobTitleId,
        scenarioId: body.scenarioId,
        type: body.type,
        status: 'IN_PROGRESS',
        startedAt: new Date()
      },
      include: {
        scenario: true,
        jobTitle: true
      }
    });
    return NextResponse.json(session, { status: 201 });
  } catch (error) {
    console.error('Failed to create simulation:', error);
    return NextResponse.json({ error: 'Failed to create simulation' }, { status: 500 });
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
    console.error('Failed to fetch simulations:', error);
    return NextResponse.json({ error: 'Failed to fetch simulations' }, { status: 500 });
  }
}
