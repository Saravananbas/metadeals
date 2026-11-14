import { communityRead, json } from "@/server/community/http";
import { getMemberProfile, PROFILE_TABS, type ProfileTab } from "@/server/community/profile";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Public member page data. ?tab=overview|deals|discussions|comments|about (and saved, for the member themself only). */
export const GET = (request: Request, { params }: { params: Promise<{ handle: string }> }) =>
  communityRead(request, async (customerId) => {
    const tab = new URL(request.url).searchParams.get("tab") as ProfileTab | null;
    return json({ data: await getMemberProfile((await params).handle, customerId, tab && PROFILE_TABS.includes(tab) ? tab : "overview") });
  });
