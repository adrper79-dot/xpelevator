export const runtime = 'edge';
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// Minimal types needed for the callback annotations below
type ScoreFull = {
  score: number;
  criteriaId: string;
  criteria: { name: string; weight: number };
};

type SessionFull = {
  type: string;
  jobTitleId: string;
  endedAt: Date | null;
  createdAt: Date;
  jobTitle: { name: string };
  scores: ScoreFull[];
};


export async function GET() {
  try {
    // Fetch all completed sessions with scores and criteria
    const rawSessions = await prisma.simulationSession.findMany({
      where: { status: 'COMPLETED' },
      include: {
        jobTitle: true,
        scenario: true,
        scores: { include: { criteria: true } },
      },
      orderBy: { endedAt: 'asc' },
    });
    const sessions = rawSessions as unknown as SessionFull[];

    // ── Summary ───────────────────────────────────────────────────────────────
    const totalSessions = sessions.length;

    const allScores: ScoreFull[] = sessions.flatMap((s: SessionFull) => s.scores);
    const overallAvg =
      allScores.length > 0
        ? allScores.reduce((sum: number, s: ScoreFull) => sum + s.score, 0) / allScores.length
        : null;

    // ── Score trend (daily average for last 60 days) ──────────────────────────
    const now = new Date();
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - 60);

    const trendMap = new Map<string, { sum: number; count: number }>();
    for (const session of sessions) {
      const date = session.endedAt ?? session.createdAt;
      if (date < cutoff) continue;

      const day = date.toISOString().slice(0, 10); // YYYY-MM-DD
      const sessionAvg =
        session.scores.length > 0
          ? session.scores.reduce((sum: number, s: ScoreFull) => sum + s.score, 0) / session.scores.length
          : null;
      if (sessionAvg === null) continue;

      const existing = trendMap.get(day) ?? { sum: 0, count: 0 };
      trendMap.set(day, { sum: existing.sum + sessionAvg, count: existing.count + 1 });
    }
    const scoreTrend = Array.from(trendMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, { sum, count }]) => ({ date, avg: sum / count, count }));

    // ── Per job-title breakdown ───────────────────────────────────────────────
    const jobMap = new Map<
      string,
      { name: string; sessions: number; scoreSum: number; scoreCount: number }
    >();
    for (const session of sessions) {
      const key = session.jobTitleId;
      const existing = jobMap.get(key) ?? {
        name: session.jobTitle.name,
        sessions: 0,
        scoreSum: 0,
        scoreCount: 0,
      };
      existing.sessions += 1;
      for (const s of session.scores) {
        existing.scoreSum += s.score;
        existing.scoreCount += 1;
      }
      jobMap.set(key, existing);
    }
    const byJobTitle = Array.from(jobMap.values())
      .map(({ name, sessions: count, scoreSum, scoreCount }) => ({
        name,
        sessions: count,
        avg: scoreCount > 0 ? scoreSum / scoreCount : null,
      }))
      .sort((a, b) => b.sessions - a.sessions);

    // ── Per criteria breakdown ────────────────────────────────────────────────
    const criteriaMap = new Map<
      string,
      { name: string; weight: number; sum: number; count: number }
    >();
    for (const score of allScores) {
      const key = score.criteriaId;
      const existing = criteriaMap.get(key) ?? {
        name: score.criteria.name,
        weight: score.criteria.weight,
        sum: 0,
        count: 0,
      };
      existing.sum += score.score;
      existing.count += 1;
      criteriaMap.set(key, existing);
    }
    const byCriteria = Array.from(criteriaMap.values())
      .map(({ name, weight, sum, count }) => ({
        name,
        weight,
        avg: count > 0 ? sum / count : null,
        count,
      }))
      .sort((a, b) => (a.avg ?? 0) - (b.avg ?? 0));

    // ── Type breakdown ────────────────────────────────────────────────────────
    const phoneSessions = sessions.filter((s: SessionFull) => s.type === 'PHONE');
    const chatSessions = sessions.filter((s: SessionFull) => s.type === 'CHAT');
    const typeAvg = (arr: SessionFull[]) => {
      const sc: ScoreFull[] = arr.flatMap((s: SessionFull) => s.scores);
      return sc.length > 0 ? sc.reduce((sum: number, s: ScoreFull) => sum + s.score, 0) / sc.length : null;
    };
    const byType = [
      { type: 'PHONE', sessions: phoneSessions.length, avg: typeAvg(phoneSessions) },
      { type: 'CHAT', sessions: chatSessions.length, avg: typeAvg(chatSessions) },
    ];

    return NextResponse.json({
      totalSessions,
      overallAvg,
      scoreTrend,
      byJobTitle,
      byCriteria,
      byType,
    });
  } catch (error) {
    console.error('Analytics error:', error);
    return NextResponse.json({ error: 'Failed to load analytics' }, { status: 500 });
  }
}
