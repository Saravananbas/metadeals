"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { AdminNav } from "@/components/admin/AdminNav";
import styles from "./merchant-directory.module.css";
import { MERCHANT_DIRECTORY_CATEGORIES } from "@/features/merchants/types";

interface MerchantDirectoryItem {
  id: string;
  merchantCode?: string | null;
  name: string;
  websiteUrl: string;
  domain: string;
  category: string;
  productFocus?: string | null;
  businessModel?: string | null;
  description?: string | null;
  country: string;
  status: "ACTIVE" | "INACTIVE" | "UNDER_REVIEW";
  verificationStatus: "VERIFIED" | "UNVERIFIED" | "NEEDS_REVIEW";
  logoMediaId?: string | null;
  logoUrl?: string | null;
  source: string;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Stats {
  total: number;
  active: number;
  inactive: number;
  underReview: number;
  verified: number;
  unverified: number;
  needsReview: number;
}

type MerchantWebsiteForm = Omit<MerchantDirectoryItem, "id" | "merchantCode" | "domain" | "source" | "createdAt" | "updatedAt">;

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function MerchantWebsiteDirectoryManager() {
  const [items, setItems] = useState<MerchantDirectoryItem[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [limit] = useState(25);

  const [search, setSearch] = useState("");
  const [submittedSearch, setSubmittedSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("ALL");
  const [selectedStatus, setSelectedStatus] = useState("ALL");
  const [selectedVerification, setSelectedVerification] = useState("ALL");

  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MerchantDirectoryItem | null>(null);
  const [formData, setFormData] = useState<MerchantWebsiteForm>({
    name: "",
    websiteUrl: "",
    category: "UNCLASSIFIED",
    productFocus: "",
    businessModel: "",
    description: "",
    country: "India",
    status: "ACTIVE",
    verificationStatus: "UNVERIFIED",
    logoMediaId: "",
    logoUrl: "",
    notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingRowLogoId, setUploadingRowLogoId] = useState<string | null>(null);
  const loadRequestRef = useRef<{ key: string; promise: Promise<void> } | null>(null);
  const loadSequenceRef = useRef(0);

  const loadData = useCallback(async (showLoading = true) => {
    const params = new URLSearchParams();
    params.set("page", page.toString());
    params.set("limit", limit.toString());
    if (submittedSearch) params.set("search", submittedSearch);
    if (selectedCategory !== "ALL") params.set("category", selectedCategory);
    if (selectedStatus !== "ALL") params.set("status", selectedStatus);
    if (selectedVerification !== "ALL") params.set("verificationStatus", selectedVerification);

    const query = params.toString();
    const requestKey = `/api/v1/admin/merchant-websites?${query}`;
    const inFlight = loadRequestRef.current;
    if (!showLoading && inFlight?.key === requestKey) return inFlight.promise;

    const requestSequence = ++loadSequenceRef.current;
    if (showLoading) {
      setLoading(true);
      setError(null);
    }
    const request = (async () => {
      try {
        const res = await fetch(requestKey);
        if (!res.ok) {
          const errJson = await res.json().catch(() => ({}));
          throw new Error(errJson.error?.message || "Failed to load merchant websites");
        }
        const data = await res.json();
        if (requestSequence === loadSequenceRef.current) {
          setItems(data.items || []);
          setTotal(data.total || 0);
          setTotalPages(data.totalPages || 1);
          if (data.stats) setStats(data.stats);
        }
      } catch (err: unknown) {
        if (requestSequence === loadSequenceRef.current) {
          setError(errorMessage(err, "Failed to load directory"));
        }
      } finally {
        if (requestSequence === loadSequenceRef.current) setLoading(false);
      }
    })();
    loadRequestRef.current = { key: requestKey, promise: request };
    try {
      await request;
    } finally {
      if (loadRequestRef.current?.promise === request) loadRequestRef.current = null;
    }
  }, [limit, page, selectedCategory, selectedStatus, selectedVerification, submittedSearch]);

  useEffect(() => {
    let isCurrent = true;
    void Promise.resolve().then(() => {
      if (isCurrent) void loadData(false);
    });
    return () => {
      isCurrent = false;
    };
  }, [loadData]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPage(1);
      setSubmittedSearch(search.trim());
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    const nextSearch = search.trim();
    if (page === 1 && nextSearch === submittedSearch) void loadData();
    else setSubmittedSearch(nextSearch);
  }

  async function handleExport() {
    setExporting(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: "1", limit: "100", sortBy: "name", sortOrder: "asc" });
      if (submittedSearch) params.set("search", submittedSearch);
      if (selectedCategory !== "ALL") params.set("category", selectedCategory);
      if (selectedStatus !== "ALL") params.set("status", selectedStatus);
      if (selectedVerification !== "ALL") params.set("verificationStatus", selectedVerification);

      const allItems: MerchantDirectoryItem[] = [];
      let totalPagesToFetch = 1;
      for (let currentPage = 1; currentPage <= totalPagesToFetch; currentPage += 1) {
        params.set("page", String(currentPage));
        const response = await fetch(`/api/v1/admin/merchant-websites?${params.toString()}`);
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error?.message || "Could not export the merchant directory.");
        allItems.push(...(result.items || []));
        totalPagesToFetch = Math.max(1, Number(result.totalPages) || 1);
      }

      const columns: Array<[string, (item: MerchantDirectoryItem) => string]> = [
        ["Merchant Name", (item) => item.name],
        ["Website URL", (item) => item.websiteUrl],
        ["Domain", (item) => item.domain],
        ["Category", (item) => item.category],
        ["Product Focus", (item) => item.productFocus || ""],
        ["Status", (item) => item.status],
        ["Verification", (item) => item.verificationStatus],
        ["Logo URL", (item) => item.logoUrl || ""],
        ["Created At", (item) => item.createdAt],
        ["Updated At", (item) => item.updatedAt],
      ];
      const csvCell = (value: string) => {
        const safeValue = /^[\s]*[=+@\-]/.test(value) ? `'${value}` : value;
        return `"${safeValue.replace(/"/g, '""')}"`;
      };
      const csv = [
        columns.map(([label]) => csvCell(label)).join(","),
        ...allItems.map((item) => columns.map(([, getValue]) => csvCell(getValue(item))).join(",")),
      ].join("\r\n");
      const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
      const downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = `merchant-directory-${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(downloadUrl);
      setSuccess(`Exported ${allItems.length} merchant websites. Open the CSV file in Excel.`);
    } catch (err) {
      setError(errorMessage(err, "Failed to export the merchant directory."));
    } finally {
      setExporting(false);
    }
  }

  function handleOpenCreate() {
    setEditingItem(null);
    setFormData({
      name: "",
      websiteUrl: "",
      category: "UNCLASSIFIED",
      productFocus: "",
      businessModel: "",
      description: "",
      country: "India",
      status: "ACTIVE",
      verificationStatus: "UNVERIFIED",
      logoMediaId: "",
      logoUrl: "",
      notes: "",
    });
    setIsModalOpen(true);
  }

  function handleOpenEdit(item: MerchantDirectoryItem) {
    setEditingItem(item);
    setFormData({
      name: item.name,
      websiteUrl: item.websiteUrl,
      category: item.category,
      productFocus: item.productFocus || "",
      businessModel: item.businessModel || "",
      description: item.description || "",
      country: item.country || "India",
      status: item.status,
      verificationStatus: item.verificationStatus,
      logoMediaId: item.logoMediaId || "",
      logoUrl: item.logoUrl || "",
      notes: item.notes || "",
    });
    setIsModalOpen(true);
  }

  async function handleLogoUpload(file: File) {
    try {
      setUploadingLogo(true);
      setError(null);
      const res = await fetch("/api/v1/admin/media/upload", {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error?.message || "Failed to upload logo.");
      }
      const data = await res.json();
      if (data.data?.id) {
        setFormData((prev) => ({
          ...prev,
          logoMediaId: data.data.id,
          logoUrl: data.data.url,
        }));
      }
    } catch (err: unknown) {
      setError(errorMessage(err, "Logo upload failed"));
    } finally {
      setUploadingLogo(false);
    }
  }

  async function handleRowLogoUpload(item: MerchantDirectoryItem, file: File) {
    setUploadingRowLogoId(item.id);
    setError(null);
    try {
      const res = await fetch(`/api/v1/admin/media?alt=${encodeURIComponent(item.name || "Merchant Logo")}`, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error?.message || "Failed to upload logo.");
      }
      const data = await res.json();
      if (data.data?.id) {
        // Update directory item with new logo
        const updateRes = await fetch(`/api/v1/admin/merchant-websites/${item.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            logoMediaId: data.data.id,
            logoUrl: data.data.url,
          }),
        });
        if (!updateRes.ok) {
          throw new Error("Failed to link uploaded logo to merchant.");
        }
        setItems((prev) =>
          prev.map((i) =>
            i.id === item.id ? { ...i, logoMediaId: data.data.id, logoUrl: data.data.url } : i
          )
        );
        setSuccess(`✅ Logo uploaded and saved for "${item.name}".`);
      }
    } catch (err: unknown) {
      setError(errorMessage(err, "Logo upload failed"));
    } finally {
      setUploadingRowLogoId(null);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const url = editingItem
        ? `/api/v1/admin/merchant-websites/${editingItem.id}`
        : `/api/v1/admin/merchant-websites`;
      const method = editingItem ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const resData = await res.json();
      if (!res.ok) {
        throw new Error(resData.error?.message || "Operation failed.");
      }

      setSuccess(editingItem ? `Updated "${formData.name}" successfully.` : `Added "${formData.name}" successfully.`);
      setIsModalOpen(false);
      loadData();
    } catch (err: unknown) {
      setError(errorMessage(err, "Failed to save merchant"));
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteMerchant(item: MerchantDirectoryItem) {
    if (!window.confirm(`Are you sure you want to permanently delete "${item.name}" from the merchant directory?`)) {
      return;
    }
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/v1/admin/merchant-websites/${item.id}?permanent=true`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error?.message || "Failed to delete merchant.");
      }
      setSuccess(`🗑️ "${item.name}" has been deleted successfully.`);
      loadData();
    } catch (err: unknown) {
      setError(errorMessage(err, "Failed to delete merchant"));
    }
  }

  async function handleToggleStatus(item: MerchantDirectoryItem) {
    const newStatus = item.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    const confirmMsg = item.status === "ACTIVE"
      ? `Are you sure you want to deactivate ${item.name}? It will be marked INACTIVE.`
      : `Activate ${item.name}?`;
    if (!window.confirm(confirmMsg)) return;

    // Optimistic UI update
    setItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, status: newStatus } : i))
    );
    setStats((prev) =>
      prev
        ? {
            ...prev,
            active: newStatus === "ACTIVE" ? prev.active + 1 : Math.max(0, prev.active - 1),
            inactive: newStatus === "INACTIVE" ? prev.inactive + 1 : Math.max(0, prev.inactive - 1),
          }
        : null
    );

    try {
      const res = await fetch(`/api/v1/admin/merchant-websites/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error?.message || "Failed to change status.");
      }
      setSuccess(`${item.name} status updated to ${newStatus}.`);
    } catch (err: unknown) {
      setError(errorMessage(err, "Failed to change merchant status"));
      loadData(); // Revert on error
    }
  }

  async function handleQuickVerify(item: MerchantDirectoryItem) {
    const nextStatus = item.verificationStatus === "VERIFIED" ? "UNVERIFIED" : "VERIFIED";

    // Optimistic UI update: instantly update button state without waiting for re-fetch
    setItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, verificationStatus: nextStatus } : i))
    );
    setStats((prev) =>
      prev
        ? {
            ...prev,
            verified: nextStatus === "VERIFIED" ? prev.verified + 1 : Math.max(0, prev.verified - 1),
            unverified: nextStatus === "UNVERIFIED" ? prev.unverified + 1 : Math.max(0, prev.unverified - 1),
          }
        : null
    );

    try {
      const res = await fetch(`/api/v1/admin/merchant-websites/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verificationStatus: nextStatus }),
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error?.message || "Failed to update verification.");
      }
      setSuccess(`Marked "${item.name}" as ${nextStatus}.`);
    } catch (err: unknown) {
      setError(errorMessage(err, "Failed to update verification status"));
      loadData(); // Revert on failure
    }
  }

  return (
    <div className={styles.container}>
      <AdminNav active="merchants" />

      <div className={styles.header}>
        <div>
          <h1 className={styles.headerTitle}>Merchant Website Directory</h1>
          <p className={styles.headerSubtitle}>
            Curated repository of {total} merchant domains for MetaDeals4U deal aggregation, coupon tracking and extraction.
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button className={styles.secondaryButton} onClick={() => void handleExport()} disabled={exporting}>
            {exporting ? "Preparing export…" : "Export Excel (CSV)"}
          </button>
          <button className={styles.primaryButton} onClick={handleOpenCreate}>
            ➕ Add Merchant Website
          </button>
        </div>
      </div>

      {success && <div className={styles.alertSuccess}>{success}</div>}
      {error && <div className={styles.alertError}>{error}</div>}

      {/* Stats Summary Cards */}
      {stats && (
        <div className={styles.statsGrid}>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>Total Websites</div>
            <div className={styles.statValue}>{stats.total}</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>Active</div>
            <div className={styles.statValue} style={{ color: "var(--md-green-700)" }}>
              {stats.active}
            </div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>Inactive</div>
            <div className={styles.statValue} style={{ color: "var(--md-color-danger)" }}>
              {stats.inactive}
            </div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>Verified</div>
            <div className={styles.statValue} style={{ color: "var(--md-blue-600)" }}>
              {stats.verified}
            </div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>Needs Review</div>
            <div className={styles.statValue} style={{ color: "var(--md-color-warning)" }}>
              {stats.needsReview}
            </div>
          </div>
        </div>
      )}

      {/* Search & Filter Bar */}
      <div className={styles.filterBar}>
        <form onSubmit={handleSearchSubmit} style={{ display: "flex", flex: 1, gap: "0.5rem" }}>
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Search by merchant name, domain, or focus..."
            aria-label="Search merchant websites"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </form>

        <select
          className={styles.selectInput}
          value={selectedCategory}
          onChange={(e) => {
            setSelectedCategory(e.target.value);
            setPage(1);
          }}
        >
          <option value="ALL">All Categories</option>
          {MERCHANT_DIRECTORY_CATEGORIES.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>

        <select
          className={styles.selectInput}
          value={selectedStatus}
          onChange={(e) => {
            setSelectedStatus(e.target.value);
            setPage(1);
          }}
        >
          <option value="ALL">All Statuses</option>
          <option value="ACTIVE">ACTIVE</option>
          <option value="INACTIVE">INACTIVE</option>
          <option value="UNDER_REVIEW">UNDER_REVIEW</option>
        </select>

        <select
          className={styles.selectInput}
          value={selectedVerification}
          onChange={(e) => {
            setSelectedVerification(e.target.value);
            setPage(1);
          }}
        >
          <option value="ALL">All Verifications</option>
          <option value="VERIFIED">VERIFIED</option>
          <option value="UNVERIFIED">UNVERIFIED</option>
          <option value="NEEDS_REVIEW">NEEDS_REVIEW</option>
        </select>
      </div>

      {/* Table Listing */}
      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.th} style={{ width: "100px", minWidth: "90px" }}>
                Logo
              </th>
              <th className={styles.th}>Merchant Name</th>
              <th className={styles.th}>Website / Domain</th>
              <th className={styles.th}>Category</th>
              <th className={styles.th}>Status</th>
              <th className={styles.th} style={{ textAlign: "right", paddingRight: "1.5rem" }}>
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className={styles.td} style={{ textAlign: "center", padding: "2rem" }}>
                  Loading merchant websites...
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={6} className={styles.td} style={{ textAlign: "center", padding: "2rem" }}>
                  No merchant websites found matching your filters.
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.id} className={styles.tr}>
                  {/* Separate Logo Column with generous space */}
                  <td className={styles.td} style={{ width: "110px", minWidth: "100px" }}>
                    {item.logoUrl ? (
                      <div
                        style={{
                          width: "72px",
                          height: "72px",
                          flexShrink: 0,
                          borderRadius: "10px",
                          border: "1px solid var(--md-color-border)",
                          background: "var(--md-white)",
                          padding: "6px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          boxShadow: "0 1px 3px color-mix(in srgb, var(--md-black) 5%, transparent)",
                        }}
                      >
                        <Image
                          src={item.logoUrl}
                          alt={item.name}
                          width={60}
                          height={60}
                          unoptimized
                          style={{
                            maxWidth: "100%",
                            maxHeight: "100%",
                            objectFit: "contain",
                          }}
                        />
                      </div>
                    ) : (
                      <div
                        style={{
                          width: "72px",
                          height: "72px",
                          flexShrink: 0,
                          borderRadius: "10px",
                          background: "var(--md-color-surface-muted)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: "1.75rem",
                          color: "var(--md-color-text-muted)",
                          border: "1.5px dashed var(--md-color-border-strong)",
                          boxShadow: "inset 0 1px 2px color-mix(in srgb, var(--md-black) 2%, transparent)",
                        }}
                        title="No logo uploaded"
                      >
                        🏪
                      </div>
                    )}
                  </td>

                  {/* Merchant Name Column */}
                  <td className={styles.td} style={{ fontWeight: 600 }}>
                    <div>
                      <span style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--md-neutral-900)" }}>{item.name}</span>
                      {item.merchantCode && (
                        <div style={{ fontSize: "0.75rem", color: "var(--md-color-text-muted)", marginTop: "2px" }}>
                          {item.merchantCode}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className={styles.td}>
                    <div>
                      <a
                        href={item.websiteUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.domainBadge}
                      >
                        {item.domain} ↗
                      </a>
                    </div>
                  </td>
                  <td className={styles.td}>
                    <span className={styles.categoryBadge}>{item.category}</span>
                  </td>
                  <td className={styles.td}>
                    <span
                      className={
                        item.status === "ACTIVE"
                          ? styles.badgeActive
                          : item.status === "INACTIVE"
                          ? styles.badgeInactive
                          : styles.badgeUnderReview
                      }
                    >
                      {item.status}
                    </span>
                  </td>
                  <td className={styles.td} style={{ textAlign: "right", paddingRight: "1.5rem" }}>
                    <div className={styles.actionButtonGroup} style={{ justifyContent: "flex-end", gap: "0.45rem", alignItems: "center" }}>
                      {/* 1. Quick Logo Upload button in Action column */}
                      <label
                        style={{
                          height: "32px",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                          padding: "0 10px",
                          borderRadius: "0.375rem",
                          fontSize: "0.78rem",
                          fontWeight: 600,
                          cursor: uploadingRowLogoId === item.id ? "wait" : "pointer",
                          color: "var(--md-color-primary)",
                          background: "var(--md-color-primary-subtle)",
                          border: "1px solid var(--md-color-primary-soft)",
                          boxShadow: "0 1px 2px color-mix(in srgb, var(--md-purple-500) 5%, transparent)",
                          transition: "all 0.15s ease",
                          whiteSpace: "nowrap",
                        }}
                        title="Upload logo (JPG, PNG, GIF, SVG, TIFF, WebP, AVIF)"
                      >
                        <span>{uploadingRowLogoId === item.id ? "⏳ Uploading..." : "📷 Upload Logo"}</span>
                        <input
                          type="file"
                          accept=".jpg,.jpeg,.png,.gif,.svg,.tiff,.tif,.webp,.avif,image/jpeg,image/png,image/gif,image/svg+xml,image/tiff,image/webp,image/avif"
                          style={{ display: "none" }}
                          disabled={uploadingRowLogoId === item.id}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleRowLogoUpload(item, file);
                          }}
                        />
                      </label>

                      {/* 2. Verification toggle: ✓ for Verified, ⚠ for Needs Review / Unverified */}
                      <button
                        className={styles.editButton}
                        onClick={() => handleQuickVerify(item)}
                        style={{
                          width: "34px",
                          height: "32px",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: "1rem",
                          fontWeight: 700,
                          padding: 0,
                          borderRadius: "0.375rem",
                          color: item.verificationStatus === "VERIFIED" ? "var(--md-green-700)" : item.verificationStatus === "NEEDS_REVIEW" ? "var(--md-amber-700)" : "var(--md-color-warning)",
                          borderColor: item.verificationStatus === "VERIFIED" ? "var(--md-color-success-border)" : item.verificationStatus === "NEEDS_REVIEW" ? "var(--md-color-warning-border)" : "var(--md-orange-200)",
                          background: item.verificationStatus === "VERIFIED" ? "var(--md-color-success-bg)" : item.verificationStatus === "NEEDS_REVIEW" ? "var(--md-color-warning-bg)" : "var(--md-amber-50)",
                        }}
                        title={
                          item.verificationStatus === "VERIFIED"
                            ? "Verified (Click to toggle)"
                            : item.verificationStatus === "NEEDS_REVIEW"
                            ? "Needs Review (Click to verify)"
                            : "Unverified (Click to verify)"
                        }
                      >
                        {item.verificationStatus === "VERIFIED" ? "✓" : "⚠"}
                      </button>

                      {/* 3. Edit details & logo: Pencil icon */}
                      <button
                        className={styles.editButton}
                        onClick={() => handleOpenEdit(item)}
                        style={{
                          width: "34px",
                          height: "32px",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: "0.95rem",
                          padding: 0,
                          borderRadius: "0.375rem",
                        }}
                        title="Edit merchant details & upload logo"
                      >
                        ✏️
                      </button>

                      {/* 4. Deactivate / Activate: ✕ symbol */}
                      <button
                        className={`${styles.statusButton} ${
                          item.status === "ACTIVE" ? styles.statusButtonActive : styles.statusButtonInactive
                        }`}
                        onClick={() => handleToggleStatus(item)}
                        style={{
                          width: "34px",
                          height: "32px",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: item.status === "ACTIVE" ? "1rem" : "0.75rem",
                          fontWeight: 700,
                          padding: 0,
                          borderRadius: "0.375rem",
                        }}
                        title={item.status === "ACTIVE" ? "Deactivate (Mark INACTIVE)" : "Activate"}
                      >
                        {item.status === "ACTIVE" ? "✕" : "Activate"}
                      </button>

                      {/* 5. Delete Merchant: Trash icon */}
                      <button
                        onClick={() => handleDeleteMerchant(item)}
                        style={{
                          width: "34px",
                          height: "32px",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: "1rem",
                          padding: 0,
                          borderRadius: "0.375rem",
                          border: "1px solid var(--md-color-danger-border)",
                          backgroundColor: "var(--md-color-danger-bg)",
                          color: "var(--md-red-600)",
                          cursor: "pointer",
                          transition: "all 0.15s ease-in-out",
                        }}
                        title={`Delete ${item.name}`}
                      >
                        🗑️
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Pagination footer */}
        <div className={styles.pagination}>
          <div>
            Showing {items.length > 0 ? (page - 1) * limit + 1 : 0} to{" "}
            {Math.min(page * limit, total)} of {total} merchant websites
          </div>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              className={styles.secondaryButton}
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </button>
            <span style={{ display: "flex", alignItems: "center", padding: "0 0.5rem" }}>
              Page {page} of {totalPages}
            </span>
            <button
              className={styles.secondaryButton}
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* Add / Edit Modal */}
      {isModalOpen && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalCard}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>
                {editingItem ? `Edit Merchant: ${editingItem.name}` : "Add Merchant Website"}
              </h2>
              <button className={styles.closeButton} onClick={() => setIsModalOpen(false)}>
                ✕
              </button>
            </div>

            <form onSubmit={handleSave}>
              <div className={styles.formGrid}>
                <div className={styles.formField}>
                  <label className={styles.formLabel}>Merchant Name *</label>
                  <input
                    type="text"
                    required
                    className={styles.formInput}
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g. Croma"
                  />
                </div>

                <div className={styles.formField}>
                  <label className={styles.formLabel}>Website URL *</label>
                  <input
                    type="text"
                    required
                    className={styles.formInput}
                    value={formData.websiteUrl}
                    onChange={(e) => setFormData({ ...formData, websiteUrl: e.target.value })}
                    placeholder="e.g. https://www.croma.com"
                  />
                </div>

                <div className={styles.formField}>
                  <label className={styles.formLabel}>Primary Category</label>
                  <select
                    className={styles.formInput}
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  >
                    {MERCHANT_DIRECTORY_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                <div className={styles.formField}>
                  <label className={styles.formLabel}>Status</label>
                  <select
                    className={styles.formInput}
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as MerchantDirectoryItem["status"] })}
                  >
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="INACTIVE">INACTIVE</option>
                    <option value="UNDER_REVIEW">UNDER_REVIEW</option>
                  </select>
                </div>

                <div className={styles.formField}>
                  <label className={styles.formLabel}>Verification Status</label>
                  <select
                    className={styles.formInput}
                    value={formData.verificationStatus}
                    onChange={(e) =>
                      setFormData({ ...formData, verificationStatus: e.target.value as MerchantDirectoryItem["verificationStatus"] })
                    }
                  >
                    <option value="VERIFIED">VERIFIED</option>
                    <option value="UNVERIFIED">UNVERIFIED</option>
                    <option value="NEEDS_REVIEW">NEEDS_REVIEW</option>
                  </select>
                </div>

                <div className={styles.formField}>
                  <label className={styles.formLabel}>Country</label>
                  <input
                    type="text"
                    className={styles.formInput}
                    value={formData.country}
                    onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                  />
                </div>

                <div className={styles.formFieldFull}>
                  <label className={styles.formLabel}>Product Focus</label>
                  <input
                    type="text"
                    className={styles.formInput}
                    value={formData.productFocus ?? ""}
                    onChange={(e) => setFormData({ ...formData, productFocus: e.target.value })}
                    placeholder="e.g. Consumer electronics and appliances"
                  />
                </div>

                <div className={styles.formFieldFull}>
                  <label className={styles.formLabel}>Business Model (Indicative)</label>
                  <input
                    type="text"
                    className={styles.formInput}
                    value={formData.businessModel ?? ""}
                    onChange={(e) => setFormData({ ...formData, businessModel: e.target.value })}
                    placeholder="e.g. Brand-owned retail / Marketplace / D2C"
                  />
                </div>

                <div className={styles.formFieldFull}>
                  <label className={styles.formLabel}>Merchant Logo (Preview &amp; Upload)</label>
                  <div style={{ display: "flex", alignItems: "center", gap: "1.25rem", padding: "10px", background: "var(--md-color-surface-muted)", borderRadius: "10px", border: "1px solid var(--md-color-border)" }}>
                    {formData.logoUrl ? (
                      <div
                        style={{
                          width: "80px",
                          height: "80px",
                          flexShrink: 0,
                          borderRadius: "10px",
                          border: "1px solid var(--md-color-border-strong)",
                          background: "var(--md-white)",
                          padding: "6px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          boxShadow: "0 1px 3px color-mix(in srgb, var(--md-black) 6%, transparent)",
                        }}
                      >
                        <Image
                          src={formData.logoUrl}
                          alt="Logo preview"
                          width={68}
                          height={68}
                          unoptimized
                          style={{ maxHeight: "100%", maxWidth: "100%", objectFit: "contain" }}
                        />
                      </div>
                    ) : (
                      <div
                        style={{
                          width: "80px",
                          height: "80px",
                          flexShrink: 0,
                          borderRadius: "10px",
                          border: "2px dashed var(--md-color-border-strong)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: "1.75rem",
                          color: "var(--md-color-text-muted)",
                          background: "var(--md-white)",
                        }}
                      >
                        🏪
                      </div>
                    )}
                    <div>
                      <label
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "6px",
                          padding: "6px 14px",
                          borderRadius: "6px",
                          fontSize: "0.85rem",
                          fontWeight: 600,
                          cursor: uploadingLogo ? "wait" : "pointer",
                          color: "var(--md-color-primary)",
                          background: "var(--md-color-primary-subtle)",
                          border: "1px solid var(--md-color-primary-soft)",
                        }}
                      >
                        <span>{uploadingLogo ? "⏳ Uploading..." : "📷 Upload Logo"}</span>
                        <input
                          type="file"
                          accept=".jpg,.jpeg,.png,.gif,.svg,.tiff,.tif,.webp,.avif,image/jpeg,image/png,image/gif,image/svg+xml,image/tiff,image/webp,image/avif"
                          style={{ display: "none" }}
                          disabled={uploadingLogo}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleLogoUpload(file);
                          }}
                        />
                      </label>
                      <div style={{ fontSize: "0.75rem", color: "var(--md-color-text-muted)", marginTop: "6px" }}>
                        Accepts: JPG, PNG, GIF, SVG, TIFF, WebP, AVIF formats.
                      </div>
                    </div>
                    {uploadingLogo && <span style={{ fontSize: "0.8125rem", color: "var(--md-color-text-muted)" }}>Uploading logo...</span>}
                  </div>
                </div>

                <div className={styles.formFieldFull}>
                  <label className={styles.formLabel}>Description (Optional)</label>
                  <textarea
                    rows={2}
                    className={styles.formInput}
                    value={formData.description ?? ""}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Brief description of the merchant website..."
                  />
                </div>

                <div className={styles.formFieldFull}>
                  <label className={styles.formLabel}>Admin Notes</label>
                  <textarea
                    rows={2}
                    className={styles.formInput}
                    value={formData.notes ?? ""}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="Admin review notes, affiliate eligibility, etc."
                  />
                </div>
              </div>

              <div className={styles.modalFooter}>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => setIsModalOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className={styles.primaryButton} disabled={saving}>
                  {saving ? "Saving..." : editingItem ? "Update Merchant" : "Save Merchant"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
