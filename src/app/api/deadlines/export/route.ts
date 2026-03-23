/**
 * GET: Export all deadlines for the current user/guest as CSV (UTF-8 BOM for Excel).
 */

import { NextRequest, NextResponse } from "next/server";
import { createApiErrorResponse } from "@/app/api/_shared/error-response";
import { getRequestIdentity } from "@/app/api/_shared/request-identity";
import { db } from "@/lib/db";
import { companies, deadlines } from "@/lib/db/schema";
import { asc, eq } from "drizzle-orm";

function csvCell(value: string | number | boolean | null | undefined): string {
  const s = value === null || value === undefined ? "" : String(value);
  return `"${s.replace(/"/g, '""')}"`;
}

export async function GET(request: NextRequest) {
  try {
    const identity = await getRequestIdentity(request);
    if (!identity?.userId && !identity?.guestId) {
      return createApiErrorResponse(request, {
        status: 401,
        code: "DEADLINES_EXPORT_AUTH_REQUIRED",
        userMessage: "ログイン状態を確認して、もう一度お試しください。",
        action: "時間を置いて再読み込みしてください。",
        retryable: true,
        developerMessage: "Authentication required",
        logContext: "deadlines-export-auth",
      });
    }

    const owner =
      identity.userId !== null
        ? eq(companies.userId, identity.userId)
        : identity.guestId !== null
          ? eq(companies.guestId, identity.guestId)
          : undefined;

    if (!owner) {
      return createApiErrorResponse(request, {
        status: 401,
        code: "DEADLINES_EXPORT_AUTH_REQUIRED",
        userMessage: "ログイン状態を確認して、もう一度お試しください。",
        action: "時間を置いて再読み込みしてください。",
        retryable: true,
        developerMessage: "Missing owner",
        logContext: "deadlines-export-auth",
      });
    }

    const rows = await db
      .select({
        companyName: companies.name,
        type: deadlines.type,
        title: deadlines.title,
        dueDate: deadlines.dueDate,
        isConfirmed: deadlines.isConfirmed,
        completedAt: deadlines.completedAt,
        memo: deadlines.memo,
      })
      .from(deadlines)
      .innerJoin(companies, eq(deadlines.companyId, companies.id))
      .where(owner)
      .orderBy(asc(deadlines.dueDate));

    const header = [
      "企業名",
      "種別",
      "タイトル",
      "締切日時_UTC_ISO",
      "締切日時_JST表示",
      "確定済み",
      "完了日時_UTC_ISO",
      "メモ",
    ];

    const lines = [
      header.map(csvCell).join(","),
      ...rows.map((r) =>
        [
          csvCell(r.companyName),
          csvCell(r.type),
          csvCell(r.title),
          csvCell(r.dueDate.toISOString()),
          csvCell(
            r.dueDate.toLocaleString("ja-JP", {
              timeZone: "Asia/Tokyo",
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            })
          ),
          csvCell(r.isConfirmed ? "yes" : "no"),
          csvCell(r.completedAt ? r.completedAt.toISOString() : ""),
          csvCell(r.memo ?? ""),
        ].join(",")
      ),
    ];

    const body = "\uFEFF" + lines.join("\r\n");
    const day = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Tokyo" });

    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="deadlines-${day}.csv"`,
      },
    });
  } catch (error) {
    return createApiErrorResponse(request, {
      status: 500,
      code: "DEADLINES_EXPORT_FAILED",
      userMessage: "締切のエクスポートに失敗しました。",
      action: "しばらくしてからもう一度お試しください。",
      retryable: true,
      error,
      logContext: "deadlines-export",
    });
  }
}
