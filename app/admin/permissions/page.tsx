"use client";

import { useEffect, useState, useCallback } from "react";

interface Publisher {
  id: string;
  name: string;
  email: string;
  productCount: number;
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

export default function PermissionsPage() {
  const [publishers, setPublishers] = useState<Publisher[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedPublisher, setSelectedPublisher] = useState<string>("");
  const [selectedProducts, setSelectedProducts] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [loadingPerms, setLoadingPerms] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState<{ message: string; type: string } | null>(null);

  const fetchPublishers = useCallback(async () => {
    const res = await fetch("/api/admin/publishers");
    const data = await res.json();
    setPublishers(data.publishers || []);
  }, []);

  const fetchProducts = useCallback(async () => {
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
  }, []);

  const fetchPermissions = useCallback(async (publisherId: string) => {
    setLoadingPerms(true);
    try {
      const res = await fetch(`/api/admin/permissions?publisher_id=${publisherId}`);
      const data = await res.json();
      const perms: Permission[] = data.permissions || [];
      setSelectedProducts(new Set(perms.map((p) => p.shopify_product_id)));
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingPerms(false);
    }
  }, []);

  useEffect(() => {
    Promise.all([fetchPublishers(), fetchProducts()]).finally(() => setLoading(false));
  }, [fetchPublishers, fetchProducts]);

  useEffect(() => {
    if (selectedPublisher) {
      fetchPermissions(selectedPublisher);
    } else {
      setSelectedProducts(new Set());
    }
  }, [selectedPublisher, fetchPermissions]);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

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

  const selectAll = () => {
    const filtered = filteredProducts.map((p) => p.id);
    setSelectedProducts((prev) => {
      const next = new Set(prev);
      filtered.forEach((id) => next.add(id));
      return next;
    });
  };

  const deselectAll = () => {
    const filtered = new Set(filteredProducts.map((p) => p.id));
    setSelectedProducts((prev) => {
      const next = new Set(prev);
      filtered.forEach((id) => next.delete(id));
      return next;
    });
  };

  const handleSave = async () => {
    if (!selectedPublisher) return;
    setSaving(true);

    try {
      const productsToSave = Array.from(selectedProducts).map((id) => {
        const product = products.find((p) => p.id === id);
        return { id, title: product?.title || "" };
      });

      const res = await fetch("/api/admin/permissions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          publisher_id: selectedPublisher,
          products: productsToSave,
        }),
      });

      if (res.ok) {
        const pubName = publishers.find((p) => p.id === selectedPublisher)?.name;
        setToast({
          message: `Saved ${productsToSave.length} products for ${pubName}`,
          type: "success",
        });
        fetchPublishers(); // refresh counts
      }
    } catch (err) {
      console.error(err);
      setToast({ message: "Failed to save permissions", type: "error" });
    } finally {
      setSaving(false);
    }
  };

  const filteredProducts = products.filter(
    (p) =>
      p.title.toLowerCase().includes(search.toLowerCase()) ||
      p.vendor.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner" />
        <span>Loading data...</span>
      </div>
    );
  }

  return (
    <>
      <div className="page-header">
        <h1>Permissions</h1>
        <p>Control which products each publisher can see</p>
      </div>

      {/* Publisher Selector */}
      <div className="card">
        <div className="card-header">
          <h2>Select Publisher</h2>
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <select
            value={selectedPublisher}
            onChange={(e) => setSelectedPublisher(e.target.value)}
            style={{ maxWidth: 400 }}
          >
            <option value="">— Choose a publisher —</option>
            {publishers.map((pub) => (
              <option key={pub.id} value={pub.id}>
                {pub.name} ({pub.email}) — {pub.productCount} products
              </option>
            ))}
          </select>
        </div>
      </div>

      {selectedPublisher && (
        <div className="card">
          <div className="card-header">
            <h2>
              Product Access
              <span style={{ fontWeight: 400, fontSize: "0.85rem", color: "var(--text-secondary)", marginLeft: "0.75rem" }}>
                {selectedProducts.size} selected
              </span>
            </h2>
            <div className="card-actions">
              <button className="btn btn-secondary btn-sm" onClick={selectAll}>Select All</button>
              <button className="btn btn-secondary btn-sm" onClick={deselectAll}>Deselect All</button>
              <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>
                {saving ? <><span className="spinner" /> Saving...</> : "Save Changes"}
              </button>
            </div>
          </div>

          <div className="search-bar">
            <svg className="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              placeholder="Search products..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {loadingProducts || loadingPerms ? (
            <div className="loading-container">
              <div className="spinner" />
              <span>Loading products...</span>
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
      )}

      {toast && <div className={`toast ${toast.type}`}>{toast.message}</div>}
    </>
  );
}
