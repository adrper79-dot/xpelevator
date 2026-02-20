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
    const criterion = await prisma.criteria.update({
      where: { id },
      data: {
        name: body.name,
        description: body.description,
        weight: body.weight,
        category: body.category,
        active: body.active
      }
    });
    return NextResponse.json(criterion);
  } catch (error) {
    console.error('Failed to update criteria:', error);
    return NextResponse.json({ error: 'Failed to update criteria' }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await prisma.criteria.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete criteria:', error);
    return NextResponse.json({ error: 'Failed to delete criteria' }, { status: 500 });
  }
}
