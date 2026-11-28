import { ci } from "@/server/db/case-insensitive";
import "server-only";
import { getDatabase } from "@/server/db/client";
import { youTubeQuotaService } from "./quota-service";

export type YouTubeLanguage = "English" | "Hindi" | "Tamil" | "Telugu" | "Kannada" | "Malayalam" | "Other";

export interface YouTubeReviewItem {
  id?: string;
  dealId: string;
  videoId: string;
  title: string;
  channelTitle: string;
  channelId?: string | null;
  thumbnailUrl: string;
  publishedAt?: string | null;
  duration?: string | null;
  viewCount: number;
  likeCount?: number | null;
  language: YouTubeLanguage;
  relevanceScore: number;
  rankingPosition: number;
  isEmbeddable: boolean;
  isPinned: boolean;
  isActive: boolean;
}

export interface YouTubeDiscoveryResult {
  status: "LIVE_SUCCESS" | "NOT_CONFIGURED" | "NO_REVIEWS_FOUND" | "QUOTA_EXHAUSTED" | "API_ERROR" | "SEARCHING";
  message?: string;
  reviews: YouTubeReviewItem[];
}

/**
 * Format ISO 8601 duration (e.g. PT14M32S) into human readable time (e.g. 14:32).
 */
export function formatYouTubeDuration(isoDuration?: string | null): string {
  if (!isoDuration) return "";
  const match = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return "";
  const hours = match[1] ? parseInt(match[1], 10) : 0;
  const minutes = match[2] ? parseInt(match[2], 10) : 0;
  const seconds = match[3] ? parseInt(match[3], 10) : 0;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/**
 * Build canonical product key to group identical products across merchants and deals.
 * Example: "Samsung Galaxy S23 5G 128GB" -> "samsung_galaxy_s23_5g_128gb"
 */
export function buildCanonicalProductKey(brand: string, title: string): string {
  const cleanBrand = (brand || "").toLowerCase().trim();
  const cleanTitle = (title || "")
    .toLowerCase()
    .replace(/(\d+)\s*(gb|tb|mb|ram|rom)\b/gi, "$1$2")
    .replace(/\b(online|at best price|buy|deals?|offers?|sale|off|mrp|rs\.?|inr|limited time|free delivery|with|for|and|in)\b/gi, "")
    .replace(/\b(\d+%\s*off)\b/gi, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter((w) => w.length > 1)
    .slice(0, 10)
    .join("_");

  return `${cleanBrand}_${cleanTitle}`.slice(0, 150);
}

/**
 * Clean product title to build a focused YouTube search query.
 */
export function buildYouTubeSearchQuery(brand: string, title: string): string {
  const cleanTitle = title
    .replace(/\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\{[^}]*\}/g, " ")
    .replace(/\b\d+%\s*(off)?\b/gi, "")
    .replace(/\b(online|at best price|buy|deals?|offers?|sale|off|mrp|rs\.?|inr|limited time|free delivery)\b/gi, "")
    .replace(/[()[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const words = cleanTitle.split(" ").slice(0, 7).join(" ");
  if (brand && !words.toLowerCase().includes(brand.toLowerCase())) {
    return `${brand} ${words} review`.trim();
  }
  return `${words} review`.trim();
}

/**
 * Detect language from title script and metadata.
 */
function detectVideoLanguage(title: string, defaultLang?: string): YouTubeLanguage {
  if (/[\u0900-\u097F]/.test(title) || /\bhindi\b/i.test(title)) return "Hindi";
  if (/[\u0B80-\u0BFF]/.test(title) || /\btamil\b/i.test(title)) return "Tamil";
  if (/[\u0C00-\u0C7F]/.test(title) || /\btelugu\b/i.test(title)) return "Telugu";
  if (/[\u0C80-\u0CFF]/.test(title) || /\bkannada\b/i.test(title)) return "Kannada";
  if (/[\u0D00-\u0D7F]/.test(title) || /\bmalayalam\b/i.test(title)) return "Malayalam";

  if (defaultLang) {
    const l = defaultLang.toLowerCase();
    if (l.startsWith("hi")) return "Hindi";
    if (l.startsWith("ta")) return "Tamil";
    if (l.startsWith("te")) return "Telugu";
    if (l.startsWith("kn")) return "Kannada";
    if (l.startsWith("ml")) return "Malayalam";
    if (l.startsWith("en")) return "English";
  }

  return "English";
}

/**
 * Compute deterministic relevance score for a video candidate against product info.
 */
function calculateRelevanceScore(
  videoTitle: string,
  productBrand: string,
  productTitle: string,
  viewCount: number
): number {
  let score = 0;
  const titleLower = videoTitle.toLowerCase();
  const brandLower = productBrand.toLowerCase();
  const productWords = productTitle
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(" ")
    .filter((w) => w.length > 2);

  // 1. Brand match (+25)
  if (brandLower && titleLower.includes(brandLower)) {
    score += 25;
  }

  // 2. Key model words matching (+5 each, up to 35)
  let matchedWords = 0;
  for (const word of productWords) {
    if (titleLower.includes(word)) {
      matchedWords++;
      score += 5;
      if (matchedWords >= 7) break;
    }
  }

  // 3. Review / Unboxing / In-depth verification keywords (+20)
  if (/\b(review|unboxing|hands on|detailed review|long term|camera test|vs|comparison)\b/i.test(titleLower)) {
    score += 20;
  }

  // 4. Penalize irrelevant accessory or unrelated content (-30)
  if (/\b(cover|case|screen protector|back cover|strap|tampered glass)\b/i.test(titleLower)) {
    score -= 30;
  }

  // 5. Popularity/views signal (up to +15)
  if (viewCount > 0) {
    const logScore = Math.min(15, Math.log10(viewCount) * 3);
    score += logScore;
  }

  return Math.max(0, Math.round(score * 10) / 10);
}

export class YouTubeReviewsService {
  private inFlightSearches = new Set<string>();

  private getApiKey(): string | null {
    return process.env.YOUTUBE_DATA_API_KEY || null;
  }

  isConfigured(): boolean {
    return Boolean(this.getApiKey());
  }

  /**
   * Discovers and ranks the top 3 relevant YouTube product reviews for a deal.
   * Deterministically prioritizes language diversity: 1 English, 1 Hindi, 1 Indian Regional (Tamil/Telugu/etc).
   *
   * Features:
   * 1. Reuses existing results from the same canonical product (zero quota usage).
   * 2. In-flight request lock prevents duplicate simultaneous requests.
   * 3. Atomic quota reservation checks daily search cap (80) & unit cap (10,000).
   * 4. Updates Deal.youtubeReviewStatus and Deal.youtubeLastSearchedAt in PostgreSQL.
   */
  async discoverAndStoreReviews(
    deal: {
      id: string;
      brand: string;
      title: string;
    },
    options?: {
      refresh?: boolean;
      adminUserId?: string;
    }
  ): Promise<YouTubeDiscoveryResult> {
    const db = getDatabase();
    const canonicalKey = buildCanonicalProductKey(deal.brand, deal.title);

    // 1. Prevent duplicate simultaneous requests for the same canonical product
    if (this.inFlightSearches.has(canonicalKey)) {
      return {
        status: "SEARCHING",
        message: "A review search is already in progress for this product. Please wait.",
        reviews: [],
      };
    }

    // 2. Check existing reviews on this deal unless explicitly refreshing
    if (!options?.refresh) {
      const existingReviews = await this.getReviewsForDeal(deal.id);
      if (existingReviews.length > 0) {
        return {
          status: "LIVE_SUCCESS",
          message: "Loaded cached product reviews.",
          reviews: existingReviews,
        };
      }

      // 3. Reuse existing YouTube results when another deal refers to the same canonical product
      const otherDeals = await db.deal.findMany({
        where: {
          id: { not: deal.id },
          brand: { equals: deal.brand, ...ci() },
          videoReviews: { some: { isActive: true } },
        },
        include: {
          videoReviews: {
            where: { isActive: true },
            orderBy: [{ isPinned: "desc" }, { rankingPosition: "asc" }],
            take: 3,
          },
        },
        take: 10,
      });

      const matchingDeal = otherDeals.find(
        (od) => buildCanonicalProductKey(od.brand, od.title) === canonicalKey && od.videoReviews.length > 0
      );

      if (matchingDeal) {
        await db.$transaction(async (tx) => {
          for (const item of matchingDeal.videoReviews) {
            await tx.dealVideoReview.upsert({
              where: {
                dealId_videoId: {
                  dealId: deal.id,
                  videoId: item.videoId,
                },
              },
              create: {
                dealId: deal.id,
                videoId: item.videoId,
                title: item.title,
                channelTitle: item.channelTitle,
                channelId: item.channelId,
                thumbnailUrl: item.thumbnailUrl,
                publishedAt: item.publishedAt,
                duration: item.duration,
                viewCount: item.viewCount,
                likeCount: item.likeCount,
                language: item.language,
                relevanceScore: item.relevanceScore,
                rankingPosition: item.rankingPosition,
                isEmbeddable: item.isEmbeddable,
                isPinned: false,
                isActive: true,
              },
              update: {
                isActive: true,
              },
            });
          }
          await tx.deal.update({
            where: { id: deal.id },
            data: {
              youtubeReviewStatus: "COMPLETED",
              youtubeLastSearchedAt: new Date(),
            },
          });
        });

        const copied = await this.getReviewsForDeal(deal.id);
        return {
          status: "LIVE_SUCCESS",
          message: `Reused ${copied.length} reviews from matching product: "${matchingDeal.title}". Zero quota units consumed.`,
          reviews: copied,
        };
      }
    }

    const apiKey = this.getApiKey();
    if (!apiKey) {
      await db.deal.update({
        where: { id: deal.id },
        data: { youtubeReviewStatus: "FAILED" },
      });
      return {
        status: "NOT_CONFIGURED",
        message: "YOUTUBE_DATA_API_KEY environment variable is not configured. Live review discovery is paused.",
        reviews: [],
      };
    }

    this.inFlightSearches.add(canonicalKey);

    try {
      await db.deal.update({
        where: { id: deal.id },
        data: { youtubeReviewStatus: "SEARCHING" },
      });

      // Preserve any admin-pinned reviews
      const existingReviews = await db.dealVideoReview.findMany({
        where: { dealId: deal.id },
      });
      const pinnedReviews = existingReviews.filter((r) => r.isPinned);

      const baseQuery = buildYouTubeSearchQuery(deal.brand, deal.title);

      // Requirement: 1 combined YouTube search request per unique canonical product (retrieving up to 50 results)
      const reservation = await youTubeQuotaService.reserveQuota("search.list", 100, {
        dealId: deal.id,
        canonicalProduct: canonicalKey,
        adminUserId: options?.adminUserId,
      });

      if (!reservation.allowed) {
        await db.deal.update({
          where: { id: deal.id },
          data: { youtubeReviewStatus: "FAILED" },
        });
        return {
          status: "QUOTA_EXHAUSTED",
          message: reservation.blockedReason || "Daily YouTube API quota cap reached.",
          reviews: [],
        };
      }

      const rawVideoIds = new Set<string>();

      try {
        const searchUrl = new URL("https://www.googleapis.com/youtube/v3/search");
        searchUrl.searchParams.set("part", "snippet");
        searchUrl.searchParams.set("type", "video");
        searchUrl.searchParams.set("videoEmbeddable", "true");
        searchUrl.searchParams.set("maxResults", "50");
        searchUrl.searchParams.set("q", baseQuery);
        searchUrl.searchParams.set("key", apiKey);

        const res = await fetch(searchUrl.toString(), {
          headers: { Accept: "application/json" },
        });

        if (!res.ok) {
          await youTubeQuotaService.recordQuotaOutcome(reservation.ledgerId!, false, {
            errorCategory: res.status === 403 ? "QUOTA_EXHAUSTED" : `HTTP_${res.status}`,
            errorMessage: `Search API returned status ${res.status}: ${res.statusText}`,
          });

          if (res.status === 403) {
            await db.deal.update({
              where: { id: deal.id },
              data: { youtubeReviewStatus: "FAILED" },
            });
            return {
              status: "QUOTA_EXHAUSTED",
              message: "YouTube Data API quota exceeded or key lacks permissions.",
              reviews: [],
            };
          }
        } else {
          await youTubeQuotaService.recordQuotaOutcome(reservation.ledgerId!, true);
          const data = (await res.json()) as {
            items?: Array<{ id?: { videoId?: string } }>;
          };
          if (Array.isArray(data.items)) {
            for (const item of data.items) {
              if (item.id?.videoId) {
                rawVideoIds.add(item.id.videoId);
              }
            }
          }
        }
      } catch (fetchErr) {
        await youTubeQuotaService.recordQuotaOutcome(reservation.ledgerId!, false, {
          errorCategory: "NETWORK_ERROR",
          errorMessage: fetchErr instanceof Error ? fetchErr.message : String(fetchErr),
        });
      }

      if (rawVideoIds.size === 0) {
        await db.deal.update({
          where: { id: deal.id },
          data: {
            youtubeReviewStatus: "NO_REVIEWS_FOUND",
            youtubeLastSearchedAt: new Date(),
          },
        });
        return {
          status: "NO_REVIEWS_FOUND",
          message: "No embeddable YouTube reviews returned from search.",
          reviews: [],
        };
      }

      // Batch video details retrieval: videos.list accepts up to 50 IDs in a single batch (1 quota unit)
      const vidReservation = await youTubeQuotaService.reserveQuota("videos.list", 1, {
        dealId: deal.id,
        canonicalProduct: canonicalKey,
        adminUserId: options?.adminUserId,
      });

      const videoIdsBatch = Array.from(rawVideoIds).slice(0, 50);
      const videoDetailsUrl = new URL("https://www.googleapis.com/youtube/v3/videos");
      videoDetailsUrl.searchParams.set("part", "snippet,contentDetails,statistics,status");
      videoDetailsUrl.searchParams.set("id", videoIdsBatch.join(","));
      videoDetailsUrl.searchParams.set("key", apiKey);

      const detailRes = await fetch(videoDetailsUrl.toString(), {
        headers: { Accept: "application/json" },
      });

      if (!detailRes.ok) {
        if (vidReservation.allowed && vidReservation.ledgerId) {
          await youTubeQuotaService.recordQuotaOutcome(vidReservation.ledgerId, false, {
            errorCategory: `HTTP_${detailRes.status}`,
            errorMessage: `Video details API returned ${detailRes.status}`,
          });
        }
        await db.deal.update({
          where: { id: deal.id },
          data: { youtubeReviewStatus: "FAILED" },
        });
        return {
          status: "API_ERROR",
          message: `YouTube API returned HTTP ${detailRes.status}: ${detailRes.statusText}`,
          reviews: [],
        };
      }

      if (vidReservation.allowed && vidReservation.ledgerId) {
        await youTubeQuotaService.recordQuotaOutcome(vidReservation.ledgerId, true);
      }

      const detailData = (await detailRes.json()) as {
        items?: Array<{
          id: string;
          snippet: {
            title: string;
            description?: string;
            channelTitle: string;
            channelId?: string;
            thumbnails?: {
              high?: { url?: string };
              medium?: { url?: string };
              default?: { url?: string };
            };
            publishedAt?: string;
            defaultLanguage?: string;
            defaultAudioLanguage?: string;
          };
          contentDetails?: {
            duration?: string;
          };
          statistics?: {
            viewCount?: string;
            likeCount?: string;
          };
          status?: {
            embeddable?: boolean;
          };
        }>;
      };

      if (!Array.isArray(detailData.items) || detailData.items.length === 0) {
        await db.deal.update({
          where: { id: deal.id },
          data: {
            youtubeReviewStatus: "NO_REVIEWS_FOUND",
            youtubeLastSearchedAt: new Date(),
          },
        });
        return {
          status: "NO_REVIEWS_FOUND",
          message: "No detailed video records found.",
          reviews: [],
        };
      }

      // Map candidates and score them
      const candidateList: YouTubeReviewItem[] = [];

      for (const item of detailData.items) {
        if (item.status?.embeddable === false) continue;

        const videoId = item.id;
        const title = item.snippet.title;
        const channelTitle = item.snippet.channelTitle;
        const channelId = item.snippet.channelId || null;
        const thumbnailUrl =
          item.snippet.thumbnails?.high?.url ||
          item.snippet.thumbnails?.medium?.url ||
          item.snippet.thumbnails?.default?.url ||
          `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
        const publishedAt = item.snippet.publishedAt || null;
        const duration = formatYouTubeDuration(item.contentDetails?.duration);
        const viewCount = parseInt(item.statistics?.viewCount || "0", 10);
        const likeCount = item.statistics?.likeCount ? parseInt(item.statistics.likeCount, 10) : null;
        const language = detectVideoLanguage(
          title,
          item.snippet.defaultAudioLanguage || item.snippet.defaultLanguage
        );

        const relevanceScore = calculateRelevanceScore(title, deal.brand, deal.title, viewCount);
        if (relevanceScore < 20) continue;

        candidateList.push({
          dealId: deal.id,
          videoId,
          title,
          channelTitle,
          channelId,
          thumbnailUrl,
          publishedAt,
          duration,
          viewCount,
          likeCount,
          language,
          relevanceScore,
          rankingPosition: 1,
          isEmbeddable: true,
          isPinned: false,
          isActive: true,
        });
      }

      if (candidateList.length === 0) {
        await db.deal.update({
          where: { id: deal.id },
          data: {
            youtubeReviewStatus: "NO_REVIEWS_FOUND",
            youtubeLastSearchedAt: new Date(),
          },
        });
        return {
          status: "NO_REVIEWS_FOUND",
          message: "No product review candidate met relevance criteria.",
          reviews: [],
        };
      }

      // Deterministic Language Diversity Selection: 1 English, 1 Hindi, 1 Regional
      const selected: YouTubeReviewItem[] = [];
      const remainingCandidates = [...candidateList].sort((a, b) => b.relevanceScore - a.relevanceScore);

      for (const pinned of pinnedReviews) {
        selected.push({
          dealId: deal.id,
          videoId: pinned.videoId,
          title: pinned.title,
          channelTitle: pinned.channelTitle,
          channelId: pinned.channelId,
          thumbnailUrl: pinned.thumbnailUrl,
          publishedAt: pinned.publishedAt?.toISOString() || null,
          duration: pinned.duration,
          viewCount: pinned.viewCount,
          likeCount: pinned.likeCount,
          language: pinned.language as YouTubeLanguage,
          relevanceScore: pinned.relevanceScore,
          rankingPosition: selected.length + 1,
          isEmbeddable: pinned.isEmbeddable,
          isPinned: true,
          isActive: pinned.isActive,
        });
      }

      const pickLanguage = (lang: YouTubeLanguage | YouTubeLanguage[]): YouTubeReviewItem | null => {
        const targets = Array.isArray(lang) ? lang : [lang];
        const idx = remainingCandidates.findIndex(
          (c) => targets.includes(c.language) && !selected.some((s) => s.videoId === c.videoId)
        );
        if (idx !== -1) {
          const item = remainingCandidates[idx];
          remainingCandidates.splice(idx, 1);
          return item;
        }
        return null;
      };

      if (selected.length < 3 && !selected.some((s) => s.language === "English")) {
        const eng = pickLanguage("English");
        if (eng) selected.push(eng);
      }

      if (selected.length < 3 && !selected.some((s) => s.language === "Hindi")) {
        const hin = pickLanguage("Hindi");
        if (hin) selected.push(hin);
      }

      if (selected.length < 3) {
        const reg = pickLanguage(["Tamil", "Telugu", "Kannada", "Malayalam"]);
        if (reg) selected.push(reg);
      }

      while (selected.length < 3 && remainingCandidates.length > 0) {
        const next = remainingCandidates.shift();
        if (next && !selected.some((s) => s.videoId === next.videoId)) {
          selected.push(next);
        }
      }

      selected.forEach((item, index) => {
        item.rankingPosition = index + 1;
      });

      // Canonical product reuse: find all other deals matching this exact canonical product
      const matchingDeals = await db.deal.findMany({
        where: {
          brand: { equals: deal.brand, ...ci() },
          id: { not: deal.id },
        },
        select: { id: true, brand: true, title: true },
      });

      const siblingDeals = matchingDeals.filter(
        (d) => buildCanonicalProductKey(d.brand, d.title) === canonicalKey
      );

      // Persist to PostgreSQL database using transaction for this deal and all sibling deals
      await db.$transaction(async (tx) => {
        const allTargetDealIds = [deal.id, ...siblingDeals.map((s) => s.id)];

        for (const targetDealId of allTargetDealIds) {
          for (const item of selected) {
            await tx.dealVideoReview.upsert({
              where: {
                dealId_videoId: {
                  dealId: targetDealId,
                  videoId: item.videoId,
                },
              },
              create: {
                dealId: targetDealId,
                videoId: item.videoId,
                title: item.title,
                channelTitle: item.channelTitle,
                channelId: item.channelId,
                thumbnailUrl: item.thumbnailUrl,
                publishedAt: item.publishedAt ? new Date(item.publishedAt) : null,
                duration: item.duration,
                viewCount: item.viewCount,
                likeCount: item.likeCount,
                language: item.language,
                relevanceScore: item.relevanceScore,
                rankingPosition: item.rankingPosition,
                isEmbeddable: item.isEmbeddable,
                isPinned: targetDealId === deal.id ? item.isPinned : false,
                isActive: item.isActive,
              },
              update: {
                title: item.title,
                channelTitle: item.channelTitle,
                thumbnailUrl: item.thumbnailUrl,
                publishedAt: item.publishedAt ? new Date(item.publishedAt) : null,
                duration: item.duration,
                viewCount: item.viewCount,
                likeCount: item.likeCount,
                language: item.language,
                relevanceScore: item.relevanceScore,
                rankingPosition: item.rankingPosition,
                lastFetchedAt: new Date(),
              },
            });
          }

          await tx.deal.update({
            where: { id: targetDealId },
            data: {
              youtubeReviewStatus: selected.length > 0 ? "COMPLETED" : "NO_REVIEWS_FOUND",
              youtubeLastSearchedAt: new Date(),
            },
          });
        }
      });

      return {
        status: "LIVE_SUCCESS",
        reviews: selected,
      };
    } catch (err) {
      await db.deal.update({
        where: { id: deal.id },
        data: { youtubeReviewStatus: "FAILED" },
      });
      return {
        status: "API_ERROR",
        message: err instanceof Error ? err.message : String(err),
        reviews: [],
      };
    } finally {
      this.inFlightSearches.delete(canonicalKey);
    }
  }

  /**
   * Retrieves stored reviews for a deal from PostgreSQL.
   */
  async getReviewsForDeal(dealId: string): Promise<YouTubeReviewItem[]> {
    const db = getDatabase();
    const rows = await db.dealVideoReview.findMany({
      where: { dealId, isActive: true },
      orderBy: [{ isPinned: "desc" }, { rankingPosition: "asc" }],
      take: 3,
    });

    return rows.map((r) => ({
      id: r.id,
      dealId: r.dealId,
      videoId: r.videoId,
      title: r.title,
      channelTitle: r.channelTitle,
      channelId: r.channelId,
      thumbnailUrl: r.thumbnailUrl,
      publishedAt: r.publishedAt?.toISOString() || null,
      duration: r.duration,
      viewCount: r.viewCount,
      likeCount: r.likeCount,
      language: r.language as YouTubeLanguage,
      relevanceScore: r.relevanceScore,
      rankingPosition: r.rankingPosition,
      isEmbeddable: r.isEmbeddable,
      isPinned: r.isPinned,
      isActive: r.isActive,
    }));
  }

  /**
   * Search YouTube for the top 20 candidate review videos for a product.
   * Returns candidates with rich metadata so the administrator can select up to 3.
   */
  async searchTop20Videos(
    brand: string,
    title: string,
    options?: { adminUserId?: string }
  ): Promise<{
    status: "SUCCESS" | "NOT_CONFIGURED" | "NO_REVIEWS_FOUND" | "QUOTA_EXHAUSTED" | "API_ERROR";
    message?: string;
    videos: Array<{
      videoId: string;
      videoUrl: string;
      title: string;
      channelTitle: string;
      channelId?: string | null;
      thumbnailUrl: string;
      publishedAt?: string | null;
      duration?: string | null;
      viewCount: number;
      likeCount?: number | null;
      language: YouTubeLanguage;
      relevanceScore: number;
    }>;
  }> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      return {
        status: "NOT_CONFIGURED",
        message: "YOUTUBE_DATA_API_KEY environment variable is not configured.",
        videos: [],
      };
    }

    const baseQuery = buildYouTubeSearchQuery(brand, title);
    const reservation = await youTubeQuotaService.reserveQuota("search.list", 100, {
      adminUserId: options?.adminUserId,
    });

    if (!reservation.allowed) {
      return {
        status: "QUOTA_EXHAUSTED",
        message: reservation.blockedReason || "Daily YouTube API quota cap reached.",
        videos: [],
      };
    }

    const rawVideoIds = new Set<string>();

    try {
      const searchUrl = new URL("https://www.googleapis.com/youtube/v3/search");
      searchUrl.searchParams.set("part", "snippet");
      searchUrl.searchParams.set("type", "video");
      searchUrl.searchParams.set("videoEmbeddable", "true");
      searchUrl.searchParams.set("maxResults", "25");
      searchUrl.searchParams.set("q", baseQuery);
      searchUrl.searchParams.set("key", apiKey);

      const res = await fetch(searchUrl.toString(), {
        headers: { Accept: "application/json" },
      });

      if (!res.ok) {
        await youTubeQuotaService.recordQuotaOutcome(reservation.ledgerId!, false, {
          errorCategory: res.status === 403 ? "QUOTA_EXHAUSTED" : `HTTP_${res.status}`,
          errorMessage: `Search API returned status ${res.status}: ${res.statusText}`,
        });

        if (res.status === 403) {
          return {
            status: "QUOTA_EXHAUSTED",
            message: "YouTube Data API quota exceeded or key lacks permissions.",
            videos: [],
          };
        }
        return {
          status: "API_ERROR",
          message: `YouTube Search API returned HTTP ${res.status}`,
          videos: [],
        };
      }

      await youTubeQuotaService.recordQuotaOutcome(reservation.ledgerId!, true);
      const data = (await res.json()) as {
        items?: Array<{ id?: { videoId?: string } }>;
      };
      if (Array.isArray(data.items)) {
        for (const item of data.items) {
          if (item.id?.videoId) {
            rawVideoIds.add(item.id.videoId);
          }
        }
      }
    } catch (fetchErr) {
      await youTubeQuotaService.recordQuotaOutcome(reservation.ledgerId!, false, {
        errorCategory: "NETWORK_ERROR",
        errorMessage: fetchErr instanceof Error ? fetchErr.message : String(fetchErr),
      });
      return {
        status: "API_ERROR",
        message: fetchErr instanceof Error ? fetchErr.message : "Network error during search",
        videos: [],
      };
    }

    if (rawVideoIds.size === 0) {
      return {
        status: "NO_REVIEWS_FOUND",
        message: "No videos found for this product.",
        videos: [],
      };
    }

    // Batch video details retrieval: videos.list
    const vidReservation = await youTubeQuotaService.reserveQuota("videos.list", 1, {
      adminUserId: options?.adminUserId,
    });

    const videoIdsBatch = Array.from(rawVideoIds).slice(0, 25);
    const videoDetailsUrl = new URL("https://www.googleapis.com/youtube/v3/videos");
    videoDetailsUrl.searchParams.set("part", "snippet,contentDetails,statistics,status");
    videoDetailsUrl.searchParams.set("id", videoIdsBatch.join(","));
    videoDetailsUrl.searchParams.set("key", apiKey);

    const detailRes = await fetch(videoDetailsUrl.toString(), {
      headers: { Accept: "application/json" },
    });

    if (!detailRes.ok) {
      if (vidReservation.allowed && vidReservation.ledgerId) {
        await youTubeQuotaService.recordQuotaOutcome(vidReservation.ledgerId, false, {
          errorCategory: `HTTP_${detailRes.status}`,
          errorMessage: `Video details API returned ${detailRes.status}`,
        });
      }
      return {
        status: "API_ERROR",
        message: `YouTube API returned HTTP ${detailRes.status}: ${detailRes.statusText}`,
        videos: [],
      };
    }

    if (vidReservation.allowed && vidReservation.ledgerId) {
      await youTubeQuotaService.recordQuotaOutcome(vidReservation.ledgerId, true);
    }

    const detailData = (await detailRes.json()) as {
      items?: Array<{
        id: string;
        snippet: {
          title: string;
          channelTitle: string;
          channelId?: string;
          thumbnails?: {
            high?: { url?: string };
            medium?: { url?: string };
            default?: { url?: string };
          };
          publishedAt?: string;
          defaultLanguage?: string;
          defaultAudioLanguage?: string;
        };
        contentDetails?: { duration?: string };
        statistics?: { viewCount?: string; likeCount?: string };
        status?: { embeddable?: boolean };
      }>;
    };

    if (!Array.isArray(detailData.items) || detailData.items.length === 0) {
      return {
        status: "NO_REVIEWS_FOUND",
        message: "No detailed video records found.",
        videos: [],
      };
    }

    const results = [];
    for (const item of detailData.items) {
      if (item.status?.embeddable === false) continue;
      const videoId = item.id;
      const title = item.snippet.title;
      const channelTitle = item.snippet.channelTitle;
      const channelId = item.snippet.channelId || null;
      const thumbnailUrl =
        item.snippet.thumbnails?.high?.url ||
        item.snippet.thumbnails?.medium?.url ||
        item.snippet.thumbnails?.default?.url ||
        `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
      const publishedAt = item.snippet.publishedAt || null;
      const duration = formatYouTubeDuration(item.contentDetails?.duration);
      const viewCount = parseInt(item.statistics?.viewCount || "0", 10);
      const likeCount = item.statistics?.likeCount ? parseInt(item.statistics.likeCount, 10) : null;
      const language = detectVideoLanguage(
        title,
        item.snippet.defaultAudioLanguage || item.snippet.defaultLanguage
      );
      const relevanceScore = calculateRelevanceScore(title, brand, title, viewCount);

      results.push({
        videoId,
        videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
        title,
        channelTitle,
        channelId,
        thumbnailUrl,
        publishedAt,
        duration,
        viewCount,
        likeCount,
        language,
        relevanceScore,
      });
    }

    results.sort((a, b) => b.relevanceScore - a.relevanceScore || b.viewCount - a.viewCount);

    return {
      status: "SUCCESS",
      videos: results.slice(0, 20),
    };
  }

  /**
   * Save administrator-selected YouTube videos (up to 3) for a deal.
   * Parses video URLs/IDs, fetches metadata from YouTube if needed, and saves to PostgreSQL.
   */
  async saveCustomVideosForDeal(
    dealId: string,
    videoUrlsOrIds: string[],
    options?: { adminUserId?: string }
  ): Promise<{ success: boolean; reviews: YouTubeReviewItem[] }> {
    const db = getDatabase();
    const deal = await db.deal.findUnique({ where: { id: dealId } });
    if (!deal) throw new Error("Deal not found.");

    // Extract video IDs
    const parsedIds: string[] = [];
    for (const raw of videoUrlsOrIds) {
      if (!raw || typeof raw !== "string") continue;
      const trimmed = raw.trim();
      const match =
        trimmed.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|shorts\/|watch\?.+&v=))([\w-]{11})/i) ||
        trimmed.match(/^([\w-]{11})$/);
      if (match?.[1] && !parsedIds.includes(match[1])) {
        parsedIds.push(match[1]);
      }
    }

    if (parsedIds.length === 0) {
      await db.dealVideoReview.updateMany({
        where: { dealId },
        data: { isActive: false },
      });
      await db.deal.update({
        where: { id: dealId },
        data: { youtubeReviewStatus: "NOT_REQUESTED" },
      });
      return { success: true, reviews: [] };
    }

    const apiKey = this.getApiKey();
    const videoDetailsMap = new Map<string, {
      title: string;
      channelTitle: string;
      channelId?: string | null;
      thumbnailUrl: string;
      duration?: string | null;
      viewCount: number;
      likeCount?: number | null;
      publishedAt?: Date | null;
      language: YouTubeLanguage;
    }>();

    if (apiKey) {
      try {
        const vidReservation = await youTubeQuotaService.reserveQuota("videos.list", 1, {
          dealId,
          adminUserId: options?.adminUserId,
        });

        const videoDetailsUrl = new URL("https://www.googleapis.com/youtube/v3/videos");
        videoDetailsUrl.searchParams.set("part", "snippet,contentDetails,statistics,status");
        videoDetailsUrl.searchParams.set("id", parsedIds.slice(0, 50).join(","));
        videoDetailsUrl.searchParams.set("key", apiKey);

        const detailRes = await fetch(videoDetailsUrl.toString(), {
          headers: { Accept: "application/json" },
        });

        if (detailRes.ok) {
          if (vidReservation.allowed && vidReservation.ledgerId) {
            await youTubeQuotaService.recordQuotaOutcome(vidReservation.ledgerId, true);
          }
          const detailData = (await detailRes.json()) as {
            items?: Array<{
              id: string;
              snippet?: {
                title?: string;
                channelTitle?: string;
                channelId?: string;
                publishedAt?: string;
                thumbnails?: {
                  high?: { url?: string };
                  medium?: { url?: string };
                  default?: { url?: string };
                };
              };
              contentDetails?: { duration?: string };
              statistics?: { viewCount?: string; likeCount?: string };
            }>;
          };
          if (Array.isArray(detailData.items)) {
            for (const item of detailData.items) {
              const vId = item.id;
              videoDetailsMap.set(vId, {
                title: item.snippet?.title || `YouTube Video (${vId})`,
                channelTitle: item.snippet?.channelTitle || "YouTube Creator",
                channelId: item.snippet?.channelId || null,
                thumbnailUrl:
                  item.snippet?.thumbnails?.high?.url ||
                  item.snippet?.thumbnails?.medium?.url ||
                  item.snippet?.thumbnails?.default?.url ||
                  `https://i.ytimg.com/vi/${vId}/hqdefault.jpg`,
                duration: formatYouTubeDuration(item.contentDetails?.duration),
                viewCount: parseInt(item.statistics?.viewCount || "0", 10),
                likeCount: item.statistics?.likeCount ? parseInt(item.statistics.likeCount, 10) : null,
                publishedAt: item.snippet?.publishedAt ? new Date(item.snippet.publishedAt) : null,
                language: detectVideoLanguage(item.snippet?.title || ""),
              });
            }
          }
        }
      } catch {
        // Fallback gracefully below
      }
    }

    await db.$transaction(async (tx) => {
      // Deactivate all existing reviews for this deal
      await tx.dealVideoReview.updateMany({
        where: { dealId },
        data: { isActive: false },
      });

      for (let i = 0; i < parsedIds.length; i++) {
        const videoId = parsedIds[i];
        const details = videoDetailsMap.get(videoId);

        await tx.dealVideoReview.upsert({
          where: { dealId_videoId: { dealId, videoId } },
          create: {
            dealId,
            videoId,
            title: details?.title || `YouTube Video (${videoId})`,
            channelTitle: details?.channelTitle || "YouTube Creator",
            channelId: details?.channelId || null,
            thumbnailUrl: details?.thumbnailUrl || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
            duration: details?.duration || null,
            viewCount: details?.viewCount || 0,
            likeCount: details?.likeCount || null,
            publishedAt: details?.publishedAt || null,
            language: details?.language || "English",
            relevanceScore: 100,
            rankingPosition: i + 1,
            isEmbeddable: true,
            isPinned: true,
            isActive: true,
          },
          update: {
            title: details?.title || undefined,
            channelTitle: details?.channelTitle || undefined,
            thumbnailUrl: details?.thumbnailUrl || undefined,
            duration: details?.duration || undefined,
            viewCount: details?.viewCount || undefined,
            likeCount: details?.likeCount || undefined,
            rankingPosition: i + 1,
            isActive: true,
            isPinned: true,
          },
        });
      }

      await tx.deal.update({
        where: { id: dealId },
        data: {
          youtubeReviewStatus: "COMPLETED",
          youtubeLastSearchedAt: new Date(),
        },
      });
    });

    const finalReviews = await this.getReviewsForDeal(dealId);
    return { success: true, reviews: finalReviews };
  }
}

export const youtubeReviewsService = new YouTubeReviewsService();
