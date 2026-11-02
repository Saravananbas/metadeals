import "server-only";
import { randomUUID } from "node:crypto";
import { createRequestDigest } from "./crypto";
import { getAuthEnv } from "@/config/env";

export class RequestBodyError extends Error {}

export function assertSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(getAuthEnv().NEXTAUTH_URL).origin;
  } catch {
    return false;
  }
}

export function getRequestMetadata(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");
  const address = forwardedFor?.split(",")[0]?.trim() || realIp || null;
  const pepper = getAuthEnv().AUTH_SESSION_SECRET;
  return {
    ipHash: createRequestDigest(address, pepper),
    userAgent: request.headers.get("user-agent")?.slice(0, 512) ?? null,
    requestId: request.headers.get("x-request-id")?.slice(0, 64) ?? randomUUID(),
  };
}

export async function readJson(request: Request): Promise<unknown> {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 16_384) throw new RequestBodyError("Request body is too large");
  if (!request.body) throw new RequestBodyError("A JSON request body is required");

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > 16_384) {
      await reader.cancel();
      throw new RequestBodyError("Request body is too large");
    }
    chunks.push(value);
  }
  try {
    const body = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return JSON.parse(new TextDecoder().decode(body));
  } catch (error) {
    if (error instanceof RequestBodyError) throw error;
    throw new RequestBodyError("Request body must contain valid JSON");
  }
}
