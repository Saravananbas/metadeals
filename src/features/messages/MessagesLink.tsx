"use client";
import Link from "next/link";
import { Mail } from "lucide-react";
import { useUnreadMessages } from "./useUnread";

/** Messages icon with the unread count for a page header. Renders nothing for visitors or while messaging is switched off. */
export function MessagesLink({ className, badgeClassName, size = 20 }: { className: string; badgeClassName: string; size?: number }) {
  const unread = useUnreadMessages();
  if (unread === null) return null;
  return (
    <Link href="/messages" className={className} aria-label={unread ? `Messages, ${unread} unread` : "Messages"}>
      <Mail size={size} />{unread > 0 && <span className={badgeClassName}>{unread > 9 ? "9+" : unread}</span>}
    </Link>
  );
}
