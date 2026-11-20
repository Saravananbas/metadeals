import { Bookmark, BookOpen, CalendarDays, Flame, Heart, Magnet, MessageSquare, Mic, MousePointerClick, Quote, Share2, ShieldCheck, Sparkles, Tag, Users } from "lucide-react";
import type { BadgeIcon } from "./catalog";

export const BADGE_ICONS: Record<BadgeIcon, typeof Tag> = {
  tag: Tag, flame: Flame, mouse: MousePointerClick, bookmark: Bookmark, share: Share2, message: MessageSquare, mic: Mic, heart: Heart,
  book: BookOpen, quote: Quote, magnet: Magnet, sparkles: Sparkles, users: Users, shield: ShieldCheck, calendar: CalendarDays,
};
