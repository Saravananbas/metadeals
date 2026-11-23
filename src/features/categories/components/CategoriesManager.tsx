"use client";

import { useEffect, useState } from "react";
import { AdminNav } from "@/components/admin/AdminNav";
import { can, type AdminRole } from "@/server/auth/permissions";

interface CategoryEntry {
  id: string;
  name: string;
  slug: string;
  parentId?: string | null;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function CategoriesManager({
  role,
  permissions = null,
  initialCategories = [],
}: {
  role: AdminRole;
  permissions?: readonly string[] | null;
  initialCategories?: CategoryEntry[];
}) {
  const [categories, setCategories] = useState<CategoryEntry[]>(initialCategories);
  const [loading, setLoading] = useState(initialCategories.length === 0);
  const [busy, setBusy] = useState(false);
  // Parent cards start collapsed; the admin opens the ones to check.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggleExpanded = (id: string) => setExpanded((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Drag-and-drop state for card and subcategory movement
  const [draggedSubcategory, setDraggedSubcategory] = useState<CategoryEntry | null>(null);
  const [dragOverParentId, setDragOverParentId] = useState<string | null>(null);
  const [draggedParentId, setDraggedParentId] = useState<string | null>(null);
  const [parentOrder, setParentOrder] = useState<string[]>(() =>
    initialCategories.filter((c) => !c.parentId).map((c) => c.id)
  );

  const [isFormOpen, setIsFormOpen] = useState(false);

  const [form, setForm] = useState({
    id: "",
    name: "",
    slug: "",
    parentId: "",
  });

  async function loadCategories(showLoading = true) {
    if (showLoading) {
      setLoading(true);
      setError(null);
    }
    try {
      const res = await fetch("/api/v1/admin/categories");
      if (!res.ok) throw new Error("Failed to load categories.");
      const json = await res.json();
      const list: CategoryEntry[] = json.data || [];
      setCategories(list);
      setParentOrder((prev) => {
        const parents = list.filter((c) => !c.parentId).map((c) => c.id);
        if (prev.length === 0) return parents;
        const remaining = parents.filter((id) => !prev.includes(id));
        return [...prev.filter((id) => parents.includes(id)), ...remaining];
      });
    } catch (err: unknown) {
      setError(errorMessage(err, "Failed to load categories."));
    } finally {
      setLoading(false);
    }
  }

  // Handle moving a subcategory into a different parent category
  async function handleMoveSubcategoryToParent(sub: CategoryEntry, targetParent: CategoryEntry) {
    if (sub.parentId === targetParent.id) return;
    setBusy(true);
    setError(null);

    // Optimistic UI update
    setCategories((prev) =>
      prev.map((c) => (c.id === sub.id ? { ...c, parentId: targetParent.id } : c))
    );

    try {
      const res = await fetch(`/api/v1/admin/categories/${sub.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: sub.name,
          slug: sub.slug,
          parentId: targetParent.id,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "Failed to move subcategory.");
      setMessage(`Moved "${sub.name}" into "${targetParent.name}".`);
    } catch (err: unknown) {
      setError(errorMessage(err, "Failed to update category parent."));
      await loadCategories(); // rollback
    } finally {
      setBusy(false);
      setDraggedSubcategory(null);
      setDragOverParentId(null);
    }
  }

  // Handle reordering parent category cards
  function handleReorderParentCards(targetParentId: string) {
    if (!draggedParentId || draggedParentId === targetParentId) return;
    setParentOrder((prev) => {
      const copy = [...prev];
      const fromIndex = copy.indexOf(draggedParentId);
      const toIndex = copy.indexOf(targetParentId);
      if (fromIndex === -1 || toIndex === -1) return prev;
      copy.splice(fromIndex, 1);
      copy.splice(toIndex, 0, draggedParentId);
      return copy;
    });
    setDraggedParentId(null);
  }

  useEffect(() => {
    if (initialCategories.length === 0) {
      void Promise.resolve().then(() => loadCategories(false));
    }
  }, [initialCategories.length]);

  function handleAddParentCategory() {
    setForm({
      id: "",
      name: "",
      slug: "",
      parentId: "",
    });
    setIsFormOpen(true);
    setMessage(null);
    setError(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleAddSubCategory(preferredParentId?: string) {
    const parentId = preferredParentId || categories.find((c) => !c.parentId)?.id || "";
    if (parentId) setExpanded((prev) => new Set(prev).add(parentId));
    setForm({
      id: "",
      name: "",
      slug: "",
      parentId,
    });
    setIsFormOpen(true);
    setMessage(null);
    setError(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleSelectEdit(cat: CategoryEntry) {
    setForm({
      id: cat.id,
      name: cat.name,
      slug: cat.slug,
      parentId: cat.parentId || "",
    });
    setIsFormOpen(true);
    setMessage(null);
    setError(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;

    setBusy(true);
    setMessage(null);
    setError(null);

    try {
      const url = form.id
        ? `/api/v1/admin/categories/${form.id}`
        : `/api/v1/admin/categories`;
      const method = form.id ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          slug: form.slug.trim(),
          parentId: form.parentId || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "Failed to save category.");

      setMessage(form.id ? `Updated "${form.name}" successfully.` : `Created "${form.name}" successfully.`);
      setForm({ id: "", name: "", slug: "", parentId: "" });
      setIsFormOpen(false);
      await loadCategories();
    } catch (err: unknown) {
      setError(errorMessage(err, "Failed to save category."));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(category: CategoryEntry) {
    const isParent = !category.parentId;
    const confirmMessage = isParent
      ? `Are you sure you want to delete parent category "${category.name}"?\nAny subcategories will be detached and deals safely preserved.`
      : `Are you sure you want to delete subcategory "${category.name}"?`;

    if (!window.confirm(confirmMessage)) return;

    setBusy(true);
    setMessage(null);
    setError(null);

    try {
      const res = await fetch(`/api/v1/admin/categories/${category.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "Failed to delete category.");

      setMessage(`Category "${category.name}" deleted successfully.`);
      if (form.id === category.id) {
        setForm({ id: "", name: "", slug: "", parentId: "" });
        setIsFormOpen(false);
      }
      await loadCategories();
    } catch (err: unknown) {
      setError(errorMessage(err, "Failed to delete category."));
    } finally {
      setBusy(false);
    }
  }

  const parentCategories = categories.filter((c) => !c.parentId);
  const totalSubcategories = categories.filter((c) => c.parentId).length;

  return (
    <main style={{ maxWidth: 1400, margin: "auto", padding: "24px 20px 60px" }}>
      <AdminNav active="categories" />

      {/* Header bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16, margin: "16px 0 24px" }}>
        <div>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 800, color: "var(--md-purple-950)", margin: "0 0 6px 0" }}>
            Categories Taxonomy
          </h1>
          <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--md-color-text-secondary)" }}>
            Curated hierarchy of {parentCategories.length} Parent Categories and {totalSubcategories} Subcategories for MetaDeals4U.
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {/* Button 1: Add New Category */}
          <button
            type="button"
            onClick={handleAddParentCategory}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "10px 18px",
              background: "var(--md-color-primary)",
              color: "var(--md-white)",
              border: "none",
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 700,
              cursor: "pointer",
              boxShadow: "0 2px 4px color-mix(in srgb, var(--md-purple-500) 20%, transparent)",
            }}
          >
            ➕ Add New Category
          </button>

          {/* Button 2: Add a New Sub Category */}
          <button
            type="button"
            onClick={() => handleAddSubCategory()}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "10px 18px",
              background: "var(--md-color-primary-subtle)",
              color: "var(--md-color-primary)",
              border: "1.5px solid var(--md-purple-300)",
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            ↳ Add a New Sub Category
          </button>

          {/* Refresh Button */}
          <button
            type="button"
            onClick={() => void loadCategories()}
            disabled={loading}
            style={{
              padding: "10px 14px",
              background: "var(--md-white)",
              color: "var(--md-color-text-secondary)",
              border: "1px solid var(--md-color-border-strong)",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {loading ? "Refreshing..." : "🔄 Refresh"}
          </button>
        </div>
      </div>

      {/* Alerts */}
      {message && (
        <div style={{ padding: "12px 16px", borderRadius: 8, background: "var(--md-color-success-bg)", border: "1px solid var(--md-color-success-border)", color: "var(--md-green-700)", fontSize: 14, marginBottom: 20 }}>
          {message}
        </div>
      )}
      {error && (
        <div style={{ padding: "12px 16px", borderRadius: 8, background: "var(--md-color-danger-bg)", border: "1px solid var(--md-color-danger-border)", color: "var(--md-red-700)", fontSize: 14, marginBottom: 20 }}>
          {error}
        </div>
      )}

      {/* Add / Edit Form Panel */}
      {can({ role, permissions }, "category:manage") && isFormOpen && (
        <section
          style={{
            background: "var(--md-color-primary-subtle)",
            border: "1px solid var(--md-color-primary-soft)",
            borderRadius: 14,
            padding: 22,
            marginBottom: 32,
            boxShadow: "0 1px 3px color-mix(in srgb, var(--md-purple-500) 5%, transparent)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: "var(--md-color-primary)" }}>
              {form.id
                ? `✏️ Edit ${form.parentId ? "Subcategory" : "Category"}: ${form.name}`
                : form.parentId
                ? "↳ Creating New Sub Category"
                : "➕ Creating New Category (Top Level)"}
            </span>
            {form.id && (
              <button
                type="button"
                onClick={() => setForm({ id: "", name: "", slug: "", parentId: "" })}
                style={{
                  fontSize: 12,
                  padding: "4px 10px",
                  background: "var(--md-white)",
                  color: "var(--md-color-text-secondary)",
                  border: "1px solid var(--md-color-border-strong)",
                  borderRadius: 6,
                  cursor: "pointer",
                }}
              >
                ✕ Cancel Edit
              </button>
            )}
          </div>

          <form
            onSubmit={handleSave}
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
              gap: 16,
              alignItems: "flex-end",
            }}
          >
            {/* Step 1: Parent Category Selection */}
            <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
              <label
                style={{
                  display: "block",
                  fontSize: 13,
                  fontWeight: 700,
                  color: "var(--md-neutral-700)",
                  marginBottom: 6,
                  height: 36,
                  lineHeight: "18px",
                  overflow: "hidden",
                }}
              >
                Parent Category{" "}
                <span style={{ fontWeight: 400, color: "var(--md-color-text-secondary)", fontSize: 12 }}>
                  {form.parentId ? "(Sub Category)" : "(Top Level)"}
                </span>
              </label>
              <select
                value={form.parentId}
                onChange={(e) => setForm({ ...form, parentId: e.target.value })}
                style={{
                  width: "100%",
                  height: 42,
                  boxSizing: "border-box",
                  padding: "0 12px",
                  borderRadius: 8,
                  border: "1px solid var(--md-color-border-strong)",
                  background: "var(--md-white)",
                  fontSize: 14,
                  fontWeight: form.parentId ? 600 : 400,
                  outline: "none",
                }}
              >
                <option value="">Top level (Parent Category)</option>
                {parentCategories
                  .filter((p) => p.id !== form.id)
                  .map((p) => (
                    <option key={p.id} value={p.id} label={p.name}>
                      {p.name}
                    </option>
                  ))}
              </select>
            </div>

            {/* Step 2: Category Name */}
            <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
              <label
                style={{
                  display: "block",
                  fontSize: 13,
                  fontWeight: 700,
                  color: "var(--md-neutral-700)",
                  marginBottom: 6,
                  height: 36,
                  lineHeight: "18px",
                }}
              >
                Category Name *
              </label>
              <input
                required
                type="text"
                placeholder={form.parentId ? "e.g. Toys, TV, Laptops..." : "e.g. Baby Care, Electronics..."}
                value={form.name}
                onChange={(e) => {
                  const val = e.target.value;
                  const autoSlug = val
                    .toLowerCase()
                    .trim()
                    .replace(/['’]/g, "")
                    .replace(/[^\w\s-]/g, "")
                    .replace(/[\s_-]+/g, "-");
                  setForm({
                    ...form,
                    name: val,
                    slug: form.id ? form.slug : autoSlug,
                  });
                }}
                style={{
                  width: "100%",
                  height: 42,
                  boxSizing: "border-box",
                  padding: "0 12px",
                  borderRadius: 8,
                  border: "1px solid var(--md-color-border-strong)",
                  background: "var(--md-white)",
                  fontSize: 14,
                  outline: "none",
                }}
              />
            </div>

            {/* Step 3: Slug */}
            <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
              <label
                style={{
                  display: "block",
                  fontSize: 13,
                  fontWeight: 700,
                  color: "var(--md-neutral-700)",
                  marginBottom: 6,
                  height: 36,
                  lineHeight: "18px",
                }}
              >
                URL Slug *
              </label>
              <input
                required
                type="text"
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
                placeholder="e.g. baby-care or toys"
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value })}
                style={{
                  width: "100%",
                  height: 42,
                  boxSizing: "border-box",
                  padding: "0 12px",
                  borderRadius: 8,
                  border: "1px solid var(--md-color-border-strong)",
                  background: "var(--md-white)",
                  fontSize: 14,
                  outline: "none",
                }}
              />
            </div>

            {/* Submit Button Row */}
            <div
              style={{
                gridColumn: "1 / -1",
                display: "flex",
                justifyContent: "flex-end",
                alignItems: "center",
                gap: 12,
                marginTop: 6,
                paddingTop: 12,
                borderTop: "1px solid var(--md-color-primary-soft)",
              }}
            >
              {form.id && (
                <>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      const current = categories.find((c) => c.id === form.id);
                      if (current) handleDelete(current);
                    }}
                    style={{
                      background: "var(--md-color-danger-bg)",
                      color: "var(--md-color-danger)",
                      fontSize: 13,
                      fontWeight: 700,
                      padding: "9px 16px",
                      borderRadius: 8,
                      border: "1px solid var(--md-color-danger-border)",
                      cursor: busy ? "not-allowed" : "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    🗑️ Delete Category
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm({ id: "", name: "", slug: "", parentId: "" })}
                    style={{
                      background: "var(--md-white)",
                      color: "var(--md-color-text-secondary)",
                      fontSize: 13,
                      fontWeight: 600,
                      padding: "9px 16px",
                      borderRadius: 8,
                      border: "1px solid var(--md-color-border-strong)",
                      cursor: "pointer",
                    }}
                  >
                    Cancel
                  </button>
                </>
              )}
              <button
                type="submit"
                disabled={busy || !form.name.trim()}
                style={{
                  background: "var(--md-color-primary)",
                  color: "var(--md-white)",
                  fontWeight: 700,
                  fontSize: 14,
                  padding: "10px 24px",
                  borderRadius: 8,
                  border: "none",
                  cursor: busy || !form.name.trim() ? "not-allowed" : "pointer",
                  boxShadow: "0 2px 4px color-mix(in srgb, var(--md-purple-500) 20%, transparent)",
                  opacity: busy || !form.name.trim() ? 0.6 : 1,
                }}
              >
                {busy ? "Saving..." : form.id ? "Update Category" : form.parentId ? "Save Sub Category" : "Save Category"}
              </button>
            </div>
          </form>
        </section>
      )}

      {/* Tree Model Presentation with Card & Subcategory Movements */}
      <section>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
          <div>
            <h2 style={{ fontSize: "1.25rem", fontWeight: 700, color: "var(--md-purple-950)", margin: 0 }}>
              🌳 Category &amp; Subcategory Tree View
            </h2>
            <p style={{ margin: "3px 0 0", fontSize: 12, color: "var(--md-color-text-secondary)" }}>
              💡 Drag &amp; Drop: You can drag any parent card to reorder them, or drag any subcategory item into another parent card to move it.
            </p>
          </div>
          <span style={{ display: "inline-flex", gap: 12, alignItems: "center", fontSize: 13, color: "var(--md-color-primary)", fontWeight: 600 }}>
            <button type="button" onClick={() => setExpanded(new Set(parentCategories.map((p) => p.id)))} style={{ background: "none", border: 0, color: "inherit", font: "inherit", cursor: "pointer", textDecoration: "underline" }}>Expand all</button>
            <button type="button" onClick={() => setExpanded(new Set())} style={{ background: "none", border: 0, color: "inherit", font: "inherit", cursor: "pointer", textDecoration: "underline" }}>Collapse all</button>
            {categories.length} categories active
          </span>
        </div>

        {loading ? (
          <div style={{ padding: "40px", textAlign: "center", color: "var(--md-color-text-secondary)", background: "var(--md-color-surface-muted)", borderRadius: 12, border: "1px solid var(--md-color-border)" }}>
            Loading categories tree...
          </div>
        ) : parentCategories.length === 0 ? (
          <div style={{ padding: "40px", textAlign: "center", color: "var(--md-color-text-secondary)", background: "var(--md-color-surface-muted)", borderRadius: 12, border: "1px solid var(--md-color-border)" }}>
            No categories found. Click &quot;Add New Category&quot; above to create one.
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(330px, 1fr))",
              gap: 18,
            }}
          >
            {(parentOrder.length > 0
              ? parentOrder.map((id) => parentCategories.find((p) => p.id === id)).filter(Boolean) as CategoryEntry[]
              : parentCategories
            ).map((parent) => {
              const children = categories.filter((c) => c.parentId === parent.id);
              const isDragOver = dragOverParentId === parent.id;
              const isCardDragging = draggedParentId === parent.id;
              const isOpen = expanded.has(parent.id);

              return (
                <div
                  key={parent.id}
                  draggable
                  onDragStart={(e) => {
                    // Only drag the parent card if not dragging a subcategory
                    if (!draggedSubcategory) {
                      setDraggedParentId(parent.id);
                      e.dataTransfer.setData("text/plain", parent.id);
                    }
                  }}
                  onDragEnd={() => {
                    setDraggedParentId(null);
                    setDraggedSubcategory(null);
                    setDragOverParentId(null);
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (draggedSubcategory && draggedSubcategory.parentId !== parent.id) {
                      setDragOverParentId(parent.id);
                    }
                  }}
                  onDragLeave={() => {
                    if (dragOverParentId === parent.id) {
                      setDragOverParentId(null);
                    }
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (draggedSubcategory) {
                      // Move subcategory to this parent card
                      handleMoveSubcategoryToParent(draggedSubcategory, parent);
                    } else if (draggedParentId && draggedParentId !== parent.id) {
                      // Reorder parent card
                      handleReorderParentCards(parent.id);
                    }
                    setDragOverParentId(null);
                  }}
                  style={{
                    background: isDragOver ? "var(--md-color-primary-soft)" : "var(--md-white)",
                    border: isDragOver
                      ? "2px dashed var(--md-color-primary)"
                      : isCardDragging
                      ? "2px dashed var(--md-color-border-strong)"
                      : "1px solid var(--md-color-border)",
                    borderRadius: 12,
                    padding: "16px",
                    boxShadow: isDragOver
                      ? "0 4px 14px color-mix(in srgb, var(--md-purple-500) 15%, transparent)"
                      : "0 1px 3px color-mix(in srgb, var(--md-black) 4%, transparent)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 12,
                    opacity: isCardDragging ? 0.5 : 1,
                    transition: "all 0.18s ease",
                    cursor: "grab",
                  }}
                >
                  {/* Parent Category Card Header */}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      flexWrap: "wrap",
                      gap: 8,
                      borderBottom: "1.5px solid var(--md-color-surface-muted)",
                      paddingBottom: 10,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flex: "1 1 150px", minWidth: 0 }}>
                      <span
                        style={{ cursor: "grab", fontSize: "1.2rem", userSelect: "none" }}
                        title="Drag this card to reorder"
                      >
                        ⋮⋮ 📁
                      </span>
                      <span
                        onClick={() => handleSelectEdit(parent)}
                        style={{
                          fontWeight: 700,
                          fontSize: "0.98rem",
                          color: "var(--md-purple-950)",
                          cursor: "pointer",
                        }}
                        title="Click to edit category"
                      >
                        {parent.name}
                      </span>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); toggleExpanded(parent.id); }}
                        aria-expanded={isOpen}
                        style={{
                          fontSize: "0.75rem",
                          fontWeight: 700,
                          padding: "7px 10px",
                          borderRadius: 10,
                          border: 0,
                          cursor: "pointer",
                          background: "var(--md-color-primary-soft)",
                          color: "var(--md-color-primary-hover)",
                        }}
                        title={isOpen ? `Collapse ${parent.name}` : `Expand ${parent.name}`}
                      >
                        {children.length} sub {isOpen ? "▴" : "▾"}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAddSubCategory(parent.id);
                        }}
                        style={{
                          background: "var(--md-color-primary-subtle)",
                          border: "1px dashed var(--md-purple-300)",
                          color: "var(--md-color-primary)",
                          borderRadius: 6,
                          padding: "7px 10px",
                          fontSize: 11,
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                        title={`Add a new subcategory under ${parent.name}`}
                      >
                        + Add Sub
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(parent);
                        }}
                        style={{
                          background: "var(--md-color-danger-bg)",
                          border: "1px solid var(--md-color-danger-border)",
                          color: "var(--md-red-600)",
                          borderRadius: 6,
                          padding: "7px 10px",
                          fontSize: 11,
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                        title={`Delete ${parent.name}`}
                      >
                        🗑️
                      </button>
                    </div>
                  </div>

                  {/* Drop zone indicator when dragging a subcategory */}
                  {isDragOver && (
                    <div
                      style={{
                        padding: "8px",
                        borderRadius: 6,
                        background: "var(--md-color-primary-soft)",
                        border: "1px dashed var(--md-color-primary)",
                        color: "var(--md-color-primary-hover)",
                        fontSize: 12,
                        fontWeight: 600,
                        textAlign: "center",
                      }}
                    >
                      Drop to move into {parent.name}
                    </div>
                  )}

                  {/* Subcategories Tree Branches */}
                  <div style={{ display: isOpen ? "flex" : "none", flexDirection: "column", gap: 6, paddingLeft: 4 }}>
                    {children.length === 0 ? (
                      <div style={{ fontSize: 12, color: "var(--md-color-text-muted)", fontStyle: "italic", padding: "6px 8px" }}>
                        No subcategories under {parent.name} yet. Drag one here!
                      </div>
                    ) : (
                      children.map((sub) => (
                        <div
                          key={sub.id}
                          draggable
                          onDragStart={(e) => {
                            e.stopPropagation();
                            setDraggedSubcategory(sub);
                            e.dataTransfer.setData("text/plain", sub.id);
                          }}
                          onDragEnd={() => {
                            setDraggedSubcategory(null);
                            setDragOverParentId(null);
                          }}
                          onClick={() => handleSelectEdit(sub)}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            padding: "6px 10px",
                            borderRadius: 6,
                            background: draggedSubcategory?.id === sub.id ? "var(--md-color-primary-soft)" : "var(--md-color-surface-muted)",
                            border: "1px solid var(--md-color-surface-muted)",
                            fontSize: 13,
                            color: "var(--md-neutral-700)",
                            cursor: "grab",
                            transition: "background 0.15s ease",
                            opacity: draggedSubcategory?.id === sub.id ? 0.6 : 1,
                          }}
                          onMouseEnter={(e) => {
                            if (draggedSubcategory?.id !== sub.id) {
                              e.currentTarget.style.background = "var(--md-color-surface-muted)";
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (draggedSubcategory?.id !== sub.id) {
                              e.currentTarget.style.background = "var(--md-color-surface-muted)";
                            }
                          }}
                          title={`Drag to move "${sub.name}" into another parent card, or click to edit`}
                        >
                          <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ color: "var(--md-purple-400)", fontWeight: 700, userSelect: "none" }}>⋮⋮ ↳</span>
                            <span style={{ fontWeight: 500 }}>{sub.name}</span>
                          </span>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                            <span style={{ fontSize: 11, color: "var(--md-color-text-muted)" }}>✏️ edit</span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDelete(sub);
                              }}
                              style={{
                                background: "none",
                                border: "none",
                                color: "var(--md-red-600)",
                                fontSize: 12,
                                cursor: "pointer",
                                padding: "2px 4px",
                                borderRadius: 4,
                              }}
                              title={`Delete subcategory "${sub.name}"`}
                            >
                              🗑️
                            </button>
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}



