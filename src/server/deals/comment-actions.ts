import "server-only";
import { getDatabase } from "@/server/db/client";
import { CustomerError, limitCustomerRequests } from "@/server/customer/service";
import { assertActiveCustomer } from "@/server/customer/session";

/** Like or unlike a deal-page comment. One like per member per comment; returns the new count. */
export async function setCommentLike(customerId: string, commentId: string, like: boolean) {
  await assertActiveCustomer(customerId);
  const db = getDatabase();
  const comment = await db.dealComment.findUnique({ where: { id: commentId }, select: { id: true } });
  if (!comment) throw new CustomerError("Comment not found.", 404);
  if (like) {
    await limitCustomerRequests(`deal-comment-like:${customerId}`, 200, 3600);
    await db.dealCommentLike.createMany({ data: [{ commentId, customerId }], skipDuplicates: true });
  } else await db.dealCommentLike.deleteMany({ where: { commentId, customerId } });
  return { liked: like, likes: await db.dealCommentLike.count({ where: { commentId } }) };
}

/** The picture of a comment, always the re-encoded WebP. */
export async function readCommentImage(commentId: string) {
  const { readImage } = await import("@/server/storage/media");
  const row = await getDatabase().dealComment.findUnique({ where: { id: commentId }, select: { imageKey: true, imageProvider: true } });
  if (!row?.imageKey || !row.imageProvider) throw new CustomerError("No picture.", 404);
  return readImage(row.imageProvider, row.imageKey);
}
