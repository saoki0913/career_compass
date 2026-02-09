/**
 * Gakuchika Summaries API
 *
 * GET: Returns list of completed gakuchika summaries for ES editor context
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { gakuchikaContents, gakuchikaConversations } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { headers } from "next/headers";

interface StrengthItem {
  title: string;
  description: string;
}

interface LearningItem {
  title: string;
  description: string;
}

interface ParsedSummary {
  // New structured format fields
  situation_text?: string;
  task_text?: string;
  action_text?: string;
  result_text?: string;
  learnings?: LearningItem[];
  // Shared fields
  numbers: string[];
  strengths: StrengthItem[] | string[];
  // Legacy format fields
  summary?: string;
  key_points?: string[];
}

interface STARScores {
  situation: number;
  task: number;
  action: number;
  result: number;
}

function parseSummary(summaryJson: string | null): ParsedSummary | null {
  if (!summaryJson) return null;

  try {
    const parsed = JSON.parse(summaryJson);
    if (typeof parsed !== 'object') {
      // Plain text summary (legacy)
      return {
        summary: summaryJson,
        key_points: [],
        numbers: [],
        strengths: [],
      };
    }

    // New structured format (has situation_text)
    if ('situation_text' in parsed) {
      return {
        situation_text: parsed.situation_text || '',
        task_text: parsed.task_text || '',
        action_text: parsed.action_text || '',
        result_text: parsed.result_text || '',
        strengths: parsed.strengths || [],
        learnings: parsed.learnings || [],
        numbers: parsed.numbers || [],
      };
    }

    // Old format (has summary)
    if ('summary' in parsed) {
      return {
        summary: parsed.summary || '',
        key_points: parsed.key_points || [],
        numbers: parsed.numbers || [],
        strengths: parsed.strengths || [],
      };
    }

    // Unknown format
    return {
      summary: summaryJson,
      key_points: [],
      numbers: [],
      strengths: [],
    };
  } catch {
    // Plain text summary
    return {
      summary: summaryJson,
      key_points: [],
      numbers: [],
      strengths: [],
    };
  }
}

function parseStarScores(starScoresJson: string | null): STARScores | null {
  if (!starScoresJson) return null;

  try {
    const parsed = JSON.parse(starScoresJson);
    return {
      situation: parsed.situation ?? 0,
      task: parsed.task ?? 0,
      action: parsed.action ?? 0,
      result: parsed.result ?? 0,
    };
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const userId = session.user.id;

    // Fetch gakuchika contents for this user
    const contents = await db
      .select({
        id: gakuchikaContents.id,
        title: gakuchikaContents.title,
        summary: gakuchikaContents.summary,
        linkedCompanyIds: gakuchikaContents.linkedCompanyIds,
        updatedAt: gakuchikaContents.updatedAt,
      })
      .from(gakuchikaContents)
      .where(eq(gakuchikaContents.userId, userId))
      .orderBy(desc(gakuchikaContents.updatedAt));

    // Fetch latest conversation star scores for each gakuchika
    const summaries = await Promise.all(
      contents.map(async (content) => {
        // Get latest completed conversation for this gakuchika
        const [latestConversation] = await db
          .select({
            status: gakuchikaConversations.status,
            starScores: gakuchikaConversations.starScores,
          })
          .from(gakuchikaConversations)
          .where(eq(gakuchikaConversations.gakuchikaId, content.id))
          .orderBy(desc(gakuchikaConversations.updatedAt))
          .limit(1);

        // Parse summary (handle both JSON and plain text)
        const parsedSummary = parseSummary(content.summary);

        // Parse star scores
        const starScores = parseStarScores(latestConversation?.starScores || null);

        // Parse linked company IDs
        let linkedCompanyIds: string[] = [];
        if (content.linkedCompanyIds) {
          try {
            linkedCompanyIds = JSON.parse(content.linkedCompanyIds);
          } catch {
            // Ignore parse errors
          }
        }

        return {
          id: content.id,
          title: content.title,
          summary: parsedSummary,
          starScores,
          isCompleted: latestConversation?.status === "completed",
          linkedCompanyIds,
        };
      })
    );

    // Filter to only completed ones (have at least one completed conversation)
    const completedSummaries = summaries.filter((s) => s.isCompleted);

    return NextResponse.json({
      summaries: completedSummaries,
    });
  } catch (error) {
    console.error("Error fetching gakuchika summaries:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
