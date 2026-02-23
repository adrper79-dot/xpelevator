
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, AuthError } from '@/lib/auth-api';


export async function GET() {
  try {
    // Require authentication for reading criteria
    const { session } = await requireAuth();
    const userOrgId = session.user.orgId;

    // Multi-tenancy: show user's org criteria + global criteria (orgId is null)
    const orgFilter = userOrgId
      ? { OR: [{ orgId: userOrgId }, { orgId: null }] }
      : { orgId: null };

    const criteria = await prisma.criteria.findMany({
      where: orgFilter,
      orderBy: { name: 'asc' }
    });
    return NextResponse.json(criteria);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Failed to fetch criteria:', error);
    return NextResponse.json({ error: 'Failed to fetch criteria' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    // Require admin role for creating criteria
    const { session } = await requireAuth(request, 'ADMIN');
    const userOrgId = session.user.orgId;

    const body = await request.json();
    const criterion = await prisma.criteria.create({
      data: {
        name: body.name,
        description: body.description,
        weight: body.weight ?? 5,
        category: body.category,
        active: body.active ?? true,
        orgId: userOrgId,  // Multi-tenancy: assign to user's org
      }
    });
    return NextResponse.json(criterion, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Failed to create criteria:', error);
    return NextResponse.json({ error: 'Failed to create criteria' }, { status: 500 });
  }
}
