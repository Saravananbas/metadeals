"use client";
import Image from "next/image";
import { useEffect, useState, type FormEvent, type ReactNode, useRef } from "react";
import type { DealInput } from "../validation";
import { minorSavings } from "../validation";
import type { ClientExtractionResult } from "../extraction-types";
import {
  rupeesToPaise,
  paiseToRupeeInputString,
  formatPaise,
  formatINR,
} from "../currency";
import { can, type AdminRole } from "@/server/auth/permissions";
import { Calendar, Eye, ImageIcon, Link2, Save, Send, Settings, Tag, UploadCloud, Plus, Wand2, X } from "lucide-react";
import { AdminNav } from "@/components/admin/AdminNav";
import { ProgressPanel } from "@/features/deal-form/ProgressPanel";
import { SameLinkNotice, SimilarDeals, useDealCheck } from "@/features/deal-form/SimilarDeals";
import { htmlToPlain, textToHtml } from "@/features/deal-form/text";
import { RichEditor } from "@/features/community/components/RichEditor";
import { classifyDeal, type DealTab } from "../tabs";
import styles from "./manager.module.css";

type Entry = { id: string; name: string; slug: string; parentId?: string | null; websiteUrl?: string };
type DirectoryMerchant = {
  id: string;
  name: string;
  websiteUrl: string;
  domain: string;
  logoUrl: string | null;
  status: string;
};
type Row = Omit<DealInput, "status"> & {
  id: string;
  version: number;
  status: string;
  everPublished: boolean;
  galleryImages?: Array<{ mediaId: string; position: number }>;
};
type YouTubeVideoCandidate = {
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
  language?: string;
  relevanceScore?: number;
};
type YouTubeReviewRow = { isActive?: boolean; videoUrl?: string | null };
type PreviewEditField = "title" | "photos" | "brand" | "description" | "category" | "merchant" | "price" | "coupon" | "rating" | "youtube";

interface AdminDealForm extends Omit<DealInput, "mrpMinor" | "priceMinor" | "options"> {
  mrpRupees: string;
  priceRupees: string;
  youtubeVideoUrls?: string[];
  galleryImageUrls?: string[];
  options: Array<{
    merchantId: string;
    priceRupees: string;
    productUrl: string;
    affiliateUrl: string | null;
  }>;
}

const empty: AdminDealForm = {
  slug: "",
  title: "",
  brand: "",
  description: "",
  categoryId: "",
  merchantId: "",
  mediaId: "",
  mrpRupees: "",
  priceRupees: "",
  currency: "INR",
  rating: null,
  reviewCount: null,
  ratingSource: null,
  productUrl: "",
  affiliateUrl: null,
  couponCode: null,
  editorNotes: null,
  status: "DRAFT",
  publishedAt: null,
  startsAt: null,
  expiresAt: null,
  featured: false,
  trending: false,
  youtubeVideoUrls: ["", "", ""],
  galleryMediaIds: [],
  galleryImageUrls: [],
  options: [],
};

/** Lower-case words joined by single hyphens, the only form the server accepts for a slug. */
const toSlug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

async function request<T>(path: string, method = "GET", body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api/v1/admin/${path}`, {
    method,
    ...(signal ? { signal } : {}),
    ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  if (!response.ok) {
    // Validation errors name the fields that failed, so the editor can see what to fix.
    const detail = Array.isArray(data.error?.fields) ? data.error.fields.slice(0, 3).map((f: { path: string; message: string }) => `${f.path || "form"}: ${f.message}`).join("; ") : "";
    throw new Error(`${data.error?.message ?? "Request failed."}${detail ? ` (${detail})` : ""}`);
  }
  return data;
}

export function DealManager({ role, permissions = null }: { role: AdminRole; permissions?: readonly string[] | null }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [categories, setCategories] = useState<Entry[]>([]);
  const [merchants, setMerchants] = useState<Entry[]>([]);
  const [directoryMerchants, setDirectoryMerchants] = useState<DirectoryMerchant[]>([]);
  const [form, setForm] = useState<AdminDealForm>(empty);
  const [selectedParentCategoryId, setSelectedParentCategoryId] = useState<string>("");
  const [selected, setSelected] = useState<Row | null>(null);
  // The Edit button on the deals table opens the form in a pop-up. Saving a NEW deal also selects it, but that must not pop anything up, so the pop-up is tied to the id it was opened for.
  const [modalDealId, setModalDealId] = useState<string | null>(null);
  const editModal = selected !== null && modalDealId === selected.id;
  const [preview, setPreview] = useState<{ data: Row; previewToken: string } | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(1);
  // Active / Expired / Deleted: the list is fetched per tab, and a deal moves between them by itself (end date passes, or it is deleted).
  const [dealTab, setDealTab] = useState<DealTab>("active");
  const [tabCounts, setTabCounts] = useState({ active: 0, expired: 0, deleted: 0 });
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<string>("");
  const [taxonomy, setTaxonomy] = useState({
    kind: "categories",
    id: "",
    name: "",
    slug: "",
    parentId: "",
    websiteUrl: "",
  });

  const [extracting, setExtracting] = useState(false);
  const extractionController = useRef<AbortController | null>(null);
  const [extractProgress, setExtractProgress] = useState("");
  const [detectedRetailer, setDetectedRetailer] = useState<string | null>(null);
  const [extractionResult, setExtractionResult] = useState<ClientExtractionResult | null>(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewCategory, setPreviewCategory] = useState<string>("");
  const [previewMerchant, setPreviewMerchant] = useState<string>("");
  const [previewTitle, setPreviewTitle] = useState<string>("");
  const [previewBrand, setPreviewBrand] = useState<string>("");
  const [previewDescription, setPreviewDescription] = useState<string>("");
  const [previewMrp, setPreviewMrp] = useState<string>("");
  const [previewPrice, setPreviewPrice] = useState<string>("");
  const [previewCoupon, setPreviewCoupon] = useState<string>("");
  const [previewImageUrl, setPreviewImageUrl] = useState<string>("");
  const [previewGalleryImageUrls, setPreviewGalleryImageUrls] = useState<string[]>([]);
  const [previewMediaId, setPreviewMediaId] = useState<string>("");
  const [previewRating, setPreviewRating] = useState<string>("");
  const [previewReviewCount, setPreviewReviewCount] = useState<string>("");
  const [previewEditingField, setPreviewEditingField] = useState<PreviewEditField | null>(null);
  const [previewEditValue, setPreviewEditValue] = useState("");
  const [previewEditSecondaryValue, setPreviewEditSecondaryValue] = useState("");
  const [publishingDirect, setPublishingDirect] = useState<boolean>(false);
  // Set by the header "Publish Deal" button: save first, then open the existing saved-version preview whose confirm step publishes.
  const publishAfterSave = useRef(false);
  const activeTab: string = "deals";

  function merchantDomain(value: string) {
    try {
      return new URL(value.startsWith("http") ? value : `https://${value}`).hostname.toLowerCase().replace(/^www\./, "");
    } catch {
      return value.toLowerCase().replace(/^www\./, "").split("/")[0];
    }
  }

  function findDirectoryMerchant(
    urls: string[],
    retailerHints: string[] = [],
    directory: DirectoryMerchant[] = directoryMerchants,
  ) {
    const activeMerchants = directory.filter((merchant) => merchant.status === "ACTIVE");
    const hosts = urls.map(merchantDomain).filter(Boolean);
    const domainMatch = activeMerchants.find((merchant) => {
      const domain = merchantDomain(merchant.domain || merchant.websiteUrl);
      return hosts.some((host) => host === domain || host.endsWith(`.${domain}`));
    });
    if (domainMatch) return domainMatch;

    // Some directory entries use a country-specific domain (for example
    // bata.in) while a product link uses the brand's global domain (bata.com).
    // Match exact host labels to the merchant's name tokens as a safe fallback.
    const hostLabels = new Set(hosts.flatMap((host) => host.split(".").map((label) => label.replace(/[^a-z0-9]+/g, ""))).filter(Boolean));
    const brandNameMatches = activeMerchants.filter((merchant) => {
      const nameTokens = merchant.name.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
      return nameTokens.some((token) => token.length >= 3 && hostLabels.has(token));
    });
    if (brandNameMatches.length === 1) return brandNameMatches[0];

    const normalizedHints = retailerHints.map((hint) => hint.toLowerCase().replace(/[^a-z0-9]+/g, "").trim()).filter(Boolean);
    const aliases: Record<string, string[]> = {
      flipkart: ["flipkart", "fkrt"],
      amazon: ["amazon", "amzn"],
      tatacliq: ["tatacliq", "tatacliqpartner"],
      reliancedigital: ["reliancedigital", "reliance"],
    };
    const expandedHints = new Set(normalizedHints.flatMap((hint) => aliases[hint] || [hint]));
    return activeMerchants.find((merchant) => {
      const name = merchant.name.toLowerCase().replace(/[^a-z0-9]+/g, "").trim();
      const domain = merchantDomain(merchant.domain || merchant.websiteUrl).replace(/[^a-z0-9]+/g, "");
      return expandedHints.has(name) || expandedHints.has(domain);
    });
  }

  function beginPreviewEdit(fieldName: PreviewEditField, value: string, secondaryValue = "") {
    setPreviewEditingField(fieldName);
    setPreviewEditValue(value);
    setPreviewEditSecondaryValue(secondaryValue);
  }

  function savePreviewEdit() {
    switch (previewEditingField) {
      case "title": setPreviewTitle(previewEditValue.trim()); break;
      case "photos": {
        const urls = previewEditValue.split("\n").map((url) => url.trim()).filter(Boolean).slice(0, 11);
        setPreviewGalleryImageUrls(urls);
        setPreviewImageUrl(urls[0] || "");
        setPreviewMediaId("");
        break;
      }
      case "brand": setPreviewBrand(previewEditValue.trim()); break;
      case "description": setPreviewDescription(previewEditValue.trim()); break;
      case "category": setPreviewCategory(previewEditValue); break;
      case "merchant": setPreviewMerchant(previewEditValue); break;
      case "price":
        setPreviewMrp(previewEditValue.trim());
        setPreviewPrice(previewEditSecondaryValue.trim());
        break;
      case "coupon": setPreviewCoupon(previewEditValue.trim()); break;
      case "rating":
        setPreviewRating(previewEditValue.trim());
        setPreviewReviewCount(previewEditSecondaryValue.trim());
        break;
      case "youtube":
        setPreviewYoutubeUrls(previewEditValue.split("\n").map((url) => url.trim()).slice(0, 3));
        break;
    }
    setPreviewEditingField(null);
  }

  function previewPencil(fieldName: PreviewEditField, label: string, value: string, secondaryValue = "") {
    return (
      <button
        type="button"
        className={styles.editIconBtn}
        aria-label={`Edit ${label}`}
        title={`Edit ${label}`}
        onClick={() => beginPreviewEdit(fieldName, value, secondaryValue)}
      >
        ✏️
      </button>
    );
  }

  function previewEditActions() {
    return (
      <div className={styles.inlineEditActions}>
        <button type="button" className={styles.saveIconBtn} onClick={savePreviewEdit}>Save</button>
        <button type="button" className={styles.cancelIconBtn} onClick={() => setPreviewEditingField(null)}>Cancel</button>
      </div>
    );
  }

  function previewEditableRow(
    fieldName: PreviewEditField,
    label: string,
    value: string,
    display: ReactNode,
    editor: ReactNode,
    secondaryValue = "",
    editorClassName = styles.inlineEditForm,
  ) {
    return (
      <tr key={fieldName}>
        <td>{label}</td>
        <td>
          <div className={styles.editableCell}>
            <div className={styles.editableCellContent}>
              {previewEditingField === fieldName ? <div className={editorClassName}>{editor}{previewEditActions()}</div> : display}
            </div>
            {previewPencil(fieldName, label.toLowerCase(), value, secondaryValue)}
          </div>
        </td>
      </tr>
    );
  }

  async function loadMerchantDirectory() {
    const first = await request<{ items: DirectoryMerchant[]; totalPages: number }>("merchant-websites?page=1&limit=100");
    const rest = await Promise.all(
      Array.from({ length: Math.max(0, first.totalPages - 1) }, (_, index) =>
        request<{ items: DirectoryMerchant[] }>(`merchant-websites?page=${index + 2}&limit=100`)
      )
    );
    return [...first.items, ...rest.flatMap((page) => page.items)];
  }

  async function resolveOperationalMerchant(directoryMerchantId: string) {
    const directoryMerchant = directoryMerchants.find((merchant) => merchant.id === directoryMerchantId);
    if (!directoryMerchant) throw new Error("Select a merchant from Merchant Websites before publishing.");
    if (directoryMerchant.status !== "ACTIVE") throw new Error("This merchant website is inactive. Select an active merchant.");

    const domain = merchantDomain(directoryMerchant.domain || directoryMerchant.websiteUrl);
    const synced = await request<{ operational: { id: string } }>(
      `merchant-websites/${directoryMerchant.id}`,
      "PATCH",
      { pushToHome: true }
    );
    const operationalMerchant = { id: synced.operational.id, name: directoryMerchant.name, slug: domain, websiteUrl: directoryMerchant.websiteUrl };
    setMerchants((current) => current.some((merchant) => merchant.id === operationalMerchant.id) ? current : [...current, operationalMerchant]);
    return operationalMerchant.id;
  }

  async function resolveMerchantSelection(selectionId: string) {
    const directoryMerchant = directoryMerchants.find((merchant) => merchant.id === selectionId) || (() => {
      const operational = merchants.find((merchant) => merchant.id === selectionId);
      if (!operational?.websiteUrl) return undefined;
      const domain = merchantDomain(operational.websiteUrl);
      return directoryMerchants.find((merchant) => merchantDomain(merchant.domain) === domain);
    })();
    if (directoryMerchant) return resolveOperationalMerchant(directoryMerchant.id);
    if (merchants.some((merchant) => merchant.id === selectionId)) return selectionId;
    throw new Error("Select a merchant from Merchant Websites before saving.");
  }

  async function importGalleryMedia(imageUrls: string[], primaryImageUrl: string, title: string) {
    const urls = [...new Set(imageUrls.filter((url) => typeof url === "string" && url.startsWith("https://")))]
      .filter((url) => url !== primaryImageUrl)
      .slice(0, 10);
    const mediaIds: string[] = [];
    let failed = 0;

    for (let offset = 0; offset < urls.length; offset += 3) {
      const batch = urls.slice(offset, offset + 3);
      const imported = await Promise.all(batch.map(async (imageUrl) => {
        try {
          const result = await request<{ data: { mediaId?: string } | null }>("product-extraction/inspect", "POST", {
            importImage: true,
            imageUrl,
            title,
          });
          return result.data?.mediaId ?? null;
        } catch {
          return null;
        }
      }));
      for (const mediaId of imported) {
        if (mediaId) mediaIds.push(mediaId);
        else failed += 1;
      }
    }
    if (failed || imageUrls.length > 10) {
      setMessage(`${mediaIds.length} additional product photos imported${failed ? `; ${failed} could not be imported` : ""}${imageUrls.length > 10 ? "; capped at 10 additional photos" : ""}.`);
    }
    return mediaIds;
  }

  // YouTube Review Videos State
  const [previewYoutubeUrls, setPreviewYoutubeUrls] = useState<string[]>(["", "", ""]);
  const [youtubeSearchEnabled, setYoutubeSearchEnabled] = useState(false);
  const [showYouTubeSearchModal, setShowYouTubeSearchModal] = useState<boolean>(false);
  const [ytCandidateVideos, setYtCandidateVideos] = useState<YouTubeVideoCandidate[]>([]);
  const [selectedYtVideoIds, setSelectedYtVideoIds] = useState<string[]>([]);
  const [searchingYouTube, setSearchingYouTube] = useState<boolean>(false);
  const [activeSearchContext, setActiveSearchContext] = useState<"preview" | "form">("preview");

  // HTML Review & Extraction State
  const [showHtmlReviewModal, setShowHtmlReviewModal] = useState<boolean>(false);
  const [htmlReviewLoading, setHtmlReviewLoading] = useState<boolean>(false);
  const [htmlImageImporting, setHtmlImageImporting] = useState<boolean>(false);
  const [htmlImageUploading, setHtmlImageUploading] = useState<boolean>(false);
  const [htmlReviewSource, setHtmlReviewSource] = useState<string>("");
  const [htmlReviewTab, setHtmlReviewTab] = useState<"review" | "html">("review");
  const [htmlExtractedFields, setHtmlExtractedFields] = useState<{
    title: string;
    brand: string;
    description: string;
    sellingPrice: string;
    mrp: string;
    imageUrl: string;
    images: string[];
    mediaId: string;
    categoryId: string;
    merchantId: string;
  }>({
    title: "",
    brand: "",
    description: "",
    sellingPrice: "",
    mrp: "",
    imageUrl: "",
    images: [],
    mediaId: "",
    categoryId: "",
    merchantId: "",
  });

  async function handleOpenYouTubeSearch(brand: string, title: string, context: "preview" | "form") {
    const cleanTitle = (title || "").trim();
    if (!cleanTitle) {
      alert("Please ensure product title is available before searching YouTube.");
      return;
    }
    setActiveSearchContext(context);
    setSearchingYouTube(true);
    try {
      const res = await request<{ data: YouTubeVideoCandidate[]; status?: string; message?: string }>(
        "youtube/search",
        "POST",
        { brand: brand || "", title: cleanTitle }
      );
      const candidates = res.data || [];
      setYtCandidateVideos(candidates);

      const currentUrls = context === "preview" ? previewYoutubeUrls : (form.youtubeVideoUrls || []);
      const matchedIds: string[] = [];
      for (const u of currentUrls) {
        if (!u) continue;
        const m = u.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|shorts\/|watch\?.+&v=))([\w-]{11})/i) || u.match(/^([\w-]{11})$/);
        if (m?.[1] && !matchedIds.includes(m[1])) {
          matchedIds.push(m[1]);
        }
      }
      setSelectedYtVideoIds(matchedIds.slice(0, 3));
      setShowYouTubeSearchModal(true);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to search YouTube.");
    } finally {
      setSearchingYouTube(false);
    }
  }

  function handleToggleSelectVideo(videoId: string) {
    setSelectedYtVideoIds((prev) => {
      if (prev.includes(videoId)) {
        return prev.filter((id) => id !== videoId);
      }
      if (prev.length >= 3) {
        alert("You have already selected 3 videos. Please unselect one before choosing another.");
        return prev;
      }
      return [...prev, videoId];
    });
  }

  function handleApplySelectedYouTubeVideos() {
    const newUrls = [
      selectedYtVideoIds[0] ? `https://www.youtube.com/watch?v=${selectedYtVideoIds[0]}` : "",
      selectedYtVideoIds[1] ? `https://www.youtube.com/watch?v=${selectedYtVideoIds[1]}` : "",
      selectedYtVideoIds[2] ? `https://www.youtube.com/watch?v=${selectedYtVideoIds[2]}` : "",
    ];
    if (activeSearchContext === "preview") {
      setPreviewYoutubeUrls(newUrls);
    } else {
      setForm((prev) => ({ ...prev, youtubeVideoUrls: newUrls }));
    }
    setShowYouTubeSearchModal(false);
  }

  async function handleOpenHtmlReview(customHtml?: string, initialTab?: "review" | "html") {
    if (!form.productUrl || !form.productUrl.trim()) {
      alert("Please enter a product URL first.");
      return;
    }
    if (initialTab) setHtmlReviewTab(initialTab);
    setShowHtmlReviewModal(true);
    setHtmlReviewLoading(true);
    try {
      const res = await request<{
        data: {
          html: string;
          url: string;
          extracted: {
            title: string;
            brand: string;
            description: string;
            sellingPrice: string;
            mrp: string;
            imageUrl: string;
            images: string[];
            categoryId: string;
            mediaId?: string;
          };
          status: string;
        };
      }>("product-extraction/inspect", "POST", {
        url: form.productUrl.trim(),
        html: customHtml || (htmlReviewSource ? htmlReviewSource : undefined),
      });

      const extracted = res.data.extracted;
      if (res.data.html && !customHtml) {
        setHtmlReviewSource(res.data.html);
      }

      let currentDirectory = directoryMerchants;
      try {
        currentDirectory = await loadMerchantDirectory();
        setDirectoryMerchants(currentDirectory);
      } catch {
        // Continue using the already loaded directory if refresh is unavailable.
      }
      const matchedDirectoryMerchant = findDirectoryMerchant([form.productUrl, res.data.url], [], currentDirectory);

      setHtmlExtractedFields((prev) => ({
        ...prev,
        title: extracted.title || prev.title || form.title || "",
        brand: extracted.brand || prev.brand || form.brand || "",
        description: extracted.description || prev.description || form.description || "",
        sellingPrice: extracted.sellingPrice || prev.sellingPrice || form.priceRupees || "",
        mrp: extracted.mrp || prev.mrp || form.mrpRupees || "",
        imageUrl: extracted.imageUrl || prev.imageUrl || "",
        images: extracted.images || prev.images || [],
        mediaId: extracted.mediaId || prev.mediaId || form.mediaId || "",
        // Never carry a previous deal's category into a new HTML review.
        categoryId: extracted.categoryId || "",
        merchantId: matchedDirectoryMerchant?.id || "",
      }));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to inspect HTML.");
    } finally {
      setHtmlReviewLoading(false);
    }
  }

  async function handleImportImageForHtmlReview(imgUrl: string) {
    if (!imgUrl) return;
    setHtmlImageImporting(true);
    setMessage("");
    try {
      const res = await request<{ data: { mediaId: string; url: string } | null }>(
        "product-extraction/inspect",
        "POST",
        {
          importImage: true,
          imageUrl: imgUrl,
          title: htmlExtractedFields.title || "Product",
        }
      );
      const importedMediaId = res.data?.mediaId;
      if (importedMediaId) {
        setHtmlExtractedFields((prev) => ({
          ...prev,
          imageUrl: imgUrl,
          mediaId: importedMediaId,
        }));
        setMessage("Product image imported successfully!");
      } else {
        setMessage("The retailer blocked the server from importing this image. Upload the image file to continue publishing.");
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Image import failed. Upload the image file to continue publishing.");
    } finally {
      setHtmlImageImporting(false);
    }
  }

  async function handleUploadHtmlProductImage(file: File) {
    setMessage("");
    if (!file.type.startsWith("image/")) {
      setMessage("Choose a valid image file.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setMessage("Product images must be 5 MB or smaller.");
      return;
    }

    setHtmlImageUploading(true);
    try {
      const response = await fetch(`/api/v1/admin/media?alt=${encodeURIComponent(htmlExtractedFields.title || "Product image")}`, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.data?.id) {
        throw new Error(result.error?.message || "Product image upload failed.");
      }
      setHtmlExtractedFields((prev) => ({
        ...prev,
        imageUrl: result.data.url,
        mediaId: result.data.id,
      }));
      setMessage("Product image uploaded successfully.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Product image upload failed.");
    } finally {
      setHtmlImageUploading(false);
    }
  }

  async function handleApplyHtmlExtractedToForm() {
    let operationalMerchantId = "";
    try {
      operationalMerchantId = await resolveOperationalMerchant(htmlExtractedFields.merchantId);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Could not resolve the selected merchant.");
      return;
    }
    setForm((prev) => ({
      ...prev,
      title: htmlExtractedFields.title || prev.title,
      brand: htmlExtractedFields.brand || prev.brand,
      description: htmlExtractedFields.description || prev.description,
      priceRupees: htmlExtractedFields.sellingPrice || prev.priceRupees,
      mrpRupees: htmlExtractedFields.mrp || prev.mrpRupees,
      categoryId: htmlExtractedFields.categoryId || prev.categoryId,
      merchantId: operationalMerchantId || prev.merchantId,
      mediaId: htmlExtractedFields.mediaId || prev.mediaId,
      galleryImageUrls: htmlExtractedFields.images.filter((url) => url !== htmlExtractedFields.imageUrl).slice(0, 10),
      galleryMediaIds: [],
      productUrl: form.productUrl,
    }));

    setShowHtmlReviewModal(false);
    if (htmlExtractedFields.categoryId) {
      const catObj = categories.find((c) => c.id === htmlExtractedFields.categoryId);
      if (catObj?.parentId) {
        setSelectedParentCategoryId(catObj.parentId);
      } else if (catObj && !catObj.parentId) {
        setSelectedParentCategoryId(catObj.id);
      }
    }
    setMessage("Deal form populated from HTML review. You can now save or publish!");

    setTimeout(() => {
      const target = document.getElementById("product-title-input") || document.getElementById("new-deal-form");
      if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }

  async function handlePublishHtmlDirect() {
    if (!htmlExtractedFields.title.trim()) {
      alert("Product title is required to publish.");
      return;
    }
    if (!htmlExtractedFields.categoryId) {
      alert("Please select a Category before publishing.");
      return;
    }
    if (!htmlExtractedFields.merchantId) {
      alert("Please select a Merchant before publishing.");
      return;
    }

    let mrpMinor: number;
    let priceMinor: number;
    try {
      mrpMinor = rupeesToPaise(htmlExtractedFields.mrp || "100");
      priceMinor = rupeesToPaise(htmlExtractedFields.sellingPrice || "90");
    } catch {
      alert("Please enter valid Selling Price and MRP.");
      return;
    }

    if (priceMinor > mrpMinor) {
      alert("Selling price cannot exceed MRP.");
      return;
    }

    setHtmlReviewLoading(true);
    try {
      let finalMediaId = htmlExtractedFields.mediaId;
      if (!finalMediaId && htmlExtractedFields.imageUrl) {
        const res = await request<{ data: { mediaId: string; url: string } }>(
          "product-extraction/inspect",
          "POST",
          {
            importImage: true,
            imageUrl: htmlExtractedFields.imageUrl,
            title: htmlExtractedFields.title,
          }
        );
        if (res.data?.mediaId) finalMediaId = res.data.mediaId;
      }

      if (!finalMediaId) {
        setMessage("A product image is required. Upload an image file or enter a valid image URL and import it before publishing.");
        setHtmlReviewLoading(false);
        return;
      }

      const slug = htmlExtractedFields.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");

      const operationalMerchantId = await resolveOperationalMerchant(htmlExtractedFields.merchantId);
      const payload: DealInput = {
        slug,
        title: htmlExtractedFields.title.trim(),
        brand: htmlExtractedFields.brand.trim() || "Brand",
        description: htmlExtractedFields.description.trim() || htmlExtractedFields.title.trim(),
        categoryId: htmlExtractedFields.categoryId,
        merchantId: operationalMerchantId,
        mediaId: finalMediaId,
        galleryMediaIds: await importGalleryMedia(htmlExtractedFields.images, htmlExtractedFields.imageUrl, htmlExtractedFields.title),
        mrpMinor,
        priceMinor,
        currency: "INR",
        rating: null,
        reviewCount: null,
        ratingSource: null,
        productUrl: form.productUrl.trim(),
        affiliateUrl: null,
        status: "DRAFT",
        publishedAt: null,
        startsAt: null,
        expiresAt: null,
        featured: false,
        trending: false,
        options: [],
      };

      const createRes = await request<{ data: Row }>("deals", "POST", { deal: payload });
      const createdDeal = createRes.data;

      const previewRes = await request<{ data: Row; previewToken: string }>(
        `deals/${createdDeal.id}/preview`,
        "POST",
        {}
      );

      const publishRes = await request<{ data: Row }>(
        `deals/${createdDeal.id}/publish`,
        "POST",
        { version: previewRes.data.version, previewToken: previewRes.previewToken }
      );

      const validUrls = previewYoutubeUrls.filter((u) => u && u.trim().length > 0);
      if (validUrls.length > 0) {
        try {
          await fetch(`/api/v1/admin/deals/${createdDeal.id}/reviews`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ operation: "save_custom", videoUrls: validUrls }),
          });
        } catch (ytErr) {
          console.error("Failed to save custom YouTube video reviews:", ytErr);
        }
      }
      setPreviewYoutubeUrls(["", "", ""]);

      await load();
      setShowHtmlReviewModal(false);
      setMessage(`🎉 "${publishRes.data.title}" has been successfully published to the live store!`);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Publish failed.");
    } finally {
      setHtmlReviewLoading(false);
    }
  }

  function detectRetailer(urlStr: string): string | null {
    if (!urlStr) return null;
    try {
      const lower = urlStr.toLowerCase();
      if (lower.includes("amazon.in") || lower.includes("amzn.to") || lower.includes("amzn.in")) return "Amazon";
      if (lower.includes("flipkart.com") || lower.includes("dl.flipkart.com") || lower.includes("fkrt.it")) return "Flipkart";
      if (lower.includes("myntra.com")) return "Myntra";
      if (lower.includes("croma.com")) return "Croma";
      if (lower.includes("reliancedigital.in")) return "Reliance Digital";
      if (lower.includes("tatacliq.com")) return "Tata CLiQ";
      if (lower.includes("ajio.com")) return "AJIO";
      if (lower.includes("nykaa.com")) return "Nykaa";
      if (lower.includes("jiomart.com")) return "JioMart";
      if (lower.includes("bigbasket.com")) return "BigBasket";
      if (lower.includes("vijaysales.com")) return "Vijay Sales";
      if (lower.startsWith("http://") || lower.startsWith("https://")) return "Partner Retailer";
      return null;
    } catch {
      return null;
    }
  }

  function resetDealEntry() {
    lastAutoUrl.current = "";
    extractionController.current?.abort();
    extractionController.current = null;
    setForm(empty);
    setSelectedParentCategoryId("");
    setMessage("");
    setExtracting(false);
    setExtractProgress("");
    setDetectedRetailer(null);
    setExtractionResult(null);
    setShowPreviewModal(false);
    setPreviewCategory("");
    setPreviewMerchant("");
    setPreviewTitle("");
    setPreviewBrand("");
    setPreviewDescription("");
    setPreviewMrp("");
    setPreviewPrice("");
    setPreviewCoupon("");
    setPreviewImageUrl("");
    setPreviewGalleryImageUrls([]);
    setPreviewMediaId("");
    setPreviewRating("");
    setPreviewReviewCount("");
    setPreviewEditingField(null);
    setPreviewEditValue("");
    setPreviewEditSecondaryValue("");
    setPreviewYoutubeUrls(["", "", ""]);
    setYoutubeSearchEnabled(false);
    setShowHtmlReviewModal(false);
    setHtmlReviewSource("");
    setHtmlReviewTab("review");
  }

  function resetCurrentEdit() {
    if (!selected) {
      resetDealEntry();
      return;
    }

    extractionController.current?.abort();
    extractionController.current = null;
    edit(selected);
    setExtracting(false);
    setExtractProgress("");
    setExtractionResult(null);
    setPreviewTitle("");
    setPreviewBrand("");
    setPreviewDescription("");
    setPreviewMrp("");
    setPreviewPrice("");
    setPreviewImageUrl("");
    setPreviewGalleryImageUrls([]);
    setPreviewMediaId("");
    setPreviewCategory("");
    setPreviewMerchant("");
    setYoutubeSearchEnabled(false);
    setShowPreviewModal(false);
    setShowHtmlReviewModal(false);
    setHtmlReviewSource("");
    setHtmlReviewTab("review");
    setMessage("Unsaved changes reset to the saved deal values.");
  }

  // Details fill in by themselves a moment after a new link is pasted (once per link); "Try again" runs it by hand.
  const lastAutoUrl = useRef("");
  const dealCheck = useDealCheck(form.productUrl, form.title, true, { endpoint: "/api/v1/admin/deal-check", excludeDealId: selected?.id });
  // The formatted description editor follows the form: it reloads whenever the plain description changes from outside it (reset, edit, fetched details).
  const [descEditor, setDescEditor] = useState({ plain: "", html: "", version: 0 });
  if (form.description !== descEditor.plain) setDescEditor({ plain: form.description, html: form.descriptionHtml || textToHtml(form.description), version: descEditor.version + 1 });

  async function handleScrape() {
    if (!form.productUrl || !form.productUrl.trim()) {
      setMessage("Please enter a valid product URL before clicking Scrape.");
      return;
    }

    try {
      new URL(form.productUrl.trim());
    } catch {
      setMessage("Please enter a valid URL (e.g. https://www.amazon.in/dp/...)");
      return;
    }

    setYoutubeSearchEnabled(false);
    setExtractionResult(null);
    setShowPreviewModal(false);
    setPreviewMediaId("");
    setPreviewImageUrl("");
    setPreviewGalleryImageUrls([]);

    setExtracting(true);
    const controller = new AbortController();
    extractionController.current = controller;
    setMessage("");
    setExtractProgress("Detecting retailer...");

    try {
      await new Promise((r) => setTimeout(r, 150));
      if (controller.signal.aborted) return;
      setExtractProgress("Checking supported extraction method...");
      await new Promise((r) => setTimeout(r, 200));
      if (controller.signal.aborted) return;
      setExtractProgress("Extracting product information...");

      const response = await request<{ data: ClientExtractionResult }>("product-extraction", "POST", {
        url: form.productUrl.trim(),
        importImage: true,
      }, controller.signal);
      if (controller.signal.aborted) return;

      setExtractProgress("Product information retrieved.");
      setExtractionResult(response.data);
      setPreviewEditingField(null);
      setPreviewYoutubeUrls(["", "", ""]);
      setPreviewCategory(
        response.data.suggestedFormValues?.categoryId ||
        response.data.matchedTaxonomy?.categoryId ||
        form.categoryId ||
        ""
      );
      const matchedDirectoryMerchant = findDirectoryMerchant(
        [response.data.canonicalUrl, response.data.data.merchant.canonicalUrl, form.productUrl],
        [response.data.retailer, response.data.data.merchant.retailerName, response.data.data.merchant.retailerSlug],
      );
      setPreviewMerchant(response.data.matchedTaxonomy?.merchantDirectoryId || matchedDirectoryMerchant?.id || "");
      setPreviewTitle(response.data.suggestedFormValues?.title || response.data.data.identity.title.value || "");
      setPreviewBrand(response.data.suggestedFormValues?.brand || response.data.data.identity.brand.value || "");
      setPreviewDescription(response.data.suggestedFormValues?.description || response.data.data.content.description.value || "");
      setPreviewMrp(response.data.suggestedFormValues?.mrpRupees || "");
      setPreviewPrice(response.data.suggestedFormValues?.priceRupees || "");
      setPreviewCoupon("");
      setPreviewImageUrl(response.data.data.media.primaryImageUrl.value || "");
      setPreviewGalleryImageUrls([
        response.data.data.media.primaryImageUrl.value,
        ...(response.data.data.media.additionalImageUrls?.value ?? []),
      ].filter((url): url is string => Boolean(url)).slice(0, 11));
      setPreviewMediaId(response.data.suggestedFormValues?.mediaId || "");
      setPreviewRating(response.data.data.ratings.rating.value !== null ? String(response.data.data.ratings.rating.value) : "");
      setPreviewReviewCount(response.data.data.ratings.reviewCount.value !== null ? String(response.data.data.ratings.reviewCount.value) : "");
      setShowPreviewModal(true);
      setMessage(
        response.data.status === "FULL_SUCCESS"
          ? "Product information retrieved successfully."
          : "Partial information retrieved. Please review the summary below."
      );
    } catch (err) {
      if (controller.signal.aborted) return;
      setExtractProgress("Extraction unavailable — manual entry required.");
      setMessage(err instanceof Error ? err.message : "Extraction failed. Manual entry required.");
    } finally {
      if (extractionController.current === controller) {
        extractionController.current = null;
        setExtracting(false);
      }
    }
  }

  useEffect(() => {
    if (selected) return;
    const link = form.productUrl.trim();
    if (!/^https:\/\/[^\s/]+\.[^\s/]+\//i.test(link) || link === lastAutoUrl.current || extracting) return;
    const timer = setTimeout(() => { lastAutoUrl.current = link; void handleScrape(); }, 700);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handleScrape reads the latest form; only a new link should restart the timer
  }, [form.productUrl, selected]);

  async function applyExtractedData() {
    if (!extractionResult) return;
    const s = extractionResult.suggestedFormValues;
    let operationalMerchantId = form.merchantId;
    if (previewMerchant) {
      try {
        operationalMerchantId = await resolveOperationalMerchant(previewMerchant);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Could not resolve the selected merchant.");
        return;
      }
    }

    setForm((prev) => {
      const resolvedTitle = previewTitle || s?.title || extractionResult.data.identity.title.value || prev.title;
      const resolvedBrand = previewBrand || s?.brand || extractionResult.data.identity.brand.value || prev.brand;
      const resolvedDesc = previewDescription || s?.description || extractionResult.data.content.description.value || prev.description;
      const resolvedMrp = previewMrp || s?.mrpRupees || prev.mrpRupees;
      const resolvedPrice = previewPrice || s?.priceRupees || prev.priceRupees;
      const resolvedMediaId = previewMediaId || s?.mediaId || "";

      return {
        ...prev,
        title: resolvedTitle,
        slug: resolvedTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || prev.slug,
        brand: resolvedBrand,
        description: resolvedDesc,
        productUrl: s?.productUrl || extractionResult.canonicalUrl || prev.productUrl,
        categoryId: previewCategory || s?.categoryId || prev.categoryId,
        merchantId: operationalMerchantId || s?.merchantId || prev.merchantId,
        galleryImageUrls: previewGalleryImageUrls.filter((url) => url !== previewImageUrl).slice(0, 10),
        galleryMediaIds: [],
        mrpRupees: resolvedMrp,
        priceRupees: resolvedPrice,
        couponCode: previewCoupon || prev.couponCode || null,
        mediaId: resolvedMediaId,
        youtubeVideoUrls: [...previewYoutubeUrls],
        rating: previewRating ? Number(previewRating) : (s?.rating !== undefined ? s.rating : prev.rating),
        reviewCount: previewReviewCount ? Number(previewReviewCount) : (s?.reviewCount !== undefined ? s.reviewCount : prev.reviewCount),
        ratingSource: s?.ratingSource !== undefined ? s.ratingSource : prev.ratingSource,
      };
    });

    const chosenCatId = previewCategory || s?.categoryId || form.categoryId;
    if (chosenCatId) {
      const catObj = categories.find((c) => c.id === chosenCatId);
      if (catObj?.parentId) {
        setSelectedParentCategoryId(catObj.parentId);
      } else if (catObj && !catObj.parentId) {
        setSelectedParentCategoryId(catObj.id);
      }
    }

    setShowPreviewModal(false);
    setMessage("Form populated with extracted details. You can now edit any fields and save or publish below.");

    setTimeout(() => {
      const target = document.getElementById("product-title-input") || document.getElementById("new-deal-form");
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 50);
  }

  async function handleDirectPublish() {
    if (!extractionResult) return;
    const s = extractionResult.suggestedFormValues;

    const title = (previewTitle || s?.title || extractionResult.data.identity.title.value || form.title || "").trim();
    if (!title) {
      setMessage("Product title is required to publish.");
      return;
    }

    const categoryId = previewCategory || s?.categoryId || form.categoryId;
    if (!categoryId) {
      setMessage("Please select a Category from the dropdown in the preview table before publishing.");
      return;
    }

    const directoryMerchantId = previewMerchant || findDirectoryMerchant(
      [extractionResult.canonicalUrl, extractionResult.data.merchant.canonicalUrl, form.productUrl],
      [extractionResult.retailer, extractionResult.data.merchant.retailerName, extractionResult.data.merchant.retailerSlug],
    )?.id;
    if (!directoryMerchantId) {
      setMessage("Select the matching merchant from Merchant Websites before publishing.");
      return;
    }
    let merchantId: string;
    try {
      merchantId = await resolveOperationalMerchant(directoryMerchantId);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not resolve the selected merchant.");
      return;
    }

    // The inline price editor keeps draft values until Save is clicked. If the
    // user clicks Publish while that row is open, validate and publish those
    // visible values instead of falling back to stale/empty React state.
    const hasPendingPriceEdit = previewEditingField === "price";
    const mrpStr = hasPendingPriceEdit
      ? previewEditValue.trim()
      : previewMrp || s?.mrpRupees || form.mrpRupees;
    const priceStr = hasPendingPriceEdit
      ? previewEditSecondaryValue.trim()
      : previewPrice || s?.priceRupees || form.priceRupees;

    let mrpMinor: number;
    let priceMinor: number;
    try {
      mrpMinor = rupeesToPaise(mrpStr);
    } catch {
      setMessage("Valid MRP is required to publish. Please click the edit icon (✎) to specify MRP.");
      return;
    }

    try {
      priceMinor = rupeesToPaise(priceStr);
    } catch {
      setMessage("Valid Deal Price is required to publish. Please click the edit icon (✎) to specify Deal Price.");
      return;
    }

    if (priceMinor > mrpMinor) {
      setMessage("Deal price cannot exceed MRP.");
      return;
    }

    let mediaId = previewMediaId || s?.mediaId || "";

    // Retailer galleries often include one blocked or malformed thumbnail.
    // Try this deal's selected image first, then only this extraction's own
    // image candidates; never borrow media from another deal.
    const imageCandidates = [...new Set([
      previewImageUrl,
      extractionResult.data.media.primaryImageUrl.value || "",
      ...previewGalleryImageUrls,
      ...(extractionResult.data.media.additionalImageUrls?.value || []),
    ].map((url) => url.trim()).filter(Boolean))].slice(0, 5);
    if (!mediaId) {
      for (const imageUrl of imageCandidates) {
        try {
          const importRes = await request<{ data: { mediaId: string } | null }>("product-extraction/inspect", "POST", {
            importImage: true,
            imageUrl,
            title,
          });
          if (importRes.data?.mediaId) {
            mediaId = importRes.data.mediaId;
            setPreviewMediaId(mediaId);
            break;
          }
        } catch (imgErr) {
          console.warn("Failed to import one of this deal's product image candidates:", imgErr);
        }
      }
    }

    if (!mediaId) {
      setMessage("This deal’s image could not be imported. Import or upload its own product image before publishing.");
      return;
    }

    const slug = toSlug(s?.slug || form.slug || title);
    const description = (previewDescription || s?.description || form.description || title).trim();
    const productUrl = s?.productUrl || form.productUrl || extractionResult.canonicalUrl;
    const brand = (previewBrand || s?.brand || extractionResult.data.identity.brand.value || form.brand || "").trim();

    const resolvedRating = previewRating ? Number(previewRating) : (s?.rating ?? form.rating ?? null);
    const resolvedReviewCount = previewReviewCount ? Number(previewReviewCount) : (s?.reviewCount ?? form.reviewCount ?? null);
    const resolvedRatingSource = (resolvedRating !== null || resolvedReviewCount !== null)
      ? (s?.ratingSource || form.ratingSource || `${extractionResult.retailer || "Retailer"} Customer Reviews`)
      : null;
    const galleryMediaIds = await importGalleryMedia(
      previewGalleryImageUrls,
      previewImageUrl || extractionResult.data.media.primaryImageUrl.value || "",
      title,
    );

    const payload: DealInput = {
      slug,
      title,
      brand,
      description,
      categoryId,
      merchantId,
      mediaId,
      galleryMediaIds,
      mrpMinor,
      priceMinor,
      currency: "INR",
      rating: resolvedRating,
      reviewCount: resolvedReviewCount,
      ratingSource: resolvedRatingSource,
      productUrl,
      affiliateUrl: form.affiliateUrl || null,
      couponCode: previewCoupon || form.couponCode || null,
      status: "DRAFT",
      publishedAt: null,
      startsAt: null,
      expiresAt: null,
      featured: form.featured || false,
      trending: form.trending || false,
      options: [],
    };

    setPublishingDirect(true);
    setMessage("");

    try {
      const createRes = await request<{ data: Row }>("deals", "POST", { deal: payload });
      const createdDeal = createRes.data;

      const previewRes = await request<{ data: Row; previewToken: string }>(
        `deals/${createdDeal.id}/preview`,
        "POST",
        {}
      );

      const publishRes = await request<{ data: Row }>(
        `deals/${createdDeal.id}/publish`,
        "POST",
        { version: previewRes.data.version, previewToken: previewRes.previewToken }
      );

      const validUrls = previewYoutubeUrls.filter((u) => u && u.trim().length > 0);
      if (validUrls.length > 0) {
        try {
          await fetch(`/api/v1/admin/deals/${createdDeal.id}/reviews`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ operation: "save_custom", videoUrls: validUrls }),
          });
        } catch (ytErr) {
          console.error("Failed to save custom YouTube video reviews:", ytErr);
        }
      }
      setPreviewYoutubeUrls(["", "", ""]);

      await load();

      setShowPreviewModal(false);
      setExtractionResult(null);
      setExtractProgress("");
      setForm(empty);
      setSelected(publishRes.data);
      setMessage(`🎉 "${publishRes.data.title}" has been successfully published to the live store!`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to publish deal directly.");
    } finally {
      setPublishingDirect(false);
    }
  }

  async function load(currentPage = page, tab = dealTab) {
    const [deals, cats, stores, directory] = await Promise.all([
      request<{ data: Row[]; counts?: { active: number; expired: number; deleted: number } }>(`deals?page=${currentPage}&tab=${tab}`),
      request<{ data: Entry[] }>("categories"),
      request<{ data: Entry[] }>("merchants"),
      loadMerchantDirectory(),
    ]);
    setRows(deals.data);
    if (deals.counts) setTabCounts(deals.counts);
    setCategories(cats.data);
    setMerchants(stores.data);
    setDirectoryMerchants(directory);
  }

  function switchTab(tab: DealTab) {
    if (tab === dealTab) return;
    setDealTab(tab);
    setPage(1);
    void run(async () => { await load(1, tab); });
  }

  /** Delete = move to the Deleted tab. The deal is kept (archived) and can be restored. */
  function archiveRow(row: Row) {
    if (!window.confirm(`Move "${row.title}" to the Deleted tab? It disappears from the site and can be restored later.`)) return;
    void run(async () => {
      await request<{ data: Row }>(`deals/${row.id}/archive`, "POST", { version: row.version });
      if (selected?.id === row.id) closeEditModal();
      await load();
      setMessage(`"${row.title}" moved to the Deleted tab.`);
    });
  }

  function restoreRow(row: Row) {
    void run(async () => {
      await request<{ data: Row }>(`deals/${row.id}/restore`, "POST", { version: row.version });
      await load();
      setMessage(`"${row.title}" restored as a draft. Publish it again when it is ready.`);
    });
  }

  useEffect(() => {
    let live = true;
    Promise.all([
      request<{ data: Row[]; counts?: { active: number; expired: number; deleted: number } }>("deals?page=1&tab=active"),
      request<{ data: Entry[] }>("categories"),
      request<{ data: Entry[] }>("merchants"),
      loadMerchantDirectory(),
    ])
      .then(([d, c, m, directory]) => {
        if (live) {
          setRows(d.data);
          if (d.counts) setTabCounts(d.counts);
          setCategories(c.data);
          setMerchants(m.data);
          setDirectoryMerchants(directory);
        }
      })
      .catch((e) => {
        if (live) setMessage(e.message);
      });
    return () => {
      live = false;
    };
  }, []);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setMessage("");
    try {
      await action();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Request failed.");
    } finally {
      setBusy(false);
    }
  }

  function field<K extends keyof AdminDealForm>(key: K, value: AdminDealForm[K]) {
    setForm((old) => ({ ...old, [key]: value }));
    setPreview(null);
  }

  function uploadFormImage(file: File) {
    void run(async () => {
      const response = await fetch(
        `/api/v1/admin/media?alt=${encodeURIComponent(form.title || "Product image")}`,
        { method: "POST", headers: { "Content-Type": file.type }, body: file }
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message ?? "Upload failed");
      field("mediaId", result.data.id);
    });
  }

  // Ctrl+V of an image (e.g. a screenshot) uploads it; text pastes are left alone.
  const pasteImageRef = useRef<(file: File) => void>(() => {});
  useEffect(() => {
    pasteImageRef.current = (file) => (showHtmlReviewModal ? void handleUploadHtmlProductImage(file) : uploadFormImage(file));
  });
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const file = Array.from(event.clipboardData?.files ?? []).find((f) => f.type.startsWith("image/"));
      if (!file) return;
      event.preventDefault();
      pasteImageRef.current(file);
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, []);

  function removeDeal(row: Row) {
    const published = row.everPublished || row.status !== "DRAFT";
    const warning = published ? " This deal was published: its comments and price history are deleted too. This cannot be undone. Use Archive to only hide it." : " This cannot be undone.";
    if (!window.confirm(`Permanently delete "${row.title}"?${warning}`)) return;
    void run(async () => {
      await request(`deals/${row.id}`, "DELETE", { version: row.version });
      if (selected?.id === row.id) { setSelected(null); setForm(empty); setPreview(null); }
      await load();
    });
  }

  /** Same two steps as the saved-version preview: preview first (gives the publish token), then publish. */
  function publishRow(row: Row) {
    void run(async () => {
      const prev = await request<{ data: Row; previewToken: string }>(`deals/${row.id}/preview`, "POST", {});
      await request<{ data: Row }>(`deals/${row.id}/publish`, "POST", { version: prev.data.version, previewToken: prev.previewToken });
      await load();
      setMessage(`"${row.title}" is published (or scheduled by its dates).`);
    });
  }

  function updateExpired(row: Row, expired: boolean) {
    void run(async () => {
      const result = await request<{ data: Row }>(`deals/${row.id}/status`, "POST", { version: row.version, expired });
      setRows((current) => current.map((item) => item.id === row.id ? result.data : item));
      if (selected?.id === row.id) setSelected(result.data);
    });
  }

  /** Clears the form and any selected deal, ready for a new one. */
  function resetToNewDeal() {
    setSelected(null);
    setForm(empty);
    setSelectedParentCategoryId("");
    setPreview(null);
    setDetectedRetailer(null);
    setShowPreviewModal(false);
    setExtractionResult(null);
    setExtractProgress("");
  }

  function closeEditModal() {
    setModalDealId(null);
    setSelected(null);
    setForm(empty);
    setSelectedParentCategoryId("");
    setPreview(null);
    setDetectedRetailer(null);
    setShowPreviewModal(false);
    setExtractionResult(null);
    setExtractProgress("");
  }

  function edit(row: Row) {
    const data: AdminDealForm = {
      slug: row.slug,
      title: row.title,
      brand: row.brand,
      description: row.description,
      categoryId: row.categoryId,
      merchantId: (() => {
        const operational = merchants.find((merchant) => merchant.id === row.merchantId);
        if (!operational?.websiteUrl) return row.merchantId;
        const domain = merchantDomain(operational.websiteUrl);
        return directoryMerchants.find((merchant) => merchantDomain(merchant.domain) === domain)?.id || row.merchantId;
      })(),
      mediaId: row.mediaId,
      galleryMediaIds: row.galleryImages?.map((image) => image.mediaId) ?? [],
      mrpRupees: paiseToRupeeInputString(row.mrpMinor),
      priceRupees: paiseToRupeeInputString(row.priceMinor),
      currency: "INR",
      rating: row.rating,
      reviewCount: row.reviewCount,
      ratingSource: row.ratingSource,
      productUrl: row.productUrl,
      affiliateUrl: row.affiliateUrl,
      couponCode: row.couponCode ?? null,
      editorNotes: row.editorNotes ?? null,
      status: row.status === "EXPIRED" ? "EXPIRED" : "DRAFT",
      publishedAt: row.publishedAt,
      startsAt: row.startsAt,
      expiresAt: row.expiresAt,
      featured: row.featured,
      trending: row.trending,
      options: row.options.map(({ merchantId, priceMinor, productUrl, affiliateUrl }) => ({
        merchantId,
        priceRupees: paiseToRupeeInputString(priceMinor),
        productUrl,
        affiliateUrl,
      })),
    };
    setForm(data);
    const catObj = categories.find((c) => c.id === row.categoryId);
    if (catObj?.parentId) {
      setSelectedParentCategoryId(catObj.parentId);
    } else if (catObj && !catObj.parentId) {
      setSelectedParentCategoryId(catObj.id);
    } else {
      setSelectedParentCategoryId("");
    }
    setDetectedRetailer(detectRetailer(row.productUrl));
    setShowPreviewModal(false);
    setSelected(row);
    setPreview(null);
    fetch(`/api/v1/admin/deals/${row.id}/reviews`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.data) {
          const activeReviews = data.data.filter((r: YouTubeReviewRow) => r.isActive !== false);
          const urls = [
            activeReviews[0]?.videoUrl || "",
            activeReviews[1]?.videoUrl || "",
            activeReviews[2]?.videoUrl || "",
          ];
          setForm((prev) => ({ ...prev, youtubeVideoUrls: urls }));
        }
      })
      .catch(() => {});
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    const publishNow = publishAfterSave.current;
    publishAfterSave.current = false;
    await run(async () => {
      let mrpMinor: number;
      let priceMinor: number;
      try {
        mrpMinor = rupeesToPaise(form.mrpRupees);
      } catch {
        throw new Error("Invalid MRP. Please enter a valid rupee amount (e.g. ₹999 or 999.50).");
      }
      try {
        priceMinor = rupeesToPaise(form.priceRupees);
      } catch {
        throw new Error("Invalid Deal price. Please enter a valid rupee amount (e.g. ₹799 or 799.50).");
      }

      const options = form.options.map((opt) => {
        try {
          return {
            merchantId: opt.merchantId,
            priceMinor: rupeesToPaise(opt.priceRupees),
            productUrl: opt.productUrl,
            affiliateUrl: opt.affiliateUrl,
          };
        } catch {
          throw new Error("Invalid option price. Please enter a valid rupee amount.");
        }
      });

      const galleryMediaIds = form.galleryImageUrls?.length
        ? await importGalleryMedia(form.galleryImageUrls, "", form.title)
        : form.galleryMediaIds ?? [];

      const payload: DealInput = {
        slug: toSlug(form.slug) || toSlug(form.title),
        title: form.title,
        brand: form.brand,
        description: form.description,
        categoryId: form.categoryId,
        merchantId: await resolveMerchantSelection(form.merchantId),
        mediaId: form.mediaId,
        galleryMediaIds,
        mrpMinor,
        priceMinor,
        currency: "INR",
        rating: form.rating,
        reviewCount: form.reviewCount,
        ratingSource: form.ratingSource,
        productUrl: form.productUrl,
        affiliateUrl: form.affiliateUrl,
        couponCode: form.couponCode?.trim() || null,
        editorNotes: form.editorNotes ?? null,
        descriptionHtml: form.descriptionHtml === undefined ? undefined : form.descriptionHtml || null,
        status: form.status,
        publishedAt: form.publishedAt,
        startsAt: form.startsAt,
        expiresAt: form.expiresAt,
        featured: form.featured,
        trending: form.trending,
        options,
      };

      const result = await request<{ data: Row }>(
        selected ? `deals/${selected.id}` : "deals",
        selected ? "PUT" : "POST",
        { deal: payload, version: selected?.version }
      );

      const validFormUrls = (form.youtubeVideoUrls || []).filter((u) => u && u.trim().length > 0);
      if (validFormUrls.length > 0) {
        try {
          await fetch(`/api/v1/admin/deals/${result.data.id}/reviews`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ operation: "save_custom", videoUrls: validFormUrls }),
          });
        } catch (ytErr) {
          console.error("Failed to save custom YouTube video reviews:", ytErr);
        }
      }

      edit(result.data);
      await load();
      setMessage("Saved. Preview this saved version before publishing.");
      if (publishNow) {
        setPreview(await request(`deals/${result.data.id}/preview`, "POST", {}));
        setMessage("Saved. Review the preview below, then confirm to publish.");
        requestAnimationFrame(() => document.getElementById("saved-preview")?.scrollIntoView({ behavior: "smooth", block: "center" }));
      }
    });
  }

  useEffect(() => {
    if (!editModal) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape" && !busy) closeEditModal(); };
    document.addEventListener("keydown", onKey);
    document.body.classList.add("md-modal-open");
    return () => { document.removeEventListener("keydown", onKey); document.body.classList.remove("md-modal-open"); };
    // closeEditModal only sets state, so it is safe to leave out of the list.
  }, [editModal, busy]);

  const dpMrp = Number(form.mrpRupees), dpPrice = Number(form.priceRupees);
  const dpDiscount = form.mrpRupees !== "" && form.priceRupees !== "" && dpMrp > 0 && dpPrice >= 0 && dpPrice <= dpMrp ? Math.round(((dpMrp - dpPrice) / dpMrp) * 100) : null;
  const dpImage = form.mediaId.trim() ? `/api/v1/media/${encodeURIComponent(form.mediaId.trim())}` : extractionResult?.data.media.primaryImageUrl.value || "";
  const dpMerchant = directoryMerchants.find((m) => m.id === form.merchantId)?.name ?? merchants.find((m) => m.id === form.merchantId)?.name ?? "";

  return (
    <main className={styles.page}>
      <AdminNav active="deals" />
      {message && (
        <p role="status" className={styles.notice}>
          {message}
        </p>
      )}
      {/* YouTube Video Selection Modal (Top 20 candidate reviews) */}
      {showYouTubeSearchModal && (
        <div className={styles.ytSearchModalBackdrop} onClick={() => setShowYouTubeSearchModal(false)}>
          <div className={styles.ytSearchModalBox} onClick={(e) => e.stopPropagation()}>
            <div className={styles.ytSearchModalHeader}>
              <div>
                <h3 className={styles.ytSearchModalTitle}>
                  🎬 Select YouTube Review Videos
                </h3>
                <p className={styles.ytSearchModalSubtitle}>
                  Top 20 candidate videos found. Select up to 3 videos to feature with this deal.
                </p>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span
                  className={`${styles.ytCounterBadge} ${
                    selectedYtVideoIds.length === 3 ? styles.ytCounterBadgeComplete : ""
                  }`}
                >
                  Selected: {selectedYtVideoIds.length} / 3
                </span>
                <button
                  type="button"
                  onClick={() => setShowYouTubeSearchModal(false)}
                  style={{
                    background: "none",
                    border: "none",
                    fontSize: 20,
                    cursor: "pointer",
                    color: "var(--md-color-text-secondary)",
                    padding: "4px 8px",
                  }}
                  title="Close modal"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className={styles.ytSearchModalBody}>
              {ytCandidateVideos.length === 0 ? (
                <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--md-color-text-secondary)" }}>
                  <p style={{ fontSize: 16, fontWeight: 600 }}>No review videos found for this product.</p>
                  <p style={{ fontSize: 13, marginTop: 4 }}>
                    You can still manually paste any YouTube video URL into the 3 URL input fields.
                  </p>
                </div>
              ) : (
                <div className={styles.ytVideoGrid}>
                  {ytCandidateVideos.map((video) => {
                    const isSelected = selectedYtVideoIds.includes(video.videoId);
                    const selIndex = selectedYtVideoIds.indexOf(video.videoId);
                    return (
                      <div
                        key={video.videoId}
                        className={`${styles.ytVideoCard} ${isSelected ? styles.ytVideoCardSelected : ""}`}
                      >
                        <div className={styles.ytThumbWrapper}>
                          <Image
                            src={video.thumbnailUrl}
                            alt={video.title}
                            className={styles.ytThumbImg}
                            width={120}
                            height={72}
                            unoptimized
                            loading="lazy"
                          />
                          {video.duration && (
                            <span className={styles.ytDurationBadge}>{video.duration}</span>
                          )}
                        </div>
                        <div className={styles.ytVideoInfo}>
                          <div>
                            <h5 className={styles.ytVideoTitle} title={video.title}>
                              {video.title}
                            </h5>
                            <div className={styles.ytVideoMeta}>
                              <span>{video.channelTitle}</span>
                              {video.viewCount ? (
                                <span>• {Number(video.viewCount).toLocaleString()} views</span>
                              ) : null}
                              {video.language && (
                                <span className={styles.ytLangBadge}>{video.language}</span>
                              )}
                            </div>
                          </div>
                          <div className={styles.ytCardActions}>
                            <a
                              href={video.videoUrl}
                              target="_blank"
                              rel="noreferrer"
                              style={{ fontSize: 11, color: "var(--md-color-primary)", textDecoration: "none" }}
                            >
                              Watch on YouTube ↗
                            </a>
                            <button
                              type="button"
                              onClick={() => handleToggleSelectVideo(video.videoId)}
                              className={`${styles.ytSelectBtn} ${
                                isSelected ? styles.ytSelectBtnActive : ""
                              }`}
                            >
                              {isSelected ? `✓ Selected (#${selIndex + 1})` : "+ Select"}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className={styles.ytSearchModalFooter}>
              <div style={{ fontSize: 13, color: "var(--md-color-text-secondary)" }}>
                {selectedYtVideoIds.length === 0 ? (
                  <span>No videos selected yet. Click &quot;+ Select&quot; on up to 3 videos.</span>
                ) : (
                  <span>
                    <strong>{selectedYtVideoIds.length}</strong> of 3 videos selected.
                  </span>
                )}
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button
                  type="button"
                  className={styles.ytModalCancelBtn}
                  onClick={() => setShowYouTubeSearchModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className={styles.ytModalApplyBtn}
                  onClick={handleApplySelectedYouTubeVideos}
                >
                  Apply {selectedYtVideoIds.length > 0 ? `(${selectedYtVideoIds.length})` : ""}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* HTML Review & Field Extraction Modal */}
      {showHtmlReviewModal && (
        <div className={styles.htmlModalBackdrop} onClick={() => setShowHtmlReviewModal(false)}>
          <div className={styles.htmlModalBox} onClick={(e) => e.stopPropagation()}>
            <div className={styles.htmlModalHeader}>
              <div>
                <h3 className={styles.htmlModalTitle}>🔍 Page HTML Review & Field Extraction</h3>
                <p className={styles.htmlModalSubtitle}>
                  If automatic fetch is blocked, load or paste the saved product HTML. Page scripts are parsed as data and never executed.
                </p>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div className={styles.htmlTabButtons}>
                  <button
                    type="button"
                    className={htmlReviewTab === "review" ? styles.htmlTabActive : styles.htmlTab}
                    onClick={() => setHtmlReviewTab("review")}
                  >
                    📋 Review Extracted Details
                  </button>
                  <button
                    type="button"
                    className={htmlReviewTab === "html" ? styles.htmlTabActive : styles.htmlTab}
                    onClick={() => setHtmlReviewTab("html")}
                  >
                    📄 HTML Mode
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setShowHtmlReviewModal(false)}
                  className={styles.htmlModalCloseBtn}
                  title="Close modal"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className={styles.htmlModalBody}>
              {message && (
                <div role="status" className={styles.notice} style={{ marginBottom: 12 }}>
                  {message}
                </div>
              )}
              {htmlReviewLoading && (
                <div style={{ padding: 12, background: "var(--md-color-surface-muted)", borderRadius: 8, marginBottom: 12, color: "var(--md-color-text-secondary)", fontSize: 13, fontWeight: 600 }}>
                  ⏳ Fetching page &amp; parsing HTML details...
                </div>
              )}

              {htmlReviewTab === "review" ? (
                <div className={styles.htmlReviewFormGrid}>
                  <div className={styles.htmlFieldGroup}>
                    <label>
                      <strong>Product Title</strong>
                      <input
                        type="text"
                        value={htmlExtractedFields.title}
                        onChange={(e) =>
                          setHtmlExtractedFields((prev) => ({ ...prev, title: e.target.value }))
                        }
                        placeholder="Product title extracted from HTML"
                      />
                    </label>
                  </div>

                  <div className={styles.htmlFieldGroup}>
                    <label>
                      <strong>Brand</strong>
                      <input
                        type="text"
                        value={htmlExtractedFields.brand}
                        onChange={(e) =>
                          setHtmlExtractedFields((prev) => ({ ...prev, brand: e.target.value }))
                        }
                        placeholder="Brand name"
                      />
                    </label>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div className={styles.htmlFieldGroup}>
                      <label>
                        <strong>Selling Price (₹)</strong>
                        <input
                          type="text"
                          value={htmlExtractedFields.sellingPrice}
                          onChange={(e) =>
                            setHtmlExtractedFields((prev) => ({ ...prev, sellingPrice: e.target.value }))
                          }
                          placeholder="e.g. 1499"
                        />
                      </label>
                    </div>

                    <div className={styles.htmlFieldGroup}>
                      <label>
                        <strong>MRP (₹)</strong>
                        <input
                          type="text"
                          value={htmlExtractedFields.mrp}
                          onChange={(e) =>
                            setHtmlExtractedFields((prev) => ({ ...prev, mrp: e.target.value }))
                          }
                          placeholder="e.g. 1999"
                        />
                      </label>
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div className={styles.htmlFieldGroup}>
                      <label>
                        <strong>Category &amp; Subcategory</strong>
                        <select
                          value={htmlExtractedFields.categoryId}
                          onChange={(e) =>
                            setHtmlExtractedFields((prev) => ({ ...prev, categoryId: e.target.value }))
                          }
                        >
                          <option value="">Select Category / Subcategory</option>
                          {categories
                            .filter((c) => !c.parentId)
                            .map((parent) => {
                              const children = categories.filter((c) => c.parentId === parent.id);
                              return (
                                <optgroup key={parent.id} label={`📁 ${parent.name}`}>
                                  {children.length === 0 ? (
                                    <option value={parent.id}>{parent.name}</option>
                                  ) : (
                                    children.map((sub) => (
                                      <option key={sub.id} value={sub.id}>
                                        {parent.name} → {sub.name}
                                      </option>
                                    ))
                                  )}
                                </optgroup>
                              );
                            })}
                        </select>
                      </label>
                    </div>

                    <div className={styles.htmlFieldGroup}>
                      <label>
                        <strong>Merchant</strong>
                        <select
                          required
                          value={htmlExtractedFields.merchantId}
                          onChange={(e) =>
                            setHtmlExtractedFields((prev) => ({ ...prev, merchantId: e.target.value }))
                          }
                        >
                          <option value="">Select merchant from Merchant Websites</option>
                          {directoryMerchants.map((m) => (
                            <option key={m.id} value={m.id} disabled={m.status !== "ACTIVE"}>
                              {m.name}{m.status !== "ACTIVE" ? ` (${m.status.toLowerCase()})` : ""}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  </div>

                  <div className={styles.htmlFieldGroup}>
                    <label>
                      <strong>Product Image</strong>
                      <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 6 }}>
                        {htmlExtractedFields.imageUrl ? (
                          <div style={{ width: 64, height: 64, border: "1px solid var(--md-color-border-strong)", borderRadius: 8, overflow: "hidden", flexShrink: 0, background: "var(--md-color-surface-muted)" }}>
                            <Image src={htmlExtractedFields.imageUrl} alt="Product preview" width={64} height={64} unoptimized style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                          </div>
                        ) : null}
                        <input
                          type="url"
                          style={{ flex: 1 }}
                          value={htmlExtractedFields.imageUrl}
                          onChange={(e) => setHtmlExtractedFields((prev) => ({
                            ...prev,
                            imageUrl: e.target.value,
                            mediaId: prev.imageUrl === e.target.value ? prev.mediaId : "",
                          }))}
                          placeholder="Image URL extracted from HTML"
                        />
                        {htmlExtractedFields.imageUrl && !htmlExtractedFields.mediaId && (
                          <button
                            type="button"
                            className={styles.htmlImportImgBtn}
                            disabled={htmlImageImporting || htmlImageUploading || htmlReviewLoading}
                            onClick={() => handleImportImageForHtmlReview(htmlExtractedFields.imageUrl)}
                          >
                            {htmlImageImporting ? "Importing…" : "Import Image"}
                          </button>
                        )}
                        {htmlExtractedFields.mediaId && (
                          <span style={{ fontSize: 11, color: "var(--md-color-success)", fontWeight: 700 }}>✓ Imported</span>
                        )}
                        <label className={styles.htmlImportImgBtn} style={{ cursor: htmlImageUploading ? "wait" : "pointer", whiteSpace: "nowrap" }}>
                          {htmlImageUploading ? "Uploading…" : "Upload / paste image"}
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp,image/avif,image/gif,image/tiff,image/svg+xml"
                            disabled={htmlReviewLoading || htmlImageImporting || htmlImageUploading}
                            style={{ display: "none" }}
                            onChange={(event) => {
                              const file = event.target.files?.[0];
                              if (file) void handleUploadHtmlProductImage(file);
                              event.currentTarget.value = "";
                            }}
                          />
                        </label>
                      </div>
                    </label>

                    {htmlExtractedFields.images.length > 1 && (
                      <div style={{ marginTop: 8 }}>
                        <span style={{ fontSize: 11, color: "var(--md-color-text-secondary)" }}>Detected images from HTML (click to select):</span>
                        <div style={{ display: "flex", gap: 6, overflowX: "auto", padding: "6px 0" }}>
                          {htmlExtractedFields.images.slice(0, 8).map((img, idx) => (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => {
                                setHtmlExtractedFields((prev) => ({ ...prev, imageUrl: img, mediaId: "" }));
                              }}
                              style={{
                                width: 44,
                                height: 44,
                                border: htmlExtractedFields.imageUrl === img ? "2px solid var(--md-color-primary)" : "1px solid var(--md-color-border-strong)",
                                borderRadius: 6,
                                overflow: "hidden",
                                padding: 0,
                                background: "var(--md-white)",
                                cursor: "pointer",
                                flexShrink: 0,
                              }}
                            >
                              <Image src={img} alt={`Candidate ${idx}`} width={44} height={44} unoptimized style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className={styles.htmlFieldGroup}>
                    <label>
                      <strong>Description</strong>
                      <textarea
                        rows={3}
                        value={htmlExtractedFields.description}
                        onChange={(e) =>
                          setHtmlExtractedFields((prev) => ({ ...prev, description: e.target.value }))
                        }
                        placeholder="Product description extracted from HTML"
                      />
                    </label>
                  </div>
                </div>
              ) : (
                <div>
                  <div className={styles.htmlSourceToolbar}>
                    <span style={{ fontSize: 12, color: "var(--md-color-text-secondary)" }}>
                      Load a saved .html/.txt file or paste source from browser View-Source:
                    </span>
                    <label className={styles.htmlSourceFileLabel}>
                      Load HTML file
                      <input
                        type="file"
                        accept=".html,.htm,.txt,text/html,text/plain"
                        disabled={htmlReviewLoading || htmlImageImporting || htmlImageUploading}
                        onChange={async (event) => {
                          const input = event.currentTarget;
                          const file = input.files?.[0];
                          if (!file) return;
                          if (file.size > 1_000_000) {
                            setMessage("HTML source files must be 1 MB or smaller.");
                            input.value = "";
                            return;
                          }
                          try {
                            setHtmlReviewSource(await file.text());
                            setMessage("");
                          } catch {
                            setMessage("Could not read this HTML file. Try saving it as UTF-8 text.");
                          } finally {
                            input.value = "";
                          }
                        }}
                      />
                    </label>
                    <button
                      type="button"
                      className={styles.htmlExtractBtn}
                      onClick={() => handleOpenHtmlReview(htmlReviewSource)}
                    >
                      ⚡ Re-parse Extracted Details from this HTML
                    </button>
                  </div>
                  <textarea
                    className={styles.htmlSourceArea}
                    value={htmlReviewSource}
                    onChange={(e) => setHtmlReviewSource(e.target.value)}
                    placeholder="Paste the complete saved HTML source here, or use Load HTML file above. Then click Re-parse Extracted Details from this HTML."
                    spellCheck={false}
                  />
                </div>
              )}
            </div>

            <div className={styles.htmlModalFooter}>
              <div style={{ fontSize: 12, color: "var(--md-color-text-secondary)" }}>
                Target URL: <code style={{ fontSize: 11 }}>{form.productUrl}</code>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button
                  type="button"
                  className={styles.htmlCancelBtn}
                  onClick={() => setShowHtmlReviewModal(false)}
                >
                  Dismiss
                </button>
                <button
                  type="button"
                  className={styles.htmlApplyBtn}
                  onClick={handleApplyHtmlExtractedToForm}
                >
                  ✏️ Apply to Deal Form
                </button>
                <button
                  type="button"
                  className={styles.htmlPublishBtn}
                  onClick={handlePublishHtmlDirect}
                  disabled={htmlReviewLoading || htmlImageImporting || htmlImageUploading}
                >
                  🚀 Publish Deal
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === "categories" && (
        <section className={styles.panel}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: "1.5rem", fontWeight: 700, color: "var(--md-purple-950)" }}>
                Categories ({categories.filter((c) => !c.parentId).length} Parent, {categories.filter((c) => c.parentId).length} Subcategories)
              </h2>
              <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--md-color-text-secondary)" }}>
                Manage hierarchical shopping categories and taxonomy.
              </p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => {
                  setTaxonomy({
                    kind: "categories",
                    id: "",
                    name: "",
                    slug: "",
                    parentId: "",
                    websiteUrl: "",
                  });
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "8px 16px",
                  background: "var(--md-color-primary)",
                  color: "var(--md-white)",
                  border: "none",
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                  boxShadow: "0 2px 4px color-mix(in srgb, var(--md-purple-500) 20%, transparent)",
                }}
              >
                ➕ Add New Category
              </button>

              <button
                type="button"
                onClick={() => {
                  const firstParent = categories.find((c) => !c.parentId);
                  setTaxonomy({
                    kind: "categories",
                    id: "",
                    name: "",
                    slug: "",
                    parentId: firstParent?.id ?? "",
                    websiteUrl: "",
                  });
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "8px 16px",
                  background: "var(--md-color-primary-subtle)",
                  color: "var(--md-color-primary)",
                  border: "1px solid var(--md-purple-300)",
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                ↳ Add a New Sub Category
              </button>

              <button
                type="button"
                onClick={() => void load()}
                style={{
                  fontSize: 13,
                  padding: "8px 14px",
                  background: "var(--md-color-surface-muted)",
                  color: "var(--md-color-text-secondary)",
                  border: "1px solid var(--md-color-border-strong)",
                  borderRadius: 8,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
                title="Refresh latest categories from database"
              >
                🔄 Refresh
              </button>
            </div>
          </div>

        {can({ role, permissions }, "category:manage") && (
          <form
            className={styles.grid}
            style={{
              background: "var(--md-color-primary-subtle)",
              border: "1px solid var(--md-color-primary-soft)",
              borderRadius: 14,
              padding: 20,
              marginBottom: 28,
            }}
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                await request(
                  `categories${taxonomy.id ? `/${taxonomy.id}` : ""}`,
                  taxonomy.id ? "PUT" : "POST",
                  {
                    name: taxonomy.name,
                    slug: taxonomy.slug,
                    parentId: taxonomy.parentId || null,
                  }
                );
                await load();
                setTaxonomy({ ...taxonomy, id: "", name: "", slug: "", parentId: "" });
                setMessage(taxonomy.id ? "Category updated." : "New category created successfully.");
              });
            }}
          >
            <div style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: -6 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: "var(--md-color-primary)" }}>
                {taxonomy.id
                  ? `✏️ Edit ${taxonomy.parentId ? "Subcategory" : "Category"}: ${taxonomy.name}`
                  : taxonomy.parentId
                  ? "↳ Creating New Sub Category"
                  : "➕ Creating New Category (Top Level)"}
              </span>
              {taxonomy.id && (
                <button
                  type="button"
                  onClick={() => setTaxonomy({ ...taxonomy, id: "", name: "", slug: "", parentId: "" })}
                  style={{
                    fontSize: 11,
                    padding: "3px 8px",
                    background: "var(--md-color-surface-muted)",
                    color: "var(--md-color-text-secondary)",
                    border: "1px solid var(--md-color-border-strong)",
                    borderRadius: 4,
                  }}
                >
                  Cancel Edit
                </button>
              )}
            </div>

            <label>
              Parent Category
              <select
                value={taxonomy.parentId}
                onChange={(e) => setTaxonomy({ ...taxonomy, parentId: e.target.value })}
                style={{ background: "var(--md-white)" }}
              >
                <option value="">Top level (Parent Category)</option>
                {categories
                  .filter((x) => !x.parentId && x.id !== taxonomy.id)
                  .map((x) => (
                    <option key={x.id} value={x.id}>
                      📁 {x.name}
                    </option>
                  ))}
              </select>
            </label>

            <label>
              Category Name *
              <input
                required
                placeholder="e.g. Baby Care or Toys"
                value={taxonomy.name}
                onChange={(e) => {
                  const val = e.target.value;
                  const autoSlug = val
                    .toLowerCase()
                    .trim()
                    .replace(/['’]/g, "")
                    .replace(/[^\w\s-]/g, "")
                    .replace(/[\s_-]+/g, "-");
                  setTaxonomy({
                    ...taxonomy,
                    name: val,
                    slug: taxonomy.id ? taxonomy.slug : autoSlug,
                  });
                }}
                style={{ background: "var(--md-white)" }}
              />
            </label>

            <label>
              Slug *
              <input
                required
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
                placeholder="e.g. baby-care"
                value={taxonomy.slug}
                onChange={(e) => setTaxonomy({ ...taxonomy, slug: e.target.value })}
                style={{ background: "var(--md-white)" }}
              />
            </label>

            <div style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 4 }}>
              <button
                disabled={busy}
                style={{
                  background: "var(--md-color-primary)",
                  color: "var(--md-white)",
                  fontWeight: 700,
                  fontSize: 13,
                  padding: "9px 22px",
                  borderRadius: 8,
                  border: "none",
                  cursor: "pointer",
                }}
              >
                {busy ? "Saving..." : taxonomy.id ? "Update Category" : taxonomy.parentId ? "Save Sub Category" : "Save Category"}
              </button>
            </div>
          </form>
        )}

        {/* Tree Model View for Category & Sub Category */}
        <div style={{ marginTop: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--md-purple-950)", margin: 0 }}>
              🌳 Category &amp; Subcategory Tree ({categories.length} total)
            </h3>
            <span style={{ fontSize: 12, color: "var(--md-color-text-secondary)" }}>
              Click on any category or subcategory to edit
            </span>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
              gap: 16,
            }}
          >
            {categories
              .filter((c) => !c.parentId)
              .map((parent) => {
                const children = categories.filter((c) => c.parentId === parent.id);
                return (
                  <div
                    key={parent.id}
                    style={{
                      background: "var(--md-white)",
                      border: "1px solid var(--md-color-border)",
                      borderRadius: 12,
                      padding: "14px 16px",
                      boxShadow: "0 1px 3px color-mix(in srgb, var(--md-black) 4%, transparent)",
                      display: "flex",
                      flexDirection: "column",
                      gap: 10,
                    }}
                  >
                    {/* Parent Category Card Header */}
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        borderBottom: "1.5px solid var(--md-color-surface-muted)",
                        paddingBottom: 8,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: "1.1rem" }}>📁</span>
                        <span
                          style={{
                            fontWeight: 700,
                            fontSize: "0.95rem",
                            color: "var(--md-purple-950)",
                            cursor: "pointer",
                          }}
                          onClick={() => {
                            setTaxonomy({
                              kind: "categories",
                              id: parent.id,
                              name: parent.name,
                              slug: parent.slug,
                              parentId: "",
                              websiteUrl: "",
                            });
                            window.scrollTo({ top: 0, behavior: "smooth" });
                          }}
                          title="Click to edit category"
                        >
                          {parent.name}
                        </span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span
                          style={{
                            fontSize: "0.72rem",
                            fontWeight: 700,
                            padding: "2px 7px",
                            borderRadius: 10,
                            background: "var(--md-color-primary-soft)",
                            color: "var(--md-color-primary-hover)",
                          }}
                        >
                          {children.length} sub
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setTaxonomy({
                              kind: "categories",
                              id: "",
                              name: "",
                              slug: "",
                              parentId: parent.id,
                              websiteUrl: "",
                            });
                            window.scrollTo({ top: 0, behavior: "smooth" });
                          }}
                          style={{
                            background: "transparent",
                            border: "1px dashed var(--md-purple-300)",
                            color: "var(--md-color-primary)",
                            borderRadius: 4,
                            padding: "2px 6px",
                            fontSize: 11,
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                          title={`Add subcategory under ${parent.name}`}
                        >
                          + Add Sub
                        </button>
                      </div>
                    </div>

                    {/* Subcategories Tree Branch */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingLeft: 4 }}>
                      {children.length === 0 ? (
                        <div style={{ fontSize: 12, color: "var(--md-color-text-muted)", fontStyle: "italic", padding: "4px 8px" }}>
                          No subcategories yet
                        </div>
                      ) : (
                        children.map((sub) => (
                          <div
                            key={sub.id}
                            onClick={() => {
                              setTaxonomy({
                                kind: "categories",
                                id: sub.id,
                                name: sub.name,
                                slug: sub.slug,
                                parentId: sub.parentId ?? parent.id,
                                websiteUrl: "",
                              });
                              window.scrollTo({ top: 0, behavior: "smooth" });
                            }}
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              padding: "5px 10px",
                              borderRadius: 6,
                              background: "var(--md-color-surface-muted)",
                              border: "1px solid var(--md-color-surface-muted)",
                              fontSize: 12.5,
                              color: "var(--md-neutral-700)",
                              cursor: "pointer",
                              transition: "all 0.15s ease",
                            }}
                            title="Click to edit subcategory"
                          >
                            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{ color: "var(--md-purple-400)", fontWeight: 700 }}>↳</span>
                              <span style={{ fontWeight: 500 }}>{sub.name}</span>
                            </span>
                            <span style={{ fontSize: 10, color: "var(--md-color-text-muted)" }}>edit</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      </section>
      )}

      {activeTab === "deals" && (
        <>
          <div className={editModal ? styles.editBackdrop : undefined} onMouseDown={(event) => { if (editModal && event.target === event.currentTarget && !busy) closeEditModal(); }}>
          <section className={`${styles.panel} ${styles.addPanel} ${editModal ? styles.editModal : ""}`} {...(editModal ? { role: "dialog", "aria-modal": true, "aria-label": "Edit deal" } : {})}>
            <div className={styles.addHead}>
              <div>
                <h2>{selected ? "Edit deal" : "Add New Deal"}</h2>
                {selected && <p>Update the details of this deal.</p>}
              </div>
              <div className={styles.addHeadActions}>
                {editModal && (
                  <button type="button" className={styles.editClose} onClick={closeEditModal} disabled={busy} aria-label="Close without saving" title="Close">
                    <X size={18} aria-hidden="true" />
                  </button>
                )}
                {!editModal && (
                  <button type="button" className={styles.headNew} disabled={busy} onClick={resetToNewDeal}>
                    <Plus size={16} aria-hidden="true" /> New deal
                  </button>
                )}
                <button type="submit" form="deal-form" className={styles.headSave} disabled={busy || selected?.status === "ARCHIVED"} onClick={() => { publishAfterSave.current = false; }}>
                  <Save size={16} aria-hidden="true" /> Save as Draft
                </button>
                <button
                  type="button"
                  className={styles.headPublish}
                  disabled={busy || selected?.status === "ARCHIVED"}
                  onClick={() => {
                    // While an extraction preview is open, the top button does exactly what the preview's own Publish Deal does.
                    if (showPreviewModal && extractionResult) { void handleDirectPublish(); return; }
                    const formEl = document.getElementById("deal-form") as HTMLFormElement | null;
                    if (!formEl) return;
                    publishAfterSave.current = true;
                    if (!formEl.reportValidity()) { publishAfterSave.current = false; return; }
                    formEl.requestSubmit();
                  }}
                >
                  <Send size={16} aria-hidden="true" /> Publish Deal
                </button>
              </div>
            </div>
        <form id="deal-form" onSubmit={save}>
          <fieldset disabled={busy || selected?.status === "ARCHIVED"} className={styles.addLayout}>
            <div className={styles.addMain}>
            <div className={`${styles.scrapeContainer} ${styles.addCard} ${styles.fetchCard}`}>
              <div className={styles.fetchTitle}>
                <span className={styles.fetchIcon}><Link2 size={18} aria-hidden="true" /></span>
                <div>
                  <h3>Fetch Deal from URL <em>(Recommended)</em></h3>
                  <p>Paste an Amazon, Flipkart or other product URL to auto-fill the details.</p>
                </div>
              </div>
              <div className={styles.scrapeInputRow}>
                <label>
                  <span className="sr-only">Add URL to Fetch the Deal</span>
                  {detectedRetailer && (
                    <span className={styles.retailerBadge}>{detectedRetailer}</span>
                  )}
                  <input
                    required
                    type="url"
                    placeholder="https://www.amazon.in/dp/... or https://www.flipkart.com/..."
                    value={form.productUrl}
                    onChange={(e) => {
                      field("productUrl", e.target.value);
                      setDetectedRetailer(detectRetailer(e.target.value));
                    }}
                  />
                </label>
                <button
                  type="button"
                  disabled={extracting || busy || !form.productUrl.trim()}
                  onClick={handleScrape}
                  className={styles.scrapeBtn}
                >
                  <Wand2 size={15} aria-hidden="true" /> {extracting ? "Fetching..." : extractionResult ? "Try again" : "Fetch Details"}
                </button>
                <button
                  type="button"
                  className={styles.resetBtn}
                  onClick={selected ? resetCurrentEdit : resetDealEntry}
                  disabled={busy || extracting}
                  aria-label={selected ? "Reset unsaved changes to the saved deal" : "Reset deal form for the next deal"}
                  title={selected ? "Discard unsaved edits and restore the saved deal values" : "Clear the current URL, extraction result, and deal fields"}
                >
                  {selected ? "Reset changes" : "Reset"}
                </button>
              </div>
              <SameLinkNotice check={dealCheck} />
              {extractProgress && (
                <div className={styles.extractStatus}>
                  <span>{extractProgress}</span>
                  {extractionResult && extractionResult.status !== "FULL_SUCCESS" && (
                    <button
                      type="button"
                      className={styles.reviewHtmlBtn}
                      onClick={() => handleOpenHtmlReview(undefined, "html")}
                      disabled={htmlReviewLoading}
                    >
                      {htmlReviewLoading ? "Opening..." : "Import HTML source"}
                    </button>
                  )}
                  {(extractProgress.toLowerCase().includes("unavailable") ||
                    extractProgress.toLowerCase().includes("manual") ||
                    extractProgress.toLowerCase().includes("fail")) && (
                    <button
                      type="button"
                      className={styles.reviewHtmlBtn}
                      onClick={() => handleOpenHtmlReview()}
                      disabled={htmlReviewLoading}
                    >
                      {htmlReviewLoading ? "Analyzing..." : "🔍 Review"}
                    </button>
                  )}
                </div>
              )}
            </div>

            {showPreviewModal && extractionResult && (
              <div className={styles.previewModal}>
                {message && (
                  <div className={styles.notice} style={{ marginBottom: "12px" }}>
                    {message}
                  </div>
                )}
                <div className={styles.previewHeader}>
                  <div className={styles.previewHeaderLeft}>
                    {extractionResult.data.media.primaryImageUrl.value && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={extractionResult.data.media.primaryImageUrl.value}
                        alt="Product preview"
                        style={{ width: "48px", height: "48px", objectFit: "contain", borderRadius: "6px", background: "var(--md-color-surface)", border: "1px solid var(--md-color-border)" }}
                      />
                    )}
                    <div>
                      <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700 }}>
                        Extraction Preview: {extractionResult.retailer}
                      </h3>
                      <span style={{ fontSize: "12px", color: "var(--md-color-text-secondary)" }}>
                        Provenance: {extractionResult.diagnostics.extractionMethodUsed} ({extractionResult.diagnostics.executionTimeMs}ms)
                      </span>
                    </div>
                  </div>

                  <div className={styles.previewHeaderRight}>
                    <div className={styles.previewActions}>
                      <button
                        type="button"
                        onClick={handleDirectPublish}
                        disabled={busy || publishingDirect || extracting}
                        className={styles.publishBtn}
                      >
                        {publishingDirect ? "Publishing..." : "🚀 Publish Deal"}
                      </button>
                      <button
                        type="button"
                        onClick={applyExtractedData}
                        disabled={busy || publishingDirect || extracting}
                        className={styles.editBtn}
                      >
                        ✏️ Edit Details
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowPreviewModal(false)}
                        disabled={busy || publishingDirect || extracting}
                        className={styles.dismissBtn}
                      >
                        Dismiss
                      </button>
                    </div>

                    <span
                      className={`${styles.previewStatus} ${
                        extractionResult.status === "FULL_SUCCESS"
                          ? styles.statusFull
                          : styles.statusPartial
                      }`}
                    >
                      {extractionResult.status}
                    </span>
                  </div>
                </div>

                <table className={styles.previewTable}>
                  <thead>
                    <tr>
                      <th>Field</th>
                      <th>Extracted Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewEditableRow("title", "Product title", previewTitle || extractionResult.data.identity.title.value || "", previewTitle || extractionResult.data.identity.title.value || "(Not available)", <input autoFocus className={styles.inlineInput} aria-label="Product title" value={previewEditValue} onChange={(event) => setPreviewEditValue(event.target.value)} />)}
                    {previewEditableRow("photos", "Product photos", previewGalleryImageUrls.join("\n"), (
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span>{previewGalleryImageUrls.length} photo{previewGalleryImageUrls.length === 1 ? "" : "s"} found; up to 11 are saved with the deal.</span>
                        {previewGalleryImageUrls.slice(0, 5).map((url, index) => <Image key={`${url}-${index}`} src={url} alt={`Product photo ${index + 1}`} width={36} height={36} unoptimized style={{ width: 36, height: 36, objectFit: "contain", border: "1px solid var(--md-color-border)", borderRadius: 4 }} />)}
                      </div>
                    ), <textarea autoFocus className={styles.inlineTextarea} aria-label="Product photo URLs" placeholder="One HTTPS image URL per line" value={previewEditValue} onChange={(event) => setPreviewEditValue(event.target.value)} />, "", styles.inlineTextareaForm)}
                    {previewEditableRow("brand", "Brand", previewBrand || extractionResult.data.identity.brand.value || "", previewBrand || extractionResult.data.identity.brand.value || "(Not available)", <input autoFocus className={styles.inlineInput} aria-label="Brand" value={previewEditValue} onChange={(event) => setPreviewEditValue(event.target.value)} />)}
                    {previewEditableRow("description", "Description", previewDescription || extractionResult.data.content.description.value || "", (previewDescription || extractionResult.data.content.description.value || "(Not available)").slice(0, 180), <textarea autoFocus className={styles.inlineTextarea} aria-label="Product description" value={previewEditValue} onChange={(event) => setPreviewEditValue(event.target.value)} />, "", styles.inlineTextareaForm)}
                    {previewEditableRow("category", "Category & Subcategory", previewCategory, (() => {
                      const category = categories.find((item) => item.id === previewCategory);
                      const parent = category?.parentId ? categories.find((item) => item.id === category.parentId) : null;
                      return category ? `${parent ? `${parent.name} → ` : ""}${category.name}` : "(Select category / subcategory)";
                    })(), (
                      <select value={previewEditValue} onChange={(event) => setPreviewEditValue(event.target.value)} className={styles.inlineSelect} aria-label="Select category or subcategory">
                        <option value="">-- Select Category / Subcategory --</option>
                        {categories.filter((category) => !category.parentId).map((parent) => {
                          const children = categories.filter((category) => category.parentId === parent.id);
                          return children.length === 0 ? <option key={parent.id} value={parent.id}>{parent.name}</option> : <optgroup key={parent.id} label={parent.name}>{children.map((child) => <option key={child.id} value={child.id}>{parent.name} → {child.name}</option>)}</optgroup>;
                        })}
                      </select>
                    ))}
                    {previewEditableRow("merchant", "Merchant", previewMerchant, (
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        {directoryMerchants.find((merchant) => merchant.id === previewMerchant)?.logoUrl ? <Image src={directoryMerchants.find((merchant) => merchant.id === previewMerchant)!.logoUrl!} alt="" width={72} height={28} unoptimized style={{ maxWidth: 72, maxHeight: 28, width: "auto", height: "auto", objectFit: "contain" }} /> : null}
                        {directoryMerchants.find((merchant) => merchant.id === previewMerchant)?.name || "(Select merchant)"}
                      </div>
                    ), (
                      <select value={previewEditValue} onChange={(event) => setPreviewEditValue(event.target.value)} className={styles.inlineSelect} aria-label="Select merchant from Merchant Websites">
                        <option value="">-- Select merchant from Merchant Websites --</option>
                        {directoryMerchants.map((merchant) => <option key={merchant.id} value={merchant.id} disabled={merchant.status !== "ACTIVE"}>{merchant.name}{merchant.status !== "ACTIVE" ? ` (${merchant.status.toLowerCase()})` : ""}</option>)}
                      </select>
                    ))}
                    {previewEditableRow("price", "Price & Discount", previewMrp, (
                      <>
                        <strong>MRP:</strong> {previewMrp ? `₹${previewMrp}` : "(Manual entry required)"}
                        <span style={{ margin: "0 10px", color: "var(--md-color-border)" }}>|</span>
                        <strong>Selling price:</strong> {previewPrice ? `₹${previewPrice}` : "(Manual entry required)"}
                        {previewMrp && previewPrice && Number(previewMrp) > 0 && Number(previewPrice) <= Number(previewMrp) ? <span style={{ marginLeft: 10, color: "var(--md-color-primary)", fontWeight: 700 }}>{Math.round(((Number(previewMrp) - Number(previewPrice)) / Number(previewMrp)) * 10000) / 100}% OFF</span> : null}
                      </>
                    ), <>
                      <input autoFocus className={styles.inlineInput} type="number" min="0" step="0.01" aria-label="MRP in rupees" placeholder="MRP ₹" value={previewEditValue} onChange={(event) => { setPreviewEditValue(event.target.value); setMessage(""); }} />
                      <input className={styles.inlineInput} type="number" min="0" step="0.01" aria-label="Deal price in rupees" placeholder="Deal price ₹" value={previewEditSecondaryValue} onChange={(event) => { setPreviewEditSecondaryValue(event.target.value); setMessage(""); }} />
                    </>, previewPrice)}
                    {previewEditableRow("coupon", "Coupon code", previewCoupon, previewCoupon || "(No coupon code)", <input autoFocus className={styles.inlineInput} aria-label="Coupon code" value={previewEditValue} onChange={(event) => setPreviewEditValue(event.target.value)} />)}
                    {previewEditableRow("rating", "Rating / Reviews", previewRating, previewRating || extractionResult.data.ratings.rating.value !== null ? `★ ${previewRating || extractionResult.data.ratings.rating.value} (${previewReviewCount || extractionResult.data.ratings.reviewCount.value || 0} reviews)` : "(Not available)", <>
                      <input autoFocus className={styles.inlineInput} type="number" min="0" max="5" step="0.1" aria-label="Rating out of five" placeholder="Rating" value={previewEditValue} onChange={(event) => setPreviewEditValue(event.target.value)} />
                      <input className={styles.inlineInput} type="number" min="0" step="1" aria-label="Review count" placeholder="Review count" value={previewEditSecondaryValue} onChange={(event) => setPreviewEditSecondaryValue(event.target.value)} />
                    </>, previewReviewCount)}
                    {previewEditableRow("youtube", "YouTube", previewYoutubeUrls.filter(Boolean).join("\n"), <>
                      <label style={{ display: "inline-flex", alignItems: "center", gap: 6, marginRight: 10, fontSize: 12 }}>
                        <input type="checkbox" checked={youtubeSearchEnabled} onChange={(event) => setYoutubeSearchEnabled(event.target.checked)} />
                        Search YouTube
                      </label>
                      <button type="button" onClick={() => handleOpenYouTubeSearch(previewBrand || extractionResult.suggestedFormValues?.brand || extractionResult.data.identity.brand.value || "", previewTitle || extractionResult.suggestedFormValues?.title || extractionResult.data.identity.title.value || "", "preview")} className={styles.ytFetchBtn} disabled={!youtubeSearchEnabled || searchingYouTube}>{searchingYouTube ? "Searching YouTube..." : "🎬 Get YouTube Videos"}</button>
                      <span style={{ marginLeft: 8, fontSize: 12, color: "var(--md-color-text-secondary)" }}>{previewYoutubeUrls.filter(Boolean).length ? `${previewYoutubeUrls.filter(Boolean).length} videos selected` : "No videos selected"}</span>
                    </>, <textarea className={styles.inlineTextarea} aria-label="YouTube video URLs" placeholder="Up to three video URLs, one per line" value={previewEditValue} onChange={(event) => setPreviewEditValue(event.target.value)} />, "", styles.inlineTextareaForm)}
                  </tbody>
                </table>

                {extractionResult.diagnostics.warnings.length > 0 && (
                  <div className={styles.warningBox}>
                    <strong>Extraction notices & warnings:</strong>
                    <ul style={{ margin: "6px 0 0 16px", padding: 0 }}>
                      {extractionResult.diagnostics.warnings.map((w: string, i: number) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            <section className={styles.addCard}>
              <div className={styles.cardHead}>
                <span className={styles.cardIcon}><Tag size={18} aria-hidden="true" /></span>
                <div><h3>Deal Details</h3><p>Enter the basic information about the product/deal.</p></div>
              </div>
              <div className={styles.fieldGrid}>
            <label className={styles.fullRow}>
              Product title <b aria-hidden="true">*</b>
              <input
                id="product-title-input"
                required
                type="text"
                value={form.title}
                onChange={(e) => field("title", e.target.value)}
              />
            </label>
            <div className={styles.fullRow}><SimilarDeals check={dealCheck} /></div>
            <label>
              Stable slug (automatic)
              <input
                type="text"
                readOnly
                value={toSlug(form.slug) || toSlug(form.title)}
                aria-readonly="true"
              />
            </label>
            <label>
              Brand
              <input
                type="text"
                value={form.brand}
                onChange={(e) => field("brand", e.target.value)}
              />
            </label>
            <div className={styles.fullRow}>
              <span id="admin-description-label" style={{ fontWeight: 600 }}>Description <b aria-hidden="true">*</b></span>
              <div className={styles.richHost}>
              <RichEditor id="admin-description" initialHtml={descEditor.html} version={descEditor.version} limit={2000} minHeight={150} placeholder="Write a short and attractive deal description..."
                onChange={(html) => {
                  const plain = html ? htmlToPlain(html) : "";
                  setDescEditor((d) => (d.plain === plain ? d : { ...d, plain }));
                  setForm((f) => (f.descriptionHtml === (html || null) && f.description === plain ? f : { ...f, descriptionHtml: html || null, description: plain }));
                }} />
              </div>
            </div>
            <label>
              Category
              <select
                value={(() => {
                  if (selectedParentCategoryId) return selectedParentCategoryId;
                  const currentCat = categories.find((c) => c.id === form.categoryId);
                  return currentCat?.parentId || (currentCat && !currentCat.parentId ? currentCat.id : "");
                })()}
                onChange={(e) => {
                  const parentId = e.target.value;
                  setSelectedParentCategoryId(parentId);
                  if (!parentId) {
                    field("categoryId", "");
                    return;
                  }
                  // Check if this parent has subcategories
                  const children = categories.filter((c) => c.parentId === parentId);
                  if (children.length > 0) {
                    // Default to first subcategory or clear if not matching
                    field("categoryId", children[0].id);
                  } else {
                    // Parent has no subcategories, select parent itself
                    field("categoryId", parentId);
                  }
                }}
              >
                <option value="">Select Category</option>
                {categories
                  .filter((c) => !c.parentId)
                  .map((p) => (
                    <option key={p.id} value={p.id} label={p.name}>
                      {p.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Sub Category
              <select
                required
                value={form.categoryId}
                onChange={(e) => field("categoryId", e.target.value)}
              >
                <option value="">
                  {(() => {
                    const activeParentId =
                      selectedParentCategoryId ||
                      categories.find((c) => c.id === form.categoryId)?.parentId;
                    return activeParentId ? "Select Sub Category" : "First select a Category";
                  })()}
                </option>
                {(() => {
                  const activeParentId =
                    selectedParentCategoryId ||
                    categories.find((c) => c.id === form.categoryId)?.parentId;
                  if (!activeParentId) {
                    // If no parent selected yet, display all categories with parent names
                    return categories.map((c) => {
                      const p = categories.find((x) => x.id === c.parentId);
                      return (
                        <option key={c.id} value={c.id}>
                          {p ? `${p.name} → ${c.name}` : `📁 ${c.name}`}
                        </option>
                      );
                    });
                  }
                  const subs = categories.filter((c) => c.parentId === activeParentId);
                  if (subs.length === 0) {
                    const parentObj = categories.find((c) => c.id === activeParentId);
                    return parentObj ? (
                      <option value={parentObj.id}>
                        {parentObj.name} (Direct)
                      </option>
                    ) : null;
                  }
                  return subs.map((sub) => (
                    <option key={sub.id} value={sub.id} label={sub.name}>
                      {sub.name}
                    </option>
                  ));
                })()}
              </select>
            </label>
              </div>
            </section>
            <section className={styles.addCard}>
              <div className={styles.cardHead}>
                <span className={styles.cardIcon}><Tag size={18} aria-hidden="true" /></span>
                <div><h3>Pricing &amp; Merchant</h3><p>Set the price, merchant and affiliate details.</p></div>
              </div>
              <div className={`${styles.fieldGrid} ${styles.cols3}`}>
            <label>
              Primary merchant
              <select required value={form.merchantId} onChange={(e) => field("merchantId", e.target.value)}>
                <option value="">Select merchant</option>
                {directoryMerchants.map((directoryMerchant) => {
                  const domain = merchantDomain(directoryMerchant.domain);
                  const operational = merchants.find((merchant) => merchant.websiteUrl && merchantDomain(merchant.websiteUrl) === domain);
                  return (
                    <option
                      key={directoryMerchant.id}
                      value={operational?.id || directoryMerchant.id}
                      disabled={directoryMerchant.status !== "ACTIVE"}
                    >
                      {directoryMerchant.name}{directoryMerchant.status !== "ACTIVE" ? ` (${directoryMerchant.status.toLowerCase()})` : ""}
                    </option>
                  );
                })}
                {merchants.filter((merchant) => !directoryMerchants.some((directoryMerchant) =>
                  merchant.websiteUrl && merchantDomain(merchant.websiteUrl) === merchantDomain(directoryMerchant.domain)
                )).map((merchant) => (
                  <option key={merchant.id} value={merchant.id}>{merchant.name}</option>
                ))}
              </select>
            </label>
            <label>
              MRP (₹)
              <input
                type="number"
                min="0.01"
                step="0.01"
                required
                placeholder="e.g. 1999.00"
                value={form.mrpRupees}
                onChange={(e) => field("mrpRupees", e.target.value)}
              />
              {form.mrpRupees && !isNaN(Number(form.mrpRupees)) && Number(form.mrpRupees) > 0 && (
                <small>{formatINR(Number(form.mrpRupees))}</small>
              )}
            </label>
            <label>
              Deal price (₹)
              <input
                type="number"
                min="0"
                step="0.01"
                required
                placeholder="e.g. 1499.00"
                value={form.priceRupees}
                onChange={(e) => field("priceRupees", e.target.value)}
              />
              {form.priceRupees && !isNaN(Number(form.priceRupees)) && (
                <small>{formatINR(Number(form.priceRupees))}</small>
              )}
            </label>
            <label className={styles.span2}>
              Coupon code (optional)
              <input
                type="text"
                placeholder="e.g. FLAT200, SAVE10"
                style={{ textTransform: "uppercase" }}
                value={form.couponCode ?? ""}
                onChange={(e) => field("couponCode", e.target.value ? e.target.value.toUpperCase() : null)}
              />
            </label>
            <label className={styles.span2}>
              Editor&apos;s Notes (optional, one point per line)
              <textarea
                rows={4}
                maxLength={3000}
                placeholder="Lowest price in 3 months, then one point per line"
                value={form.editorNotes ?? ""}
                onChange={(e) => field("editorNotes", e.target.value || null)}
              />
            </label>
            {can({ role, permissions }, "affiliate:manage") && (
              <label className={styles.span2}>
                Manual affiliate URL (optional)
                <input
                  type="url"
                  value={form.affiliateUrl ?? ""}
                  onChange={(e) => field("affiliateUrl", e.target.value || null)}
                />
              </label>
            )}
              </div>
            </section>
            {!editModal && (<>
            <section className={styles.addCard}>
              <div className={styles.cardHead}>
                <span className={styles.cardIcon}><Calendar size={18} aria-hidden="true" /></span>
                <div><h3>Scheduling &amp; Settings</h3><p>Control when the deal is published and other optional settings.</p></div>
              </div>
              <div className={`${styles.fieldGrid} ${styles.cols12}`}>
            {(["publishedAt", "startsAt", "expiresAt"] as const).map((key) => (
              <label key={key}>
                {
                  ({
                    publishedAt: "Publish at (UTC, optional)",
                    startsAt: "Starts at (UTC, optional)",
                    expiresAt: "Expires at (UTC, optional)",
                  })[key]
                }
                <input
                  type="datetime-local"
                  value={form[key]?.slice(0, 16) ?? ""}
                  onChange={(e) =>
                    field(key, e.target.value ? new Date(`${e.target.value}:00Z`).toISOString() : null)
                  }
                />
              </label>
            ))}
            <label>
              Rating (optional)
              <input
                type="number"
                min="0"
                max="5"
                step="0.1"
                value={form.rating ?? ""}
                onChange={(e) => field("rating", e.target.value ? Number(e.target.value) : null)}
              />
            </label>
            <label>
              Review count (optional)
              <input
                type="number"
                min="0"
                step="1"
                value={form.reviewCount ?? ""}
                onChange={(e) => field("reviewCount", e.target.value ? Number(e.target.value) : null)}
              />
            </label>
            <label>
              Rating/review source label
              <input
                value={form.ratingSource ?? ""}
                onChange={(e) => field("ratingSource", e.target.value || null)}
              />
            </label>
            <label>
              Status
              <select
                value={form.status}
                onChange={(e) => field("status", e.target.value as DealInput["status"])}
              >
                <option>DRAFT</option>
                <option>PENDING_REVIEW</option>
                <option>EXPIRED</option>
              </select>
            </label>
              </div>
            </section>
            </>)}

            {!editModal && (<>
            {/* YouTube Review Videos Configuration in Form */}
            <div className={styles.ytDiscoveryCard}>
              <div className={styles.ytDiscoveryHeader}>
                <div>
                  <h4 className={styles.ytDiscoveryTitle}>🎬 YouTube Product Reviews (Top 3)</h4>
                  <p className={styles.ytDiscoverySubtitle}>
                    Search candidate videos from YouTube or enter custom YouTube URLs below.
                  </p>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                    <input type="checkbox" checked={youtubeSearchEnabled} onChange={(event) => setYoutubeSearchEnabled(event.target.checked)} />
                    Search YouTube
                  </label>
                  <button
                    type="button"
                    onClick={() => handleOpenYouTubeSearch(form.brand || "", form.title || "", "form")}
                    disabled={!youtubeSearchEnabled || searchingYouTube || busy}
                    className={styles.ytFetchBtn}
                  >
                    {searchingYouTube ? "Searching YouTube..." : "🎬 Get YouTube Videos"}
                  </button>
                </div>
              </div>
              <div className={styles.ytInputsGrid}>
                <label className={styles.ytInputLabel}>
                  <span><strong>Video 1 URL</strong></span>
                  <input
                    type="url"
                    placeholder="https://www.youtube.com/watch?v=..."
                    value={form.youtubeVideoUrls?.[0] || ""}
                    onChange={(e) => {
                      const val = e.target.value;
                      setForm((prev) => ({
                        ...prev,
                        youtubeVideoUrls: [val, prev.youtubeVideoUrls?.[1] || "", prev.youtubeVideoUrls?.[2] || ""],
                      }));
                    }}
                    className={styles.ytUrlInput}
                  />
                </label>
                <label className={styles.ytInputLabel}>
                  <span><strong>Video 2 URL</strong></span>
                  <input
                    type="url"
                    placeholder="https://www.youtube.com/watch?v=..."
                    value={form.youtubeVideoUrls?.[1] || ""}
                    onChange={(e) => {
                      const val = e.target.value;
                      setForm((prev) => ({
                        ...prev,
                        youtubeVideoUrls: [prev.youtubeVideoUrls?.[0] || "", val, prev.youtubeVideoUrls?.[2] || ""],
                      }));
                    }}
                    className={styles.ytUrlInput}
                  />
                </label>
                <label className={styles.ytInputLabel}>
                  <span><strong>Video 3 URL</strong></span>
                  <input
                    type="url"
                    placeholder="https://www.youtube.com/watch?v=..."
                    value={form.youtubeVideoUrls?.[2] || ""}
                    onChange={(e) => {
                      const val = e.target.value;
                      setForm((prev) => ({
                        ...prev,
                        youtubeVideoUrls: [prev.youtubeVideoUrls?.[0] || "", prev.youtubeVideoUrls?.[1] || "", val],
                      }));
                    }}
                    className={styles.ytUrlInput}
                  />
                </label>
              </div>
            </div>
            </>)}

            </div>
            <aside className={styles.addSide}>
              <ProgressPanel values={{
                // Fetched details sit in the extraction preview until they are applied to the form, so the ring counts those too.
                productUrl: form.productUrl,
                title: (extractionResult && previewTitle) || form.title,
                price: (extractionResult && previewPrice) || form.priceRupees,
                mrp: (extractionResult && previewMrp) || form.mrpRupees,
                description: (extractionResult && previewDescription) || form.description,
                categoryHint: (extractionResult && previewCategory) || form.categoryId,
                merchantName: (extractionResult && previewMerchant) || form.merchantId,
                brand: (extractionResult && previewBrand) || form.brand,
                hasImage: Boolean(form.mediaId || (form.galleryImageUrls?.length ?? 0) > 0 || (extractionResult && (previewImageUrl || previewMediaId || previewGalleryImageUrls.length > 0))),
              }} />
              <section className={styles.addCard}>
                <div className={styles.cardHead}>
                  <span className={styles.cardIcon}><Eye size={18} aria-hidden="true" /></span>
                  <div><h3>Deal Preview</h3><p>How the deal will look (live preview)</p></div>
                </div>
                <div className={styles.dealPreview} aria-live="polite">
                  <div className={styles.dpImage}>
                    {dpImage ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={dpImage} alt="" referrerPolicy="no-referrer" />
                    ) : <ImageIcon size={44} aria-hidden="true" />}
                  </div>
                  {form.title.trim() ? <strong className={styles.dpTitle}>{form.title}</strong> : <><span className={styles.dpBar} /><span className={`${styles.dpBar} ${styles.dpBarShort}`} /></>}
                  {(form.brand || dpMerchant) && <span className={styles.dpMeta}>{[form.brand, dpMerchant].filter(Boolean).join(" · ")}</span>}
                  <div className={styles.dpPrice}>
                    <b className={form.priceRupees === "" ? styles.dpGhost : ""}>{form.priceRupees !== "" && !isNaN(dpPrice) ? formatINR(dpPrice) : "₹1,499"}</b>
                    <s className={form.mrpRupees === "" ? styles.dpGhost : ""}>{form.mrpRupees !== "" && !isNaN(dpMrp) ? formatINR(dpMrp) : "₹1,999"}</s>
                    <span className={`${styles.dpOff} ${dpDiscount === null ? styles.dpGhost : ""}`}>{dpDiscount === null ? "25% OFF" : `${dpDiscount}% OFF`}</span>
                  </div>
                  {form.couponCode ? <span className={styles.dpCoupon}>Coupon: {form.couponCode}</span> : null}
                </div>
              </section>

              <section className={styles.addCard}>
                <div className={styles.cardHead}>
                  <span className={styles.cardIcon}><ImageIcon size={18} aria-hidden="true" /></span>
                  <div><h3>Media &amp; Appearance</h3><p>Add product image and additional display info.</p></div>
                </div>
                <div className={styles.dropZone}>
                  <UploadCloud size={34} aria-hidden="true" />
                  <strong>Upload Product Image</strong>
                  <span>JPG, PNG or WebP (max 5 MB)</span>
                  <label className={styles.chooseFile}>
                    Choose File
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) uploadFormImage(file);
                      }}
                    />
                  </label>
                  <small>Or copy an image and press Ctrl+V anywhere on this page.</small>
                </div>
                <label className={styles.mediaId}>
                  Uploaded media ID
                  <input required value={form.mediaId} onChange={(e) => field("mediaId", e.target.value)} />
                </label>
              </section>

              <section className={styles.addCard}>
                <div className={styles.cardHead}>
                  <span className={styles.cardIcon}><Settings size={18} aria-hidden="true" /></span>
                  <div><h3>Other Settings</h3></div>
                </div>
                <label className={styles.toggleRow}>
                  <input type="checkbox" checked={form.featured} onChange={(e) => field("featured", e.target.checked)} />
                  <span><b>Featured Deal</b><small>Show this deal in the featured section</small></span>
                </label>
                <label className={styles.toggleRow}>
                  <input type="checkbox" checked={form.trending} onChange={(e) => field("trending", e.target.checked)} />
                  <span><b>Trending Deal</b><small>Mark this deal as trending</small></span>
                </label>
              </section>

            {!editModal && (<>
              <section className={styles.addCard}>
                <div className={styles.cardHead}>
                  <span className={styles.cardIcon}><UploadCloud size={18} aria-hidden="true" /></span>
                  <div><h3>Bulk draft import</h3></div>
                </div>
                <p className={styles.bulkNote}>
                  CSV or values-only XLSX, first sheet, at most 100 rows / 1 MB. Upload images first and use their media
                  IDs. Price columns can be in Rupees (mrp, price) or paise (mrpMinor, priceMinor). Required columns:
                  slug,title,description,categoryId,merchantId,mediaId,productUrl. Optional:
                  brand,affiliateUrl,rating,reviewCount,ratingSource,publishedAt,startsAt,expiresAt,featured,trending.
                  Dates use ISO UTC. All rows import atomically as drafts; duplicates fail without overwriting.
                </p>
                <input
                  aria-label="Import file"
                  type="file"
                  accept=".csv,.xlsx"
                  onChange={(e) => {
                    setImportFile(e.target.files?.[0] ?? null);
                    setImportPreview("");
                  }}
                />
                <div className={styles.actions}>
                  {[false, true].map((confirm) => (
                    <button
                      type="button"
                      key={String(confirm)}
                      disabled={busy || !importFile || (confirm && !importPreview)}
                      onClick={() =>
                        void run(async () => {
                          if (!importFile) return;
                          const response = await fetch(
                            "/api/v1/admin/imports?format=" +
                              (importFile.name.endsWith(".xlsx") ? "xlsx" : "csv") +
                              "&confirm=" +
                              confirm,
                            { method: "POST", body: importFile }
                          );
                          const result = await response.json();
                          if (!response.ok) throw new Error(result.error?.message ?? "Import failed.");
                          if (confirm) {
                            setMessage("Imported " + result.count + " drafts.");
                            setImportPreview("");
                            await load();
                          } else {
                            setImportPreview(JSON.stringify(result.preview, null, 2));
                          }
                        })
                      }
                    >
                      {confirm ? "Import validated drafts" : "Validate and preview file"}
                    </button>
                  ))}
                </div>
                {importPreview && (
                  <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", maxHeight: 220, overflow: "auto" }}>{importPreview}</pre>
                )}
              </section>
            </>)}
            </aside>
          </fieldset>
        </form>
        {selected && (
          <div className={styles.actions}>
            <button
              disabled={busy}
              onClick={() =>
                void run(async () => setPreview(await request(`deals/${selected.id}/preview`, "POST", {})))
              }
            >
              Preview saved version
            </button>
            {can({ role, permissions }, "deal:archive") && (
              <>
                <button disabled={busy} onClick={() => archiveRow(selected)}>
                    Delete deal
                  </button>
              </>
            )}
          </div>
        )}
        {preview && (
          <article className={styles.preview} id="saved-preview">
            <h3>Saved preview: {preview.data.title}</h3>
            <Image
              unoptimized
              src={`/api/v1/media/${preview.data.mediaId}`}
              width={220}
              height={220}
              alt={preview.data.title}
            />
            <p>{preview.data.description}</p>
            <strong>
              {formatPaise(preview.data.priceMinor)} ·{" "}
              {minorSavings(preview.data.mrpMinor, preview.data.priceMinor).discountPercent}% off
            </strong>
            <p>
              Check the image, pricing, source URL and dates before publishing. Scheduled offers stay hidden
              until their publication/start time.
            </p>
            <a href={preview.data.productUrl} target="_blank" rel="noreferrer">
              Inspect source
            </a>
            <button
              disabled={busy || !["DRAFT", "PENDING_REVIEW"].includes(preview.data.status)}
              onClick={() =>
                void run(async () => {
                  const result = await request<{ data: Row }>(
                    `deals/${preview.data.id}/publish`,
                    "POST",
                    { version: preview.data.version, previewToken: preview.previewToken }
                  );
                  setSelected(result.data);
                  setPreview(null);
                  await load();
                  setMessage("Published or scheduled according to the saved dates.");
                })
              }
            >
              Confirm preview and publish
            </button>
          </article>
        )}
      </section>
          </div>
      <section className={styles.panel}>
        {!rows.length && (
          <p>No deals yet. Add a category, merchant and product image to create the first draft.</p>
        )}
        <div className={styles.dealTabsBar} role="tablist" aria-label="Deal lists">
          {(["active", "expired", "deleted"] as DealTab[]).map((tab) => (
            <button key={tab} type="button" role="tab" aria-selected={dealTab === tab} className={`${styles.dealTabBtn} ${dealTab === tab ? styles.dealTabBtnActive : ""}`} onClick={() => switchTab(tab)} disabled={busy && dealTab !== tab}>
              {tab === "active" ? "Active" : tab === "expired" ? "Expired" : "Deleted"} <span>{tabCounts[tab]}</span>
            </button>
          ))}
        </div>
        {rows.length === 0 && <p className={styles.dealTabEmpty}>{dealTab === "active" ? "No active deals." : dealTab === "expired" ? "No expired deals." : "No deleted deals."}</p>}
        {rows.length > 0 && (
          <div className={styles.dealTableScroll}>
            <table className={styles.dealTable}>
              <thead>
                <tr>
                  <th scope="col" className={styles.dealColTitle}>Deal</th>
                  <th scope="col">Deal Price</th>
                  <th scope="col">Published</th>
                  <th scope="col">Active</th>
                  <th scope="col">Edit</th>
                  <th scope="col">Delete</th>
                  <th scope="col">Expired Deal</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const live = row.everPublished && ["PUBLISHED", "EXPIRED"].includes(row.status) && dealTab !== "deleted";
                  const expiredNow = classifyDeal(row) === "expired";
                  const canPublishNow = ["DRAFT", "PENDING_REVIEW"].includes(row.status) && can({ role, permissions }, "deal:publish");
                  return (
                    <tr key={row.id}>
                      <td className={styles.dealColTitle}>
                        <span className={styles.dealTitleText} title={row.title}>{row.title.length > 100 ? `${row.title.slice(0, 99).trimEnd()}…` : row.title}</span>
                        {row.expiresAt && <small className={styles.dealSub}>expiry {row.expiresAt}</small>}
                      </td>
                      <td>{formatPaise(row.priceMinor)}</td>
                      <td>{row.status === "PUBLISHED" || row.status === "EXPIRED" ? "Yes" : "No"}</td>
                      <td>
                        {live && (
                          <button
                            type="button"
                            className={`${styles.dealActiveButton} ${expiredNow ? styles.dealActiveButtonDisabled : ""}`}
                            disabled={busy || expiredNow || !can({ role, permissions }, "deal:publish")}
                            aria-disabled={expiredNow}
                            title={expiredNow ? "Expired deals cannot be active until you clear the expired checkbox" : "Deal is active"}
                          >
                            Active
                          </button>
                        )}
                        {dealTab === "deleted" && can({ role, permissions }, "deal:archive") && (
                          <button type="button" className={styles.dealCardEdit} disabled={busy} onClick={() => restoreRow(row)} aria-label={`Restore ${row.title}`}>
                            ↩ Restore
                          </button>
                        )}
                        {canPublishNow && (
                          <button type="button" className={styles.dealCardEdit} disabled={busy} onClick={() => publishRow(row)} aria-label={`Publish ${row.title}`}>
                            🚀 Publish
                          </button>
                        )}
                      </td>
                      <td>
                        {dealTab !== "deleted" && (
                          <button type="button" className={`${styles.dealCardEdit} ${styles.dealIconButton}`} onClick={() => { edit(row); setModalDealId(row.id); }} aria-label={`Edit ${row.title}`} title="Edit">
                            ✏️
                          </button>
                        )}
                      </td>
                      <td>
                        {can({ role, permissions }, "deal:archive") && (
                          <button type="button" className={`${styles.dealCardEdit} ${styles.dealDeleteButton}`} style={{ background: "var(--md-red-700)", color: "var(--md-white)" }} disabled={busy} onClick={() => (dealTab === "deleted" ? removeDeal(row) : archiveRow(row))} aria-label={dealTab === "deleted" ? `Delete ${row.title} permanently` : `Delete ${row.title}`} title={dealTab === "deleted" ? "Delete permanently (cannot be undone)" : "Move to the Deleted tab"}>
                            🗑 {dealTab === "deleted" ? "Delete forever" : "Delete"}
                          </button>
                        )}
                      </td>
                      <td>
                        {live && (
                          <input
                            type="checkbox"
                            className={styles.expiredCheckbox}
                            aria-label={`Expired: ${row.title}`}
                            title="Expired Deal"
                            checked={expiredNow}
                            disabled={busy || !can({ role, permissions }, "deal:publish")}
                            onChange={(event) => updateExpired(row, event.target.checked)}
                          />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className={styles.actions}>
          <button
            disabled={busy || page === 1}
            onClick={() =>
              void run(async () => {
                await load(page - 1);
                setPage(page - 1);
              })
            }
          >
            Previous
          </button>
          <button
            disabled={busy || rows.length < 50}
            onClick={() =>
              void run(async () => {
                await load(page + 1);
                setPage(page + 1);
              })
            }
          >
            Next
          </button>
        </div>
      </section>
      </>
      )}
    </main>
  );
}
