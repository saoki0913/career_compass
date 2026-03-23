import { NextRequest, NextResponse } from "next/server";
import { CSRF_COOKIE_NAME, setCsrfCookie } from "@/lib/csrf";

export async function GET(request: NextRequest) {
  const response = new NextResponse(null, { status: 204 });

  if (!request.cookies.get(CSRF_COOKIE_NAME)?.value) {
    setCsrfCookie(response);
  }

  return response;
}
