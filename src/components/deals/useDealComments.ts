"use client";

import { useEffect, useState, type FormEvent } from "react";

export type CommentMember = { handle: string; hasAvatar: boolean; online?: boolean; joined: string; comments: number };
export type DealComment = { id: string; parentId?: string | null; authorName: string; content: string; createdAt: string; hasImage?: boolean; likes?: number; liked?: boolean; member?: CommentMember | null };
export const ACCEPTED_IMAGES = "image/jpeg,image/png,image/gif,image/webp,image/avif";

type CommentsResponse = {
  ok?: boolean;
  error?: { message?: string };
  data?: { comments?: DealComment[]; count?: number | null; comment?: DealComment | null };
};

async function readCommentsResponse(response: Response): Promise<CommentsResponse> {
  try {
    return await response.json() as CommentsResponse;
  } catch {
    throw new Error("Comments are temporarily unavailable.");
  }
}

/** Loads a deal's guest comments and posts new ones. Shared by the comments dialog on the cards and the comments section on the deal page. */
export function useDealComments(dealIdOrSlug: string) {
  const [comments, setComments] = useState<DealComment[]>([]);
  const [count, setCount] = useState(0);
  const [authorName, setAuthorName] = useState("");
  const [content, setContent] = useState("");
  const [website, setWebsite] = useState("");
  const [replyTo, setReplyTo] = useState<{ id: string; name: string } | null>(null);
  const [image, setImageFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const endpoint = `/api/v1/deals/${encodeURIComponent(dealIdOrSlug)}/comments`;

  useEffect(() => {
    const controller = new AbortController();
    fetch(endpoint, { headers: { Accept: "application/json" }, signal: controller.signal })
      .then(async (response) => {
        const result = await readCommentsResponse(response);
        if (!response.ok || !result.ok) throw new Error(result.error?.message || "Comments could not be loaded.");
        setComments(result.data?.comments ?? []);
        setCount(result.data?.count ?? 0);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Comments could not be loaded.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [endpoint]);

  /** Picks a picture (JPEG, PNG, GIF, WebP or AVIF, up to 5 MB). The server re-encodes it; a GIF is kept as a still picture. */
  function setImage(file: File | null) {
    if (file && !/^image\/(jpeg|png|gif|webp|avif)$/.test(file.type)) { setError("Use a JPEG, PNG, GIF, WebP or AVIF picture."); return; }
    if (file && file.size > 5 * 1024 * 1024) { setError("The picture must be 5 MB or smaller."); return; }
    setError(null); setImageFile(file);
  }

  async function toggleLike(id: string) {
    const current = comments.find((c) => c.id === id);
    if (!current) return;
    const response = await fetch(`${endpoint}/${encodeURIComponent(id)}/like`, { method: current.liked ? "DELETE" : "PUT" }).catch(() => null);
    if (response?.status === 401) { setError("Please sign in to like comments."); return; }
    const body = await response?.json().catch(() => null);
    if (response?.ok && body?.data) setComments((list) => list.map((c) => (c.id === id ? { ...c, liked: body.data.liked, likes: body.data.likes } : c)));
  }

  // Signed-in members comment under their user name, so the form hides the name box for them.
  useEffect(() => {
    let alive = true;
    fetch("/api/v1/customer/session", { cache: "no-store" }).then((r) => r.json()).then((b) => { if (alive) setSignedIn(Boolean(b?.user)); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!content.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      let init: RequestInit;
      if (image) {
        const form = new FormData();
        form.set("authorName", authorName); form.set("content", content); form.set("website", website); form.set("image", image);
        if (replyTo) form.set("parentId", replyTo.id);
        init = { method: "POST", headers: { Accept: "application/json" }, body: form };
      } else init = { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ authorName, content, website, ...(replyTo ? { parentId: replyTo.id } : {}) }) };
      const response = await fetch(endpoint, init);
      const result = await readCommentsResponse(response);
      if (!response.ok || !result.ok) throw new Error(result.error?.message || "Your comment could not be posted.");
      const postedComment = result.data?.comment;
      if (postedComment) {
        setComments((current) => [postedComment, ...current].slice(0, 200));
        setCount(result.data?.count ?? 0);
        setContent("");
        setWebsite("");
        setImageFile(null);
        setReplyTo(null);
        setNotice("Your comment has been posted.");
      }
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Your comment could not be posted.");
    } finally {
      setSubmitting(false);
    }
  }

  return { comments, count, replyTo, setReplyTo, signedIn, image, setImage, toggleLike, endpoint, authorName, setAuthorName, content, setContent, website, setWebsite, loading, submitting, error, notice, submit };
}
