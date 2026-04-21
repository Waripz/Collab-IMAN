"use client";

import { useEffect, useState } from "react";

interface Summary {
  totalUnits: number;
  totalRevenue: number;
  totalOrders: number;
  onlineOrders: number;
  posOrders: number;
}

interface Publisher {
  id: string;
  name: string;
  email: string;
  productCount: number;
}

export default function AdminOverview() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [publishers, setPublishers] = useState<Publisher[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  const fetchData = () => {
    setLoading(true);
    Promise.all([
      fetch("/api/shopify/orders").then((r) => r.json()),
      fetch("/api/admin/publishers").then((r) => r.json()),
    ])
      .then(([ordersData, pubData]) => {
        setSummary(ordersData.summary);
        setPublishers(pubData.publishers || []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch("/api/admin/sync", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setSyncResult(`✅ Synced ${data.products} products & ${data.orders} order items`);
        fetchData(); // Refresh dashboard with new data
      } else {
        setSyncResult(`❌ ${data.error || "Sync failed"}`);
      }
    } catch {
      setSyncResult("❌ Network error during sync");
    } finally {
      setSyncing(false);
    }
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner" />
        <span>Loading dashboard...</span>
      </div>
    );
  }

  return (
    <>
      <div className="page-header" style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div>
          <h1>Admin Overview</h1>
          <p>Monitor all publisher performance at a glance</p>
        </div>
        <button
          className="btn btn-primary"
          onClick={handleSync}
          disabled={syncing}
          style={{ flexShrink: 0 }}
        >
          {syncing ? (
            <>
              <span className="spinner" />
              Syncing Shopify...
            </>
          ) : (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
              </svg>
              Sync from Shopify
            </>
          )}
        </button>
      </div>

      {syncResult && (
        <div className={`toast ${syncResult.startsWith("✅") ? "success" : "error"}`} style={{ position: "relative", bottom: "auto", right: "auto", marginBottom: "1.5rem" }}>
          {syncResult}
        </div>
      )}

      <div className="stats-grid">
        <div className="stat-card blue">
          <div className="stat-header">
            <span className="stat-label">Total Revenue</span>
            <div className="stat-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
              </svg>
            </div>
          </div>
          <div className="stat-value">RM {summary?.totalRevenue?.toLocaleString() || 0}</div>
          <div className="stat-sub">From all tracked products</div>
        </div>

        <div className="stat-card green">
          <div className="stat-header">
            <span className="stat-label">Units Sold</span>
            <div className="stat-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" /><line x1="3" y1="6" x2="21" y2="6" /><path d="M16 10a4 4 0 0 1-8 0" />
              </svg>
            </div>
          </div>
          <div className="stat-value">{summary?.totalUnits?.toLocaleString() || 0}</div>
          <div className="stat-sub">Total quantity across all orders</div>
        </div>

        <div className="stat-card purple">
          <div className="stat-header">
            <span className="stat-label">Total Orders</span>
            <div className="stat-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
              </svg>
            </div>
          </div>
          <div className="stat-value">{summary?.totalOrders || 0}</div>
          <div className="stat-sub">Unique orders containing tracked products</div>
        </div>

        <div className="stat-card amber">
          <div className="stat-header">
            <span className="stat-label">Publishers</span>
            <div className="stat-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
              </svg>
            </div>
          </div>
          <div className="stat-value">{publishers.length}</div>
          <div className="stat-sub">Active collaborators</div>
        </div>
      </div>

      <div className="chart-row">
        <div className="card">
          <div className="card-header">
            <h2>Sales Channel Split</h2>
          </div>
          <div style={{ display: "flex", gap: "2rem", padding: "1rem 0" }}>
            <div style={{ flex: 1, textAlign: "center" }}>
              <div style={{ fontSize: "2rem", fontWeight: 800, color: "var(--accent-blue)" }}>
                {summary?.onlineOrders || 0}
              </div>
              <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>Online Orders</div>
            </div>
            <div style={{ width: "1px", background: "var(--border-subtle)" }} />
            <div style={{ flex: 1, textAlign: "center" }}>
              <div style={{ fontSize: "2rem", fontWeight: 800, color: "var(--accent-purple)" }}>
                {summary?.posOrders || 0}
              </div>
              <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>POS Orders</div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h2>Publisher Summary</h2>
          </div>
          {publishers.length === 0 ? (
            <div className="empty-state">
              <h3>No Publishers Yet</h3>
              <p>Add publishers from the Publishers page</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {publishers.slice(0, 5).map((pub) => (
                <div key={pub.id} style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "0.5rem 0.75rem", background: "var(--bg-input)", borderRadius: "var(--radius-sm)",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: "50%", background: "var(--gradient-accent)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: "0.7rem", fontWeight: 700, color: "#0a0e1a"
                    }}>
                      {pub.name.charAt(0).toUpperCase()}
                    </div>
                    <span style={{ fontSize: "0.85rem", fontWeight: 500 }}>{pub.name}</span>
                  </div>
                  <span className="badge badge-success">{pub.productCount} products</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="card" style={{ marginTop: "0.5rem" }}>
        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", textAlign: "center" }}>
          💡 Data is loaded from cache. Click <strong>&quot;Sync from Shopify&quot;</strong> to pull latest orders & products.
        </div>
      </div>
    </>
  );
}
