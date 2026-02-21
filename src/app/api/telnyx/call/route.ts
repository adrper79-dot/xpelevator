
/**
 * POST /api/telnyx/call
 *
 * Initiates an outbound phone call for a PHONE-type simulation session.
 * The virtual customer AI will answer and conduct the scenario.
 *
 * Request body:
 *   sessionId  — the SimulationSession.id to associate the call with
 *   to         — E.164 phone number to dial, e.g. "+12125550100"
 *   from       — Your Telnyx number in E.164 (or use .env TELNYX_FROM_NUMBER)
 *
 * On success:
 *   Returns { callControlId, callLegId } and updates session status to IN_PROGRESS
 *
 * Prerequisites:
 *   - TELNYX_API_KEY, TELNYX_CONNECTION_ID, TELNYX_WEBHOOK_URL set in .env
 *   - Session must exist and be of type PHONE
 */
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { initiateCall, encodeClientState } from '@/lib/telnyx';


export async function POST(request: Request) {
  try {
    const { sessionId, to, from } = (await request.json()) as {
      sessionId: string;
      to: string;
      from?: string;
    };

    if (!sessionId || !to) {
      return NextResponse.json({ error: 'sessionId and to are required' }, { status: 400 });
    }

    // Verify the session exists and is a PHONE type
    const session = await prisma.simulationSession.findUnique({
      where: { id: sessionId },
      include: { scenario: true, jobTitle: true },
    });

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }
    if (session.type !== 'PHONE') {
      return NextResponse.json({ error: 'Session is not a PHONE type' }, { status: 400 });
    }

    // Encode session context into Telnyx client_state (threaded through all webhooks)
    const clientState = encodeClientState({
      sessionId: session.id,
      scenarioId: session.scenarioId,
      jobTitleId: session.jobTitleId,
      scenarioName: session.scenario.name,
    });

    const callerNumber = from ?? process.env.TELNYX_FROM_NUMBER ?? '';
    if (!callerNumber) {
      return NextResponse.json(
        { error: 'No from number — set TELNYX_FROM_NUMBER in .env' },
        { status: 400 }
      );
    }

    const result = await initiateCall({ to, from: callerNumber, clientState });

    // Update session to IN_PROGRESS and store call metadata
    await prisma.simulationSession.update({
      where: { id: sessionId },
      data: {
        status: 'IN_PROGRESS',
        startedAt: new Date(),
      },
    });

    return NextResponse.json({
      callControlId: result.data.call_control_id,
      callLegId: result.data.call_leg_id,
      sessionId,
    });
  } catch (error) {
    console.error('Telnyx call initiation error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to initiate call' },
      { status: 500 }
    );
  }
}
