export type NotificationType = "ANNOUNCEMENT" | "POST_COMMENT" | "COMMENT_REPLY" | "POST_APPROVED" | "POST_REMOVED" | "POST_RESTORED" | "POST_LOCKED" | "POST_UNLOCKED" | "COMMENT_REMOVED" | "COMMENT_RESTORED" | "MESSAGE" | "MODERATION_WARNING" | "POSTING_RESTRICTED" | "APPEAL_DECIDED";

/** The sentence shown for a notice. Moderators are never named. */
export function notificationText(type: NotificationType, actor: string | null): string {
  const who = actor ?? "Someone";
  switch (type) {
    case "ANNOUNCEMENT": return "MetaDeals4U Team posted an announcement";
    case "MODERATION_WARNING": return "You received a community guidelines warning";
    case "POSTING_RESTRICTED": return "Posting on your account was paused for a while";
    case "APPEAL_DECIDED": return "Your appeal was reviewed";
    case "MESSAGE": return `${who} sent you a message`;
    case "POST_COMMENT": return `${who} commented on your discussion`;
    case "COMMENT_REPLY": return `${who} replied to your comment`;
    case "POST_APPROVED": return "A moderator approved your discussion";
    case "POST_REMOVED": return "A moderator removed your discussion";
    case "POST_RESTORED": return "A moderator restored your discussion";
    case "POST_LOCKED": return "A moderator locked your discussion";
    case "POST_UNLOCKED": return "A moderator unlocked your discussion";
    case "COMMENT_REMOVED": return "A moderator removed your comment";
    case "COMMENT_RESTORED": return "A moderator restored your comment";
  }
}
