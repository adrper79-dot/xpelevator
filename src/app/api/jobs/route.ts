import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, getAuthOrNull, AuthError } from '@/lib/auth-api';


export async function GET() {
  try {
    // Public read - optionally scoped to user's org if authenticated
    const authResult = await getAuthOrNull();
    const userOrgId = authResult?.session.user.orgId;

    // Multi-tenancy: show user's org job titles + global ones (orgId is null)
    // If not authenticated, only show global job titles
    const orgFilter = userOrgId
      ? { OR: [{ orgId: userOrgId }, { orgId: null }] }
      : { orgId: null };

    const jobTitles = await prisma.jobTitle.findMany({
      where: orgFilter,
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
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Failed to fetch job titles:', message);
    return NextResponse.json(
      { error: 'Failed to fetch job titles', detail: message },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    // Require admin role for creating job titles
    const { session } = await requireAuth(request, 'ADMIN');
    const userOrgId = session.user.orgId;

    const body = await request.json();
    const jobTitle = await prisma.jobTitle.create({
      data: {
        name: body.name,
        description: body.description,
        orgId: userOrgId,  // Multi-tenancy: assign to user's org
      }
    });
    return NextResponse.json(jobTitle, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Failed to create job title:', message);
    return NextResponse.json(
      {
        error: 'Failed to create job title',
        detail: process.env.NODE_ENV !== 'production' ? message : undefined,
      },
      { status: 500 }
    );
  }
}
