import { NextResponse } from "next/server";
import { assertSameOrigin } from "@/server/auth/request";
import { collect, collectSchema, SESSION_COOKIE } from "@/server/analytics/collector";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    if (!assertSameOrigin(request)) return NextResponse.json({ ok: false }, { status: 403 });
    const text = await request.text();
    if (text.length > 4000) return NextResponse.json({ ok: false }, { status: 413 });
    const parsed = collectSchema.safeParse(JSON.parse(text));
    if (!parsed.success) return NextResponse.json({ ok: false }, { status: 400 });

    const cookieHeader = request.headers.get("cookie") ?? "";
    const sessionCookie = cookieHeader.split(/;\s*/).find((c) => c.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length + 1) ?? null;
    const result = await collect(parsed.data, {
      ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown",
      userAgent: request.headers.get("user-agent") ?? "",
      host: request.headers.get("host"),
      purpose: request.headers.get("purpose") || request.headers.get("sec-purpose"),
      sessionCookie,
    });

    const response = NextResponse.json({ ok: true, eventId: result.eventId ?? null }, { headers: { "Cache-Control": "no-store" } });
    if (result.sessionId) {
      response.cookies.set(SESSION_COOKIE, result.sessionId, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 30 * 60,
      });
    } else if (result.clearCookie) {
      response.cookies.delete(SESSION_COOKIE);
    }
    return response;
  } catch (error) {
    // Analytics failures are never shown to visitors.
    console.warn("analytics collect failed:", error instanceof Error ? error.message.slice(0, 300) : "unknown");
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
