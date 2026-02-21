export const runtime = 'edge';
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';


// GET /api/jobs/[id]/criteria — list all criteria linked to a job title
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const links = await prisma.jobCriteria.findMany({
      where: { jobTitleId: id },
      include: { criteria: true },
      orderBy: { criteria: { name: 'asc' } },
    });
    return NextResponse.json(links.map((l: { criteria: unknown }) => l.criteria));
  } catch (error) {
    console.error('[jobs/[id]/criteria] GET failed:', error);
    return NextResponse.json({ error: 'Failed to fetch criteria' }, { status: 500 });
  }
}

// POST /api/jobs/[id]/criteria — link a criterion to a job title
// Body: { criteriaId: string }
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: jobTitleId } = await params;
    const body = await request.json();

    if (!body.criteriaId) {
      return NextResponse.json({ error: 'criteriaId is required' }, { status: 400 });
    }

    // PrismaNeonHTTP does not support implicit transactions; upsert uses them.
    // Use findUnique + create pattern instead.
    const existing = await prisma.jobCriteria.findUnique({
      where: { jobTitleId_criteriaId: { jobTitleId, criteriaId: body.criteriaId } },
    });
    const link = existing ?? await prisma.jobCriteria.create({
      data: { jobTitleId, criteriaId: body.criteriaId },
    });
    return NextResponse.json(link, { status: 201 });
  } catch (error) {
    console.error('[jobs/[id]/criteria] POST failed:', error);
    return NextResponse.json({ error: 'Failed to link criteria' }, { status: 500 });
  }
}

// DELETE /api/jobs/[id]/criteria — unlink all or a specific criterion
// Body: { criteriaId: string }
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: jobTitleId } = await params;
    const body = await request.json().catch(() => ({}));

    if (body.criteriaId) {
      await prisma.jobCriteria.delete({
        where: {
          jobTitleId_criteriaId: { jobTitleId, criteriaId: body.criteriaId },
        },
      });
    } else {
      // Remove all criteria links for this job
      await prisma.jobCriteria.deleteMany({ where: { jobTitleId } });
    }
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error('[jobs/[id]/criteria] DELETE failed:', error);
    return NextResponse.json({ error: 'Failed to unlink criteria' }, { status: 500 });
  }
}
