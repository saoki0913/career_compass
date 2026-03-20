/**
 * Redirect handler for /api/documents/new
 *
 * This route doesn't exist as document creation uses POST /api/documents.
 * Redirect to /es page for user-friendly handling.
 */

import { NextResponse } from "next/server";
import { getAppUrl } from "@/lib/app-url";

export async function GET() {
  return NextResponse.redirect(new URL("/es", getAppUrl()));
}

export async function POST() {
  // Document creation should use POST /api/documents
  return NextResponse.json(
    {
      error: "Not Found",
      message: "Document creation should use POST /api/documents",
      redirect: "/es"
    },
    { status: 404 }
  );
}
