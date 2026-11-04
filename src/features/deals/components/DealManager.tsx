"use client";
import Link from "next/link";
import Image from "next/image";
import { useEffect, useState, type FormEvent } from "react";
import type { DealInput } from "../validation";
import { minorSavings } from "../validation";
import type { ClientExtractionResult } from "../extraction-types";
import {
  rupeesToPaise,
  paiseToRupeeInputString,
  formatPaise,
  formatINR,
} from "../currency";
import { roleCan, type AdminRole } from "@/server/auth/permissions";
import styles from "./manager.module.css";

type Entry = { id: string; name: string; slug: string; parentId?: string | null; websiteUrl?: string };
type Row = Omit<DealInput, "status"> & { id: string; version: number; status: string; everPublished: boolean };

interface AdminDealForm extends Omit<DealInput, "mrpMinor" | "priceMinor" | "options"> {
  mrpRupees: string;
  priceRupees: string;
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
  mrpRupees: "100.00",
  priceRupees: "90.00",
  currency: "INR",
  rating: null,
  reviewCount: null,
  ratingSource: null,
  productUrl: "",
  affiliateUrl: null,
  status: "DRAFT",
  publishedAt: null,
  startsAt: null,
  expiresAt: null,
  featured: false,
  trending: false,
  options: [],
};

async function request<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(`/api/v1/admin/${path}`, {
    method,
    ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message ?? "Request failed.");
  return data;
}

export function DealManager({ role }: { role: AdminRole }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [categories, setCategories] = useState<Entry[]>([]);
  const [merchants, setMerchants] = useState<Entry[]>([]);
  const [form, setForm] = useState<AdminDealForm>(empty);
  const [selected, setSelected] = useState<Row | null>(null);
  const [preview, setPreview] = useState<{ data: Row; previewToken: string } | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(1);
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
  const [extractProgress, setExtractProgress] = useState("");
  const [detectedRetailer, setDetectedRetailer] = useState<string | null>(null);
  const [extractionResult, setExtractionResult] = useState<ClientExtractionResult | null>(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewCategory, setPreviewCategory] = useState<string>("");
  const [previewMerchant, setPreviewMerchant] = useState<string>("");
  const [publishingDirect, setPublishingDirect] = useState<boolean>(false);

  function detectRetailer(urlStr: string): string | null {
    if (!urlStr) return null;
    try {
      const lower = urlStr.toLowerCase();
      if (lower.includes("amazon.in") || lower.includes("amzn.to") || lower.includes("amzn.in")) return "Amazon India";
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

    setExtracting(true);
    setMessage("");
    setExtractProgress("Detecting retailer...");

    try {
      await new Promise((r) => setTimeout(r, 150));
      setExtractProgress("Checking supported extraction method...");
      await new Promise((r) => setTimeout(r, 200));
      setExtractProgress("Extracting product information...");

      const response = await request<{ data: ClientExtractionResult }>("product-extraction", "POST", {
        url: form.productUrl.trim(),
        importImage: true,
      });

      setExtractProgress("Product information retrieved.");
      setExtractionResult(response.data);
      setPreviewCategory(
        response.data.suggestedFormValues?.categoryId ||
        response.data.matchedTaxonomy?.categoryId ||
        form.categoryId ||
        ""
      );
      setPreviewMerchant(
        response.data.suggestedFormValues?.merchantId ||
        response.data.matchedTaxonomy?.merchantId ||
        form.merchantId ||
        ""
      );
      setShowPreviewModal(true);
      setMessage(
        response.data.status === "FULL_SUCCESS"
          ? "Product information retrieved successfully."
          : "Partial information retrieved. Please review the summary below."
      );
    } catch (err) {
      setExtractProgress("Extraction unavailable — manual entry required.");
      setMessage(err instanceof Error ? err.message : "Extraction failed. Manual entry required.");
    } finally {
      setExtracting(false);
    }
  }

  function applyExtractedData() {
    if (!extractionResult) return;
    const s = extractionResult.suggestedFormValues;

    setForm((prev) => ({
      ...prev,
      title: s?.title || extractionResult.data.identity.title.value || prev.title,
      slug: s?.slug || prev.slug,
      brand: s?.brand || extractionResult.data.identity.brand.value || prev.brand,
      description: s?.description || extractionResult.data.content.description.value || prev.description,
      productUrl: s?.productUrl || extractionResult.canonicalUrl || prev.productUrl,
      categoryId: previewCategory || s?.categoryId || prev.categoryId,
      merchantId: previewMerchant || s?.merchantId || prev.merchantId,
      mrpRupees: s?.mrpRupees || prev.mrpRupees,
      priceRupees: s?.priceRupees || prev.priceRupees,
      mediaId: s?.mediaId || prev.mediaId,
      rating: s?.rating !== undefined ? s.rating : prev.rating,
      reviewCount: s?.reviewCount !== undefined ? s.reviewCount : prev.reviewCount,
      ratingSource: s?.ratingSource !== undefined ? s.ratingSource : prev.ratingSource,
    }));

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

    const title = (s?.title || extractionResult.data.identity.title.value || form.title || "").trim();
    if (!title) {
      setMessage("Product title is required to publish.");
      return;
    }

    const categoryId = previewCategory || s?.categoryId || form.categoryId;
    if (!categoryId) {
      setMessage("Please select a Category from the dropdown in the preview table before publishing.");
      return;
    }

    let merchantId = previewMerchant || s?.merchantId || form.merchantId;
    if (!merchantId) {
      const matched = merchants.find((m) =>
        m.name.toLowerCase().includes(extractionResult.retailer.toLowerCase()) ||
        extractionResult.retailer.toLowerCase().includes(m.name.toLowerCase())
      );
      if (matched) {
        merchantId = matched.id;
      } else if (merchants.length > 0) {
        merchantId = merchants[0].id;
      } else {
        setMessage("Please select a Merchant before publishing.");
        return;
      }
    }

    const mrpStr = s?.mrpRupees || form.mrpRupees;
    const priceStr = s?.priceRupees || form.priceRupees;

    let mrpMinor: number;
    let priceMinor: number;
    try {
      mrpMinor = rupeesToPaise(mrpStr);
    } catch {
      setMessage("Valid MRP is required to publish. Please click 'Edit Details' to specify MRP.");
      return;
    }

    try {
      priceMinor = rupeesToPaise(priceStr);
    } catch {
      setMessage("Valid Deal Price is required to publish. Please click 'Edit Details' to specify Deal Price.");
      return;
    }

    if (priceMinor > mrpMinor) {
      setMessage("Deal price cannot exceed MRP.");
      return;
    }

    let mediaId = s?.mediaId || form.mediaId;
    if (!mediaId) {
      const categoryMatch = rows.find((r) => r.categoryId === categoryId && r.mediaId);
      const anyMatch = rows.find((r) => r.mediaId);
      if (categoryMatch) {
        mediaId = categoryMatch.mediaId;
      } else if (anyMatch) {
        mediaId = anyMatch.mediaId;
      }
    }

    if (!mediaId) {
      setMessage("Product image is required. Please click 'Edit Details' below to upload an image before publishing.");
      return;
    }

    const slug = s?.slug || form.slug || title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const description = s?.description || form.description || title;
    const productUrl = s?.productUrl || form.productUrl || extractionResult.canonicalUrl;

    const payload: DealInput = {
      slug,
      title,
      brand: s?.brand || extractionResult.data.identity.brand.value || form.brand || "",
      description,
      categoryId,
      merchantId,
      mediaId,
      mrpMinor,
      priceMinor,
      currency: "INR",
      rating: s?.rating ?? form.rating ?? null,
      reviewCount: s?.reviewCount ?? form.reviewCount ?? null,
      ratingSource: s?.ratingSource ?? form.ratingSource ?? null,
      productUrl,
      affiliateUrl: form.affiliateUrl || null,
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

  async function load(currentPage = page) {
    const [deals, cats, stores] = await Promise.all([
      request<{ data: Row[] }>(`deals?page=${currentPage}`),
      request<{ data: Entry[] }>("categories"),
      request<{ data: Entry[] }>("merchants"),
    ]);
    setRows(deals.data);
    setCategories(cats.data);
    setMerchants(stores.data);
  }

  useEffect(() => {
    let live = true;
    Promise.all([
      request<{ data: Row[] }>("deals"),
      request<{ data: Entry[] }>("categories"),
      request<{ data: Entry[] }>("merchants"),
    ])
      .then(([d, c, m]) => {
        if (live) {
          setRows(d.data);
          setCategories(c.data);
          setMerchants(m.data);
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

  function edit(row: Row) {
    const data: AdminDealForm = {
      slug: row.slug,
      title: row.title,
      brand: row.brand,
      description: row.description,
      categoryId: row.categoryId,
      merchantId: row.merchantId,
      mediaId: row.mediaId,
      mrpRupees: paiseToRupeeInputString(row.mrpMinor),
      priceRupees: paiseToRupeeInputString(row.priceMinor),
      currency: "INR",
      rating: row.rating,
      reviewCount: row.reviewCount,
      ratingSource: row.ratingSource,
      productUrl: row.productUrl,
      affiliateUrl: row.affiliateUrl,
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
    setDetectedRetailer(detectRetailer(row.productUrl));
    setShowPreviewModal(false);
    setSelected(row);
    setPreview(null);
  }

  function field<K extends keyof AdminDealForm>(key: K, value: AdminDealForm[K]) {
    setForm((old) => ({ ...old, [key]: value }));
    setPreview(null);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
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

      const payload: DealInput = {
        slug: form.slug,
        title: form.title,
        brand: form.brand,
        description: form.description,
        categoryId: form.categoryId,
        merchantId: form.merchantId,
        mediaId: form.mediaId,
        mrpMinor,
        priceMinor,
        currency: "INR",
        rating: form.rating,
        reviewCount: form.reviewCount,
        ratingSource: form.ratingSource,
        productUrl: form.productUrl,
        affiliateUrl: form.affiliateUrl,
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
      edit(result.data);
      await load();
      setMessage("Saved. Preview this saved version before publishing.");
    });
  }

  return (
    <main className={styles.page}>
      <nav className={styles.actions}>
        <Link href="/">MetaDeals4U</Link>
        <Link href="/admin">Account administration</Link>
        <Link href="/admin/deals">Deals</Link>
        <Link href="/admin/scraper">Deal Scraper</Link>
      </nav>
      <h1>Deal management</h1>
      <p>
        Create real offers from verified source information. Prices below are entered in Indian Rupees (₹) and safely converted to paise.
      </p>
      {message && (
        <p role="status" className={styles.notice}>
          {message}
        </p>
      )}
      <section className={styles.panel}>
        <h2>Catalog</h2>
        {roleCan(role, "category:manage") && (
          <form
            className={styles.grid}
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                await request(
                  `${taxonomy.kind}${taxonomy.id ? `/${taxonomy.id}` : ""}`,
                  taxonomy.id ? "PUT" : "POST",
                  {
                    name: taxonomy.name,
                    slug: taxonomy.slug,
                    ...(taxonomy.kind === "categories"
                      ? { parentId: taxonomy.parentId || null }
                      : { websiteUrl: taxonomy.websiteUrl }),
                  }
                );
                await load();
                setTaxonomy({ ...taxonomy, id: "", name: "", slug: "" });
                setMessage("Catalog saved.");
              });
            }}
          >
            <label>
              Type
              <select
                value={taxonomy.kind}
                onChange={(e) => setTaxonomy({ ...taxonomy, kind: e.target.value, id: "" })}
              >
                <option value="categories">Category</option>
                <option value="merchants">Merchant</option>
              </select>
            </label>
            <label>
              Edit existing
              <select
                value={taxonomy.id}
                onChange={(e) => {
                  const item = (taxonomy.kind === "categories" ? categories : merchants).find(
                    (x) => x.id === e.target.value
                  );
                  setTaxonomy({
                    ...taxonomy,
                    id: item?.id ?? "",
                    name: item?.name ?? "",
                    slug: item?.slug ?? "",
                    parentId: item?.parentId ?? "",
                    websiteUrl: item?.websiteUrl ?? "",
                  });
                }}
              >
                <option value="">Create new</option>
                {(taxonomy.kind === "categories" ? categories : merchants).map((x) => (
                  <option value={x.id} key={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Name
              <input
                required
                value={taxonomy.name}
                onChange={(e) => setTaxonomy({ ...taxonomy, name: e.target.value })}
              />
            </label>
            <label>
              Slug
              <input
                required
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
                value={taxonomy.slug}
                onChange={(e) => setTaxonomy({ ...taxonomy, slug: e.target.value })}
              />
            </label>
            {taxonomy.kind === "categories" ? (
              <label>
                Parent
                <select
                  value={taxonomy.parentId}
                  onChange={(e) => setTaxonomy({ ...taxonomy, parentId: e.target.value })}
                >
                  <option value="">Top level</option>
                  {categories.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <label>
                Website HTTPS URL
                <input
                  type="url"
                  required
                  value={taxonomy.websiteUrl}
                  onChange={(e) => setTaxonomy({ ...taxonomy, websiteUrl: e.target.value })}
                />
              </label>
            )}
            <button disabled={busy}>Save catalog entry</button>
          </form>
        )}
      </section>
      <section className={styles.panel}>
        <h2>{selected ? "Edit deal" : "New deal"}</h2>
        <p>Saving an edit withdraws a published deal until it is previewed and published again.</p>
        <form onSubmit={save}>
          <fieldset disabled={busy || selected?.status === "ARCHIVED"} className={styles.grid}>
            <div className={styles.scrapeContainer}>
              <div className={styles.scrapeInputRow}>
                <label>
                  Original product URL (HTTPS only, clean product page)
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
                  {extracting ? "Scraping..." : "Scrape"}
                </button>
              </div>
              {extractProgress && (
                <div className={styles.extractStatus}>{extractProgress}</div>
              )}
            </div>

            {showPreviewModal && extractionResult && (
              <div className={styles.previewModal}>
                <div className={styles.previewHeader}>
                  <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
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

                <table className={styles.previewTable}>
                  <thead>
                    <tr>
                      <th>Field</th>
                      <th>Extracted Value</th>
                      <th>Source & Confidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>Merchant</td>
                      <td>
                        <select
                          value={previewMerchant}
                          onChange={(e) => setPreviewMerchant(e.target.value)}
                          className={styles.inlineSelect}
                          aria-label="Select Merchant"
                        >
                          <option value="">-- Select Merchant --</option>
                          {merchants.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <span className={previewMerchant ? styles.badgeRetrieved : styles.badgeMissing}>
                          {previewMerchant ? "Matched" : "Missing"}
                        </span>
                      </td>
                    </tr>
                    <tr>
                      <td>Product title</td>
                      <td>{extractionResult.data.identity.title.value || "(Not available)"}</td>
                      <td>
                        <span
                          className={
                            extractionResult.data.identity.title.value
                              ? styles.badgeRetrieved
                              : styles.badgeMissing
                          }
                        >
                          {extractionResult.data.identity.title.source} · {extractionResult.data.identity.title.confidence}
                        </span>
                      </td>
                    </tr>
                    <tr>
                      <td>Brand</td>
                      <td>{extractionResult.data.identity.brand.value || "(Not available)"}</td>
                      <td>
                        <span
                          className={
                            extractionResult.data.identity.brand.value
                              ? styles.badgeRetrieved
                              : styles.badgeMissing
                          }
                        >
                          {extractionResult.data.identity.brand.source} · {extractionResult.data.identity.brand.confidence}
                        </span>
                      </td>
                    </tr>
                    <tr>
                      <td>Description</td>
                      <td>
                        {extractionResult.data.content.description.value
                          ? extractionResult.data.content.description.value.slice(0, 100) + "..."
                          : "(Not available)"}
                      </td>
                      <td>
                        <span
                          className={
                            extractionResult.data.content.description.value
                              ? styles.badgeRetrieved
                              : styles.badgeMissing
                          }
                        >
                          {extractionResult.data.content.description.source} · {extractionResult.data.content.description.confidence}
                        </span>
                      </td>
                    </tr>
                    <tr>
                      <td>Category</td>
                      <td>
                        <select
                          value={previewCategory}
                          onChange={(e) => setPreviewCategory(e.target.value)}
                          className={styles.inlineSelect}
                          aria-label="Select Category"
                        >
                          <option value="">-- Select Category --</option>
                          {categories.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <span
                          className={
                            previewCategory
                              ? styles.badgeSuggested
                              : styles.badgeMissing
                          }
                        >
                          {previewCategory ? "Selected" : "Missing"}
                        </span>
                      </td>
                    </tr>
                    <tr>
                      <td>MRP</td>
                      <td>
                        {extractionResult.suggestedFormValues?.mrpRupees
                          ? `₹${extractionResult.suggestedFormValues.mrpRupees}`
                          : "(Manual entry required)"}
                      </td>
                      <td>
                        <span
                          className={
                            extractionResult.suggestedFormValues?.mrpRupees
                              ? styles.badgeRetrieved
                              : styles.badgeRestricted
                          }
                        >
                          {extractionResult.data.pricing.mrpMinor.source} · {extractionResult.data.pricing.mrpMinor.confidence}
                        </span>
                      </td>
                    </tr>
                    <tr>
                      <td>Selling price</td>
                      <td>
                        {extractionResult.suggestedFormValues?.priceRupees
                          ? `₹${extractionResult.suggestedFormValues.priceRupees}`
                          : "(Manual entry required)"}
                      </td>
                      <td>
                        <span
                          className={
                            extractionResult.suggestedFormValues?.priceRupees
                              ? styles.badgeRetrieved
                              : styles.badgeRestricted
                          }
                        >
                          {extractionResult.data.pricing.priceMinor.source} · {extractionResult.data.pricing.priceMinor.confidence}
                        </span>
                      </td>
                    </tr>
                    {extractionResult.suggestedFormValues?.mrpRupees && extractionResult.suggestedFormValues?.priceRupees && (
                      <tr>
                        <td>Discount</td>
                        <td>
                          {Math.round(((parseFloat(extractionResult.suggestedFormValues.mrpRupees) - parseFloat(extractionResult.suggestedFormValues.priceRupees)) / parseFloat(extractionResult.suggestedFormValues.mrpRupees)) * 100)}% OFF
                        </td>
                        <td>
                          <span className={styles.badgeRetrieved}>Calculated</span>
                        </td>
                      </tr>
                    )}
                    <tr>
                      <td>Product image</td>
                      <td>
                        {extractionResult.suggestedFormValues?.mediaId ? (
                          <span>Imported (ID: {extractionResult.suggestedFormValues.mediaId.slice(0, 12)}...)</span>
                        ) : extractionResult.data.media.primaryImageUrl.value ? (
                          <span>Remote URL: {extractionResult.data.media.primaryImageUrl.value.slice(0, 40)}...</span>
                        ) : (
                          <span>(Upload manually)</span>
                        )}
                      </td>
                      <td>
                        <span
                          className={
                            extractionResult.suggestedFormValues?.mediaId || extractionResult.data.media.primaryImageUrl.value
                              ? styles.badgeRetrieved
                              : styles.badgeMissing
                          }
                        >
                          {extractionResult.data.media.primaryImageUrl.source} · {extractionResult.data.media.primaryImageUrl.confidence}
                        </span>
                      </td>
                    </tr>
                    <tr>
                      <td>Rating / Reviews</td>
                      <td>
                        {extractionResult.data.ratings.rating.value !== null
                          ? `★ ${extractionResult.data.ratings.rating.value} (${
                              extractionResult.data.ratings.reviewCount.value ?? 0
                            } reviews)`
                          : "(Not available)"}
                      </td>
                      <td>
                        <span
                          className={
                            extractionResult.data.ratings.rating.value !== null
                              ? styles.badgeRetrieved
                              : styles.badgeMissing
                          }
                        >
                          {extractionResult.data.ratings.rating.source} · {extractionResult.data.ratings.rating.confidence}
                        </span>
                      </td>
                    </tr>
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
              </div>
            )}

            <label>
              Product title
              <input
                id="product-title-input"
                required
                type="text"
                value={form.title}
                onChange={(e) => field("title", e.target.value)}
              />
            </label>
            <label>
              Stable slug
              <input
                required
                type="text"
                value={form.slug}
                onChange={(e) => field("slug", e.target.value)}
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
            <label>
              Description
              <input
                required
                type="text"
                value={form.description}
                onChange={(e) => field("description", e.target.value)}
              />
            </label>
            <label>
              Category
              <select required value={form.categoryId} onChange={(e) => field("categoryId", e.target.value)}>
                <option value="">Select category</option>
                {categories.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Primary merchant
              <select required value={form.merchantId} onChange={(e) => field("merchantId", e.target.value)}>
                <option value="">Select merchant</option>
                {merchants.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
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
            {roleCan(role, "affiliate:manage") && (
              <label>
                Manual affiliate URL (optional)
                <input
                  type="url"
                  value={form.affiliateUrl ?? ""}
                  onChange={(e) => field("affiliateUrl", e.target.value || null)}
                />
              </label>
            )}
            <label>
              Image upload (JPEG/PNG/WebP, 5 MB)
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  void run(async () => {
                    const response = await fetch(
                      `/api/v1/admin/media?alt=${encodeURIComponent(form.title || "Product image")}`,
                      { method: "POST", headers: { "Content-Type": file.type }, body: file }
                    );
                    const result = await response.json();
                    if (!response.ok) throw new Error(result.error?.message ?? "Upload failed");
                    field("mediaId", result.data.id);
                  });
                }}
              />
            </label>
            <label>
              Uploaded media ID
              <input required value={form.mediaId} onChange={(e) => field("mediaId", e.target.value)} />
            </label>
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
            <label>
              <input
                type="checkbox"
                checked={form.featured}
                onChange={(e) => field("featured", e.target.checked)}
              />{" "}
              Featured
            </label>
            <label>
              <input
                type="checkbox"
                checked={form.trending}
                onChange={(e) => field("trending", e.target.checked)}
              />{" "}
              Trending
            </label>
            <div className={styles.wide}>
              <h3>Additional purchase options</h3>
              {form.options.map((option, index) => (
                <div className={styles.grid} key={index}>
                  <label>
                    Merchant
                    <select
                      value={option.merchantId}
                      onChange={(e) =>
                        field(
                          "options",
                          form.options.map((o, i) =>
                            i === index ? { ...o, merchantId: e.target.value } : o
                          )
                        )
                      }
                    >
                      <option value="">Select</option>
                      {merchants.map((x) => (
                        <option value={x.id} key={x.id}>
                          {x.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Option price (₹)
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      required
                      placeholder="e.g. 1499.00"
                      value={option.priceRupees}
                      onChange={(e) =>
                        field(
                          "options",
                          form.options.map((o, i) =>
                            i === index ? { ...o, priceRupees: e.target.value } : o
                          )
                        )
                      }
                    />
                  </label>
                  <label>
                    Product URL
                    <input
                      type="url"
                      required
                      value={option.productUrl}
                      onChange={(e) =>
                        field(
                          "options",
                          form.options.map((o, i) =>
                            i === index ? { ...o, productUrl: e.target.value } : o
                          )
                        )
                      }
                    />
                  </label>
                  {roleCan(role, "affiliate:manage") && (
                    <label>
                      Affiliate URL (optional)
                      <input
                        type="url"
                        value={option.affiliateUrl ?? ""}
                        onChange={(e) =>
                          field(
                            "options",
                            form.options.map((o, i) =>
                              i === index ? { ...o, affiliateUrl: e.target.value || null } : o
                            )
                          )
                        }
                      />
                    </label>
                  )}
                  <button
                    type="button"
                    onClick={() => field("options", form.options.filter((_, i) => i !== index))}
                  >
                    Remove option
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() =>
                  field("options", [
                    ...form.options,
                    { merchantId: "", priceRupees: form.priceRupees, productUrl: "", affiliateUrl: null },
                  ])
                }
              >
                Add purchase option
              </button>
            </div>
            <button type="submit">Save draft / review</button>
            <button
              type="button"
              onClick={() => {
                setSelected(null);
                setForm(empty);
                setPreview(null);
                setDetectedRetailer(null);
                setShowPreviewModal(false);
                setExtractionResult(null);
                setExtractProgress("");
              }}
            >
              New deal
            </button>
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
            {roleCan(role, "deal:archive") && (
              <>
                <button
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      const result = await request<{ data: Row }>(
                        `deals/${selected.id}/archive`,
                        "POST",
                        { version: selected.version }
                      );
                      setSelected(result.data);
                      setPreview(null);
                      await load();
                    })
                  }
                >
                  Archive
                </button>
                {!selected.everPublished && selected.status === "DRAFT" && (
                  <button
                    disabled={busy}
                    onClick={() => {
                      if (window.confirm("Delete this never-published draft?")) {
                        void run(async () => {
                          await request(`deals/${selected.id}`, "DELETE", { version: selected.version });
                          setSelected(null);
                          setForm(empty);
                          await load();
                        });
                      }
                    }}
                  >
                    Delete draft
                  </button>
                )}
              </>
            )}
          </div>
        )}
        {preview && (
          <article className={styles.preview}>
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
      <section className={styles.panel}>
        <h2>Bulk draft import</h2>
        <p>
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
          <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{importPreview}</pre>
        )}
      </section>
      <section className={styles.panel}>
        <h2>Deals · page {page}</h2>
        {!rows.length && (
          <p>No deals yet. Add a category, merchant and product image to create the first draft.</p>
        )}
        <div className={styles.list}>
          {rows.map((row) => (
            <button key={row.id} onClick={() => edit(row)}>
              <strong>{row.title}</strong>
              <span>
                {row.status} · {formatPaise(row.priceMinor)}
                {row.expiresAt ? " · expiry " + row.expiresAt : ""}
              </span>
            </button>
          ))}
        </div>
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
    </main>
  );
}
