
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';


export async function GET() {
  try {
    const criteria = await prisma.criteria.findMany({
      orderBy: { name: 'asc' }
    });
    return NextResponse.json(criteria);
  } catch (error) {
    console.error('Failed to fetch criteria:', error);
    return NextResponse.json({ error: 'Failed to fetch criteria' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const criterion = await prisma.criteria.create({
      data: {
        name: body.name,
        description: body.description,
        weight: body.weight ?? 5,
        category: body.category,
        active: body.active ?? true
      }
    });
    return NextResponse.json(criterion, { status: 201 });
  } catch (error) {
    console.error('Failed to create criteria:', error);
    return NextResponse.json({ error: 'Failed to create criteria' }, { status: 500 });
  }
}
