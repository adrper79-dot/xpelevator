
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, AuthError } from '@/lib/auth-api';


export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Require admin role for updating criteria
    const { session } = await requireAuth(request, 'ADMIN');
    const userOrgId = session.user.orgId;

    const { id } = await params;

    // Verify ownership: must belong to user's org or be global
    const existing = await prisma.criteria.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Criteria not found' }, { status: 404 });
    }
    if (existing.orgId && existing.orgId !== userOrgId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

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
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Failed to update criteria:', error);
    return NextResponse.json({ error: 'Failed to update criteria' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Require admin role for deleting criteria
    const { session } = await requireAuth(request, 'ADMIN');
    const userOrgId = session.user.orgId;

    const { id } = await params;

    // Verify ownership: must belong to user's org or be global
    const existing = await prisma.criteria.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Criteria not found' }, { status: 404 });
    }
    if (existing.orgId && existing.orgId !== userOrgId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    await prisma.criteria.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Failed to delete criteria:', error);
    return NextResponse.json({ error: 'Failed to delete criteria' }, { status: 500 });
  }
}
