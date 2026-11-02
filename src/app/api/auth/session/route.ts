import { getCurrentAuthContext } from "@/server/auth/session";

export async function GET() {
  const context = await getCurrentAuthContext();
  if (!context) return Response.json({ user: null });
  return Response.json({
    user: {
      id: context.user.id,
      email: context.user.email,
      name: context.user.name,
      role: context.user.role,
    },
  });
}
