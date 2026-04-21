"use client";

import { useEffect, useState } from "react";

interface Product {
  id: number;
  title: string;
  vendor: string;
  product_type: string;
  status: string;
  image: string | null;
  price: string;
  inventory: number;
  created_at: string;
  updated_at: string;
}

export default function PublisherProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/publisher/products")
      .then((r) => r.json())
      .then((data) => setProducts(data.products || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString("en-MY", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });

  if (loading) {
    return (
      <div className="loading-container" style={{ minHeight: "60vh" }}>
        <div className="spinner" />
        <span>Loading your products...</span>
      </div>
    );
  }

  return (
    <>
      <div className="page-header">
        <h1>Your Products</h1>
        <p>{products.length} product{products.length !== 1 ? "s" : ""} assigned to you</p>
      </div>

      {products.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
            </svg>
            <h3>No products assigned yet</h3>
            <p>Admin will assign products for you to track</p>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {products.map((product) => (
            <div key={product.id} className="card" style={{ padding: 0, overflow: "hidden" }}>
              <div style={{ display: "flex", gap: "1.25rem", padding: "1.25rem", alignItems: "flex-start" }}>
                {/* Product Image */}
                <div
                  style={{
                    width: 80,
                    height: 80,
                    borderRadius: "var(--radius-sm)",
                    background: product.image ? `url(${product.image}) center/cover` : "var(--bg-input)",
                    flexShrink: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    border: "1px solid var(--border-subtle)",
                  }}
                >
                  {!product.image && (
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5">
                      <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
                    </svg>
                  )}
                </div>

                {/* Product Details */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "1rem", marginBottom: "0.5rem" }}>
                    <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "var(--text-primary)", lineHeight: 1.3 }}>
                      {product.title}
                    </h3>
                    <span
                      className="badge"
                      style={{
                        background: product.status === "active" ? "rgba(52, 211, 153, 0.1)" : "rgba(251, 191, 36, 0.1)",
                        color: product.status === "active" ? "var(--accent-green)" : "var(--accent-amber)",
                        flexShrink: 0,
                      }}
                    >
                      {product.status}
                    </span>
                  </div>

                  <div style={{ display: "flex", flexWrap: "wrap", gap: "1.5rem", fontSize: "0.8rem" }}>
                    <div>
                      <div style={{ color: "var(--text-muted)", fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.15rem" }}>
                        price
                      </div>
                      <div style={{ color: "var(--text-primary)", fontWeight: 600 }}>
                        RM {parseFloat(product.price).toFixed(2)}
                      </div>
                    </div>
                    <div>
                      <div style={{ color: "var(--text-muted)", fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.15rem" }}>
                        stock
                      </div>
                      <div style={{
                        color: product.inventory > 10 ? "var(--accent-green)" : product.inventory > 0 ? "var(--accent-amber)" : "var(--accent-rose)",
                        fontWeight: 600,
                      }}>
                        {product.inventory} units
                      </div>
                    </div>
                    <div>
                      <div style={{ color: "var(--text-muted)", fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.15rem" }}>
                        vendor
                      </div>
                      <div style={{ color: "var(--text-secondary)" }}>
                        {product.vendor || "—"}
                      </div>
                    </div>
                    <div>
                      <div style={{ color: "var(--text-muted)", fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.15rem" }}>
                        type
                      </div>
                      <div style={{ color: "var(--text-secondary)" }}>
                        {product.product_type || "—"}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div style={{
                padding: "0.6rem 1.25rem",
                background: "rgba(0,0,0,0.15)",
                borderTop: "1px solid var(--border-subtle)",
                display: "flex",
                justifyContent: "space-between",
                fontSize: "0.7rem",
                color: "var(--text-muted)",
              }}>
                <span>ID: {product.id}</span>
                <span>Updated {formatDate(product.updated_at)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
