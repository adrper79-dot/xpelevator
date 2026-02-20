export const runtime = 'edge';
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';


export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const jobTitle = await prisma.jobTitle.update({
      where: { id },
      data: {
        name: body.name,
        description: body.description ?? null,
      },
    });
    return NextResponse.json(jobTitle);
  } catch (error) {
    console.error('[jobs/[id]] PUT failed:', error);
    return NextResponse.json({ error: 'Failed to update job title' }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await prisma.jobTitle.delete({ where: { id } });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error('[jobs/[id]] DELETE failed:', error);
    return NextResponse.json({ error: 'Failed to delete job title' }, { status: 500 });
  }
}
