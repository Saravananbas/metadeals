import { NextResponse } from "next/server";
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

    const db = getDatabase();
    const deal = await db.deal.findFirst({
      where: { OR: [{ slug }, { id: slug }] },
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

