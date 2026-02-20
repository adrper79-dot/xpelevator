export const runtime = 'edge';
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';


export async function GET() {
  try {
    const jobTitles = await prisma.jobTitle.findMany({
      include: {
        scenarios: true,
        jobCriteria: {
          include: { criteria: true }
        }
      },
      orderBy: { name: 'asc' }
    });
    return NextResponse.json(jobTitles);
  } catch (error) {
    console.error('Failed to fetch job titles:', error);
    return NextResponse.json({ error: 'Failed to fetch job titles' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const jobTitle = await prisma.jobTitle.create({
      data: {
        name: body.name,
        description: body.description
      }
    });
    return NextResponse.json(jobTitle, { status: 201 });
  } catch (error) {
    console.error('Failed to create job title:', error);
    return NextResponse.json({ error: 'Failed to create job title' }, { status: 500 });
  }
}
