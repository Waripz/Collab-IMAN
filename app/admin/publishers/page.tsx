"use client";

import { useEffect, useState, useCallback } from "react";

interface Publisher {
  id: string;
  email: string;
  name: string;
  productCount: number;
  created_at: string;
}

interface ResolvedProduct {
  id: number;
  title: string;
  vendor: string;
}

export default function PublishersPage() {
  const [publishers, setPublishers] = useState<Publisher[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: string } | null>(null);

  // Permission editing state
  const [editingPublisher, setEditingPublisher] = useState<Publisher | null>(null);
  const [productIds, setProductIds] = useState<string>(""); // Comma-separated IDs
  const [resolvedProducts, setResolvedProducts] = useState<ResolvedProduct[]>([]);
  const [resolving, setResolving] = useState(false);
  const [savingPerms, setSavingPerms] = useState(false);
  const [newProductId, setNewProductId] = useState("");

  const fetchPublishers = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/publishers");
      const data = await res.json();
      setPublishers(data.publishers || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPublishers();
  }, [fetchPublishers]);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // --- Create Publisher ---
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    setSaving(true);

    try {
      const res = await fetch("/api/admin/publishers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: formName, email: formEmail, password: formPassword }),
      });

      const data = await res.json();
      if (!res.ok) {
        setFormError(data.error || "Failed to create publisher");
        return;
      }

      setShowCreateModal(false);
      setFormName("");
      setFormEmail("");
      setFormPassword("");
      setToast({ message: `Publisher "${formName}" created!`, type: "success" });
      fetchPublishers();
    } catch {
      setFormError("Network error");
    } finally {
      setSaving(false);
    }
  };

  // --- Delete Publisher ---
  const handleDelete = async (pub: Publisher) => {
    if (!confirm(`Delete publisher "${pub.name}"? This will remove all their permissions.`)) return;

    try {
      const res = await fetch("/api/admin/publishers", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: pub.id }),
      });

      if (res.ok) {
        setToast({ message: `Publisher "${pub.name}" deleted.`, type: "success" });
        fetchPublishers();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // --- Open Permissions Editor ---
  const openPermissions = async (pub: Publisher) => {
    setEditingPublisher(pub);
    setNewProductId("");
    setResolvedProducts([]);

    // Load current permissions
    try {
      const res = await fetch(`/api/admin/permissions?publisher_id=${pub.id}`);
      const data = await res.json();
      const perms = data.permissions || [];
      
      if (perms.length > 0) {
        const ids = perms.map((p: { shopify_product_id: number }) => p.shopify_product_id);
        setProductIds(ids.join(", "));
        
        // Resolve product names from Shopify (fast — single call by IDs)
        resolveProducts(ids);
      } else {
        setProductIds("");
      }
    } catch (err) {
      console.error(err);
    }
  };

  // --- Resolve product IDs to names via Shopify ---
  const resolveProducts = async (ids: number[]) => {
    if (ids.length === 0) {
      setResolvedProducts([]);
      return;
    }
    setResolving(true);
    try {
      const res = await fetch(`/api/shopify/products?ids=${ids.join(",")}`);
      const data = await res.json();
      setResolvedProducts(data.products || []);
    } catch (err) {
      console.error(err);
    } finally {
      setResolving(false);
    }
  };

  // --- Add a product ID ---
  const addProductId = () => {
    const id = newProductId.trim();
    if (!id || isNaN(Number(id))) return;

    const currentIds = productIds
      ? productIds.split(",").map((s) => s.trim()).filter(Boolean)
      : [];
    
    if (currentIds.includes(id)) {
      setToast({ message: "Product ID already added", type: "error" });
      return;
    }

    const updatedIds = [...currentIds, id];
    setProductIds(updatedIds.join(", "));
    setNewProductId("");

    // Resolve the new product
    resolveProducts(updatedIds.map(Number));
  };

  // --- Remove a product ---
  const removeProduct = (productId: number) => {
    const currentIds = productIds
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s && Number(s) !== productId);
    
    setProductIds(currentIds.join(", "));
    setResolvedProducts((prev) => prev.filter((p) => p.id !== productId));
  };

  // --- Bulk paste IDs ---
  const handleBulkPaste = () => {
    const ids = productIds
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s && !isNaN(Number(s)))
      .map(Number);

    if (ids.length > 0) {
      resolveProducts(ids);
    }
  };

  // --- Save Permissions ---
  const handleSavePerms = async () => {
    if (!editingPublisher) return;
    setSavingPerms(true);

    try {
      const productsToSave = resolvedProducts.map((p) => ({
        id: p.id,
        title: p.title,
      }));

      const res = await fetch("/api/admin/permissions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          publisher_id: editingPublisher.id,
          products: productsToSave,
        }),
      });

      if (res.ok) {
        setToast({
          message: `Saved ${productsToSave.length} products for ${editingPublisher.name}`,
          type: "success",
        });
        setEditingPublisher(null);
        fetchPublishers();
      }
    } catch (err) {
      console.error(err);
      setToast({ message: "Failed to save permissions", type: "error" });
    } finally {
      setSavingPerms(false);
    }
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner" />
        <span>Loading publishers...</span>
      </div>
    );
  }

  return (
    <>
      <div className="page-header">
        <h1>Publishers</h1>
        <p>Manage collaborative publisher accounts and their product access</p>
      </div>

      <div className="card">
        <div className="card-header">
          <h2>{publishers.length} Publisher{publishers.length !== 1 ? "s" : ""}</h2>
          <button className="btn btn-primary btn-sm" onClick={() => setShowCreateModal(true)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add Publisher
          </button>
        </div>

        {publishers.length === 0 ? (
          <div className="empty-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            <h3>No publishers yet</h3>
            <p>Create publisher accounts for your collaborators</p>
          </div>
        ) : (
          <div className="publisher-list">
            {publishers.map((pub) => (
              <div key={pub.id} className="publisher-item">
                <div className="pub-avatar">{pub.name.charAt(0).toUpperCase()}</div>
                <div className="pub-info">
                  <div className="pub-name">{pub.name}</div>
                  <div className="pub-email">{pub.email}</div>
                  <div className="pub-products">
                    {pub.productCount} product{pub.productCount !== 1 ? "s" : ""} assigned
                  </div>
                </div>
                <div className="pub-actions">
                  <button className="btn btn-secondary btn-sm" onClick={() => openPermissions(pub)}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                    Edit Products
                  </button>
                  <button className="btn btn-danger btn-sm" onClick={() => handleDelete(pub)}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Publisher Modal */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Add Publisher</h2>
            <form onSubmit={handleCreate}>
              <div className="form-group">
                <label>Name</label>
                <input type="text" value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="Publisher name" required autoFocus />
              </div>
              <div className="form-group">
                <label>Email</label>
                <input type="email" value={formEmail} onChange={(e) => setFormEmail(e.target.value)} placeholder="publisher@example.com" required />
              </div>
              <div className="form-group">
                <label>Password</label>
                <input type="password" value={formPassword} onChange={(e) => setFormPassword(e.target.value)} placeholder="Minimum 6 characters" required minLength={6} />
              </div>
              {formError && <div className="form-error">{formError}</div>}
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowCreateModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? <><span className="spinner" /> Creating...</> : "Create Publisher"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Products Modal */}
      {editingPublisher && (
        <div className="modal-overlay" onClick={() => setEditingPublisher(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 600, maxHeight: "90vh" }}>
            <h2 style={{ marginBottom: "0.25rem" }}>Edit Products — {editingPublisher.name}</h2>
            <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "1.25rem" }}>
              Enter Shopify Product IDs to track. Find IDs in Shopify Admin → Products → click a product → the ID is in the URL.
            </p>

            {/* Add single product ID */}
            <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
              <input
                type="text"
                value={newProductId}
                onChange={(e) => setNewProductId(e.target.value.replace(/[^0-9]/g, ""))}
                placeholder="Enter Product ID (e.g. 7599985295513)"
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addProductId())}
                style={{
                  flex: 1, padding: "0.65rem 1rem", background: "var(--bg-input)",
                  border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-sm)",
                  color: "var(--text-primary)", fontSize: "0.85rem", fontFamily: "inherit", outline: "none",
                }}
              />
              <button className="btn btn-primary btn-sm" onClick={addProductId} type="button">
                Add
              </button>
            </div>

            {/* Bulk paste area */}
            <div className="form-group" style={{ marginBottom: "1rem" }}>
              <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>Product IDs (comma-separated)</span>
                <button className="btn btn-secondary btn-sm" onClick={handleBulkPaste} type="button" disabled={resolving} style={{ fontSize: "0.7rem", padding: "0.3rem 0.6rem" }}>
                  {resolving ? "Resolving..." : "Resolve Names"}
                </button>
              </label>
              <textarea
                value={productIds}
                onChange={(e) => setProductIds(e.target.value)}
                placeholder="7599985295513, 7207875149977, 1194064904249"
                rows={3}
                style={{
                  width: "100%", padding: "0.65rem 1rem", background: "var(--bg-input)",
                  border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-sm)",
                  color: "var(--text-primary)", fontSize: "0.85rem", fontFamily: "'Inter', monospace",
                  outline: "none", resize: "vertical",
                }}
              />
            </div>

            {/* Resolved products list */}
            {resolving && (
              <div className="loading-container" style={{ padding: "1rem" }}>
                <div className="spinner" />
                <span>Fetching product names...</span>
              </div>
            )}

            {!resolving && resolvedProducts.length > 0 && (
              <div style={{ marginBottom: "1rem" }}>
                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.5rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  {resolvedProducts.length} Product{resolvedProducts.length !== 1 ? "s" : ""} Found
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", maxHeight: "250px", overflowY: "auto" }}>
                  {resolvedProducts.map((product) => (
                    <div
                      key={product.id}
                      style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        padding: "0.6rem 0.75rem", background: "var(--bg-input)",
                        border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-sm)",
                      }}
                    >
                      <div style={{ flex: 1, overflow: "hidden" }}>
                        <div style={{ fontSize: "0.85rem", fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: "var(--text-primary)" }}>
                          {product.title}
                        </div>
                        <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
                          ID: {product.id} · {product.vendor}
                        </div>
                      </div>
                      <button
                        onClick={() => removeProduct(product.id)}
                        style={{
                          background: "none", border: "none", color: "var(--accent-rose)",
                          cursor: "pointer", padding: "0.25rem", flexShrink: 0,
                        }}
                        title="Remove"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setEditingPublisher(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSavePerms} disabled={savingPerms || resolvedProducts.length === 0}>
                {savingPerms ? <><span className="spinner" /> Saving...</> : `Save ${resolvedProducts.length} Product${resolvedProducts.length !== 1 ? "s" : ""}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className={`toast ${toast.type}`}>{toast.message}</div>}
    </>
  );
}
