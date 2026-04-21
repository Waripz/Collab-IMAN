"use client";

import { useEffect, useState, useCallback } from "react";

interface Publisher {
  id: string;
  email: string;
  name: string;
  productCount: number;
  created_at: string;
}

interface Product {
  id: number;
  title: string;
  vendor: string;
  image: string | null;
}

interface Permission {
  shopify_product_id: number;
  product_title: string;
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
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<Set<number>>(new Set());
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [loadingPerms, setLoadingPerms] = useState(false);
  const [savingPerms, setSavingPerms] = useState(false);
  const [permSearch, setPermSearch] = useState("");

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

  // --- Edit Permissions ---
  const openPermissions = async (pub: Publisher) => {
    setEditingPublisher(pub);
    setPermSearch("");

    // Load products from cache
    if (products.length === 0) {
      setLoadingProducts(true);
      try {
        const res = await fetch("/api/shopify/products");
        const data = await res.json();
        setProducts(data.products || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoadingProducts(false);
      }
    }

    // Load this publisher's current permissions
    setLoadingPerms(true);
    try {
      const res = await fetch(`/api/admin/permissions?publisher_id=${pub.id}`);
      const data = await res.json();
      const perms: Permission[] = data.permissions || [];
      setSelectedProducts(new Set(perms.map((p) => p.shopify_product_id)));
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingPerms(false);
    }
  };

  const toggleProduct = (productId: number) => {
    setSelectedProducts((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) {
        next.delete(productId);
      } else {
        next.add(productId);
      }
      return next;
    });
  };

  const handleSavePerms = async () => {
    if (!editingPublisher) return;
    setSavingPerms(true);

    try {
      const productsToSave = Array.from(selectedProducts).map((id) => {
        const product = products.find((p) => p.id === id);
        return { id, title: product?.title || "" };
      });

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

  const refreshProducts = async () => {
    setLoadingProducts(true);
    try {
      const res = await fetch("/api/shopify/products?refresh=true");
      const data = await res.json();
      setProducts(data.products || []);
      setToast({ message: `Synced ${data.products?.length || 0} products from Shopify`, type: "success" });
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingProducts(false);
    }
  };

  const filteredProducts = products.filter(
    (p) =>
      p.title.toLowerCase().includes(permSearch.toLowerCase()) ||
      (p.vendor && p.vendor.toLowerCase().includes(permSearch.toLowerCase()))
  );

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
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => openPermissions(pub)}
                    title="Edit product access"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    </svg>
                    Edit Products
                  </button>
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={() => handleDelete(pub)}
                    title="Delete publisher"
                  >
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

      {/* Edit Permissions Modal */}
      {editingPublisher && (
        <div className="modal-overlay" onClick={() => setEditingPublisher(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 700, maxHeight: "90vh" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
              <div>
                <h2 style={{ marginBottom: "0.25rem" }}>Edit Products — {editingPublisher.name}</h2>
                <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", margin: 0 }}>
                  {selectedProducts.size} product{selectedProducts.size !== 1 ? "s" : ""} selected
                </p>
              </div>
              <button className="btn btn-secondary btn-sm" onClick={refreshProducts} disabled={loadingProducts}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                </svg>
                {loadingProducts ? "Syncing..." : "Sync from Shopify"}
              </button>
            </div>

            <div className="search-bar">
              <svg className="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                placeholder="Search products..."
                value={permSearch}
                onChange={(e) => setPermSearch(e.target.value)}
              />
            </div>

            <div style={{ maxHeight: "50vh", overflowY: "auto", marginBottom: "1rem" }}>
              {loadingProducts || loadingPerms ? (
                <div className="loading-container">
                  <div className="spinner" />
                  <span>Loading products...</span>
                </div>
              ) : filteredProducts.length === 0 ? (
                <div className="empty-state">
                  <h3>No products found</h3>
                  <p>Try clicking &quot;Sync from Shopify&quot; to load your product catalog</p>
                </div>
              ) : (
                <div className="permission-grid">
                  {filteredProducts.map((product) => (
                    <label
                      key={product.id}
                      className={`permission-product ${selectedProducts.has(product.id) ? "selected" : ""}`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedProducts.has(product.id)}
                        onChange={() => toggleProduct(product.id)}
                      />
                      <div className="product-info">
                        <div className="product-title">{product.title}</div>
                        <div className="product-vendor">{product.vendor}</div>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setEditingPublisher(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSavePerms} disabled={savingPerms}>
                {savingPerms ? <><span className="spinner" /> Saving...</> : `Save (${selectedProducts.size} products)`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && <div className={`toast ${toast.type}`}>{toast.message}</div>}
    </>
  );
}
