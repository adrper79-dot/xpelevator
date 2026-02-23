
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, AuthError } from '@/lib/auth-api';


export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Require admin role for updating job titles
    const { session } = await requireAuth(request, 'ADMIN');
    const userOrgId = session.user.orgId;

    const { id } = await params;

    // Verify ownership: must belong to user's org or be global
    const existing = await prisma.jobTitle.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Job title not found' }, { status: 404 });
    }
    if (existing.orgId && existing.orgId !== userOrgId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

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
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[jobs/[id]] PUT failed:', error);
    return NextResponse.json({ error: 'Failed to update job title' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Require admin role for deleting job titles
    const { session } = await requireAuth(request, 'ADMIN');
    const userOrgId = session.user.orgId;

    const { id } = await params;

    // Verify ownership: must belong to user's org or be global
    const existing = await prisma.jobTitle.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Job title not found' }, { status: 404 });
    }
    if (existing.orgId && existing.orgId !== userOrgId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    await prisma.jobTitle.delete({ where: { id } });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[jobs/[id]] DELETE failed:', error);
    return NextResponse.json({ error: 'Failed to delete job title' }, { status: 500 });
  }
}
