export const runtime = 'edge';
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';


// GET /api/scenarios?jobTitleId=...
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const jobTitleId = searchParams.get('jobTitleId');

    const scenarios = await prisma.scenario.findMany({
      where: jobTitleId ? { jobTitleId } : undefined,
      include: { jobTitle: { select: { id: true, name: true } } },
      orderBy: [{ jobTitleId: 'asc' }, { name: 'asc' }],
    });
    return NextResponse.json(scenarios);
  } catch (error) {
    console.error('[scenarios] GET failed:', error);
    return NextResponse.json({ error: 'Failed to fetch scenarios' }, { status: 500 });
  }
}

// POST /api/scenarios
// Body: { jobTitleId, name, description?, type: 'PHONE'|'CHAT', script? }
export async function POST(request: Request) {
  try {
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
    console.error('[scenarios] POST failed:', error);
    return NextResponse.json({ error: 'Failed to create scenario' }, { status: 500 });
  }
}
