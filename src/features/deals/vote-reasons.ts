/** Why a member voted a deal down. Shared by the website, the apps and the server (which only accepts these exact words). */
export const DISLIKE_REASONS = ["Not a Great Deal", "Offer Expired", "No Value for Money", "Spam", "Incorrect Information", "Repost", "Other"] as const;
export type DislikeReason = (typeof DISLIKE_REASONS)[number];
