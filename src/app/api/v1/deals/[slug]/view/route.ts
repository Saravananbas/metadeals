import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { getDatabase } from "@/server/db/client";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    if (!slug) {
      return NextResponse.json({ ok: false, message: "Missing slug" }, { status: 400 });
    }

    const headerList = await headers();
    const userAgent = headerList.get("user-agent")?.toLowerCase() || "";
    const isAdminPreview = headerList.get("x-admin-preview") === "true";

    // Deduplicate / filter bots, crawlers, and admin previews
    const isBot = /bot|googlebot|crawler|spider|robot|crawling|lighthouse|headless/i.test(userAgent);
    if (isBot || isAdminPreview) {
      return NextResponse.json({ ok: true, skipped: true, reason: "bot_or_admin" });
    }

    const db = getDatabase();
    const deal = await db.deal.findFirst({
      where: { OR: [{ slug }, { id: slug }] },
      select: { id: true, viewCount: true },
    });

    if (!deal) {
      return NextResponse.json({ ok: false, message: "Deal not found" }, { status: 404 });
    }

    // Deduplication via cookie (30 minutes)
    const cookieStore = await cookies();
    const cookieName = `md_v_${deal.id.slice(-8)}`;
    if (cookieStore.get(cookieName)) {
      return NextResponse.json({ ok: true, viewCount: deal.viewCount, deduplicated: true });
    }

    // Increment count atomically
    const updated = await db.deal.update({
      where: { id: deal.id },
      data: { viewCount: { increment: 1 } },
      select: { viewCount: true },
    });

    const response = NextResponse.json({ ok: true, viewCount: updated.viewCount });
    response.cookies.set(cookieName, "1", {
      maxAge: 30 * 60, // 30 minutes
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("Failed to increment deal view:", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

