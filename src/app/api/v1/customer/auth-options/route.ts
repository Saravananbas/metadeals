import { customerProviders } from "@/server/customer/options";
import { emailMode } from "@/server/customer/email";

export const dynamic = "force-dynamic";

/** What the sign-in form needs to know (which social buttons work, how codes are delivered). Nothing private. */
export const GET = () => Response.json({ providers: customerProviders(), delivery: emailMode() }, { headers: { "Cache-Control": "no-store" } });
