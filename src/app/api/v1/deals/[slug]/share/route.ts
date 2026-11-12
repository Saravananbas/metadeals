import { NextResponse } from "next/server";
import { getDatabase } from "@/server/db/client";
import { throttleRead } from "@/server/community/config";
import { clientIpFromHeaders } from "@/server/client-ip";
import { publicWhere } from "@/server/deals/repository";
import { listingSchema } from "@/features/deals/validation";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    if (!slug) {
      return NextResponse.json({ ok: false, message: "Missing slug" }, { status: 400 });
    }

    // Shares are counted for the public; keep one visitor from inflating the number (per-process, resets on restart).
    try { throttleRead(`share:${clientIpFromHeaders(request.headers) ?? "unknown"}`, 20); } catch { return NextResponse.json({ ok: false, message: "Too many requests" }, { status: 429 }); }

    const db = getDatabase();
    const deal = await db.deal.findFirst({
      where: { AND: [{ OR: [{ slug }, { id: slug }] }, publicWhere(listingSchema.parse({}))] },
      select: { id: true },
    });

    if (!deal) {
      return NextResponse.json({ ok: false, message: "Deal not found" }, { status: 404 });
    }

    const updated = await db.deal.update({
      where: { id: deal.id },
      data: { shareCount: { increment: 1 } },
      select: { shareCount: true },
    });

    return NextResponse.json({ ok: true, shareCount: updated.shareCount });
  } catch (error) {
    console.error("Failed to increment share count:", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

