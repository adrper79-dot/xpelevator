export const runtime = 'edge';
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';


export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const scenario = await prisma.scenario.findUnique({
      where: { id },
      include: { jobTitle: { select: { id: true, name: true } } },
    });
    if (!scenario) {
      return NextResponse.json({ error: 'Scenario not found' }, { status: 404 });
    }
    return NextResponse.json(scenario);
  } catch (error) {
    console.error('[scenarios/[id]] GET failed:', error);
    return NextResponse.json({ error: 'Failed to fetch scenario' }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const scenario = await prisma.scenario.update({
      where: { id },
      data: {
        name: body.name,
        description: body.description ?? null,
        type: body.type,
        script: body.script ?? {},
      },
      include: { jobTitle: { select: { id: true, name: true } } },
    });
    return NextResponse.json(scenario);
  } catch (error) {
    console.error('[scenarios/[id]] PUT failed:', error);
    return NextResponse.json({ error: 'Failed to update scenario' }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await prisma.scenario.delete({ where: { id } });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error('[scenarios/[id]] DELETE failed:', error);
    return NextResponse.json({ error: 'Failed to delete scenario' }, { status: 500 });
  }
}
