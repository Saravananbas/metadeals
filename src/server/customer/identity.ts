import "server-only";
import sharp from "sharp";
import { Prisma } from "@/generated/prisma/client";
import { getDatabase } from "@/server/db/client";
import { readImage, removeStoredImage, storeImage } from "@/server/storage/media";
import { handleSchema } from "@/features/community/validation";
import { ensureProfile } from "@/server/community/service";
import { CustomerError, limitCustomerRequests } from "./service";
import { assertActiveCustomer } from "./session";

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
export const isDefaultHandle = (handle: string) => /^member-[0-9a-f]{6}$/.test(handle);
const avatarUrl = (handle: string, key: string | null) => (key ? `/api/v1/avatars/${handle}` : null);

/** The member's public identity: the user name others see next to their deals and posts, and an optional picture. */
export async function getIdentity(customerId: string) {
  await assertActiveCustomer(customerId);
  const profile = await ensureProfile(customerId);
  return { handle: profile.handle, needsUserName: isDefaultHandle(profile.handle), avatarUrl: avatarUrl(profile.handle, profile.avatarKey) };
}

export async function setUserName(customerId: string, raw: unknown) {
  await assertActiveCustomer(customerId);
  const profile = await ensureProfile(customerId);
  const handle = handleSchema.parse((raw as { handle?: unknown } | null)?.handle);
  await limitCustomerRequests(`username:${profile.id}`, 10, 86_400);
  try {
    await getDatabase().forumProfile.update({ where: { id: profile.id }, data: { handle } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new CustomerError("That user name is already taken. Try another.", 409);
    throw error;
  }
  return getIdentity(customerId);
}

/** Pictures are re-encoded to a small square WebP: the browser's file type and name are never trusted. */
export async function setAvatar(customerId: string, bytes: Buffer | null) {
  await assertActiveCustomer(customerId);
  if (!bytes?.length) throw new CustomerError("Choose a picture to upload.");
  if (bytes.length > MAX_AVATAR_BYTES) throw new CustomerError("The picture must be 2 MB or smaller.", 413);
  const profile = await ensureProfile(customerId);
  await limitCustomerRequests(`avatar:${profile.id}`, 10, 86_400);
  let square: Buffer;
  try {
    square = await sharp(bytes, { limitInputPixels: 25_000_000, failOn: "warning" }).rotate().resize(256, 256, { fit: "cover" }).webp({ quality: 82 }).toBuffer();
  } catch {
    throw new CustomerError("Use a JPEG, PNG or WebP picture.");
  }
  const stored = await storeImage(square);
  try {
    await getDatabase().forumProfile.update({ where: { id: profile.id }, data: { avatarKey: stored.storageKey, avatarProvider: stored.provider } });
  } catch (error) {
    await removeStoredImage(stored.provider, stored.storageKey);
    throw error;
  }
  return getIdentity(customerId);
}

export async function removeAvatar(customerId: string) {
  await assertActiveCustomer(customerId);
  const profile = await ensureProfile(customerId);
  await getDatabase().forumProfile.update({ where: { id: profile.id }, data: { avatarKey: null, avatarProvider: null } });
  return getIdentity(customerId);
}

export async function readAvatar(handle: string) {
  const row = await getDatabase().forumProfile.findUnique({ where: { handle: handle.toLowerCase() }, select: { avatarKey: true, avatarProvider: true } });
  if (!row?.avatarKey || !row.avatarProvider) throw new CustomerError("No picture.", 404);
  return readImage(row.avatarProvider, row.avatarKey);
}
