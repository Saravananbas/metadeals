import { authorize } from "@/server/auth/authorization";
import { getDatabase } from "@/server/db/client";
import { z } from "zod";

const querySchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  range: z.enum(["24h", "7d", "30d", "all"]).default("7d"),
  action: z.string().trim().max(80).default(""),
});

const SAFE_METADATA_KEYS = ["fromRole", "toRole", "fromStatus", "toStatus", "method", "permission", "title", "slug", "outcome"] as const;

function safeDetails(metadata: unknown, targetId: string | null) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return targetId ? `Target: ${targetId}` : "—";
  const values = metadata as Record<string, unknown>;
  const details = SAFE_METADATA_KEYS.flatMap((key) => {
    const value = values[key];
    if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") return [];
    const text = String(value).replace(/[\r\n\t]/g, " ").slice(0, 100);
    return text ? [`${key}: ${text}`] : [];
  });
  if (!details.length && targetId) details.push(`Target: ${targetId}`);
  return details.slice(0, 3).join(" · ") || "—";
}

export async function GET(request: Request) {
  const authorization = await authorize("audit:read");
  if (!authorization.context) {
    return Response.json({ error: "Authentication or permission required." }, { status: authorization.status });
  }
  const query = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
  const since = query.range === "all" ? undefined : new Date(Date.now() - ({ "24h": 24, "7d": 24 * 7, "30d": 24 * 30 }[query.range] * 60 * 60 * 1000));
  const where = { ...(since ? { createdAt: { gte: since } } : {}), ...(query.action ? { action: query.action } : {}) };
  const db = getDatabase();
  const [records, total, actions] = await Promise.all([
    db.auditEvent.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    select: {
      id: true,
      action: true,
      success: true,
      targetId: true,
      createdAt: true,
      metadata: true,
      actor: { select: { id: true, email: true, role: true } },
    },
    }),
    db.auditEvent.count({ where }),
    db.auditEvent.findMany({ distinct: ["action"], select: { action: true }, orderBy: { action: "asc" } }),
  ]);
  const events = records.map(({ metadata, targetId, ...event }) => ({ ...event, details: safeDetails(metadata, targetId) }));
  return Response.json({ events, actions: actions.map((item) => item.action), page: query.page, pageSize: query.limit, total, totalPages: Math.max(1, Math.ceil(total / query.limit)) });
}
