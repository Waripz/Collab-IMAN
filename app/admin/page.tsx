"use client";

import { useEffect, useState } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import { Bar, Line } from "react-chartjs-2";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface OrderItem {
  date: string;
  orderNumber: string;
  productName: string;
  productId: number;
  quantity: number;
  price: number;
  channel: string;
}

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
  const [orders, setOrders] = useState<OrderItem[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [publishers, setPublishers] = useState<Publisher[]>([]);
  const [loading, setLoading] = useState(true);

  // Date range — default last 30 days
  const today = new Date();
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(today.getDate() - 30);

  const [fromDate, setFromDate] = useState(thirtyDaysAgo.toISOString().split("T")[0]);
  const [toDate, setToDate] = useState(today.toISOString().split("T")[0]);

  const fetchData = (from: string, to: string) => {
    setLoading(true);
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);

    Promise.all([
      fetch(`/api/shopify/orders?${params.toString()}`).then((r) => r.json()),
      fetch("/api/admin/publishers").then((r) => r.json()),
    ])
      .then(([ordersData, pubData]) => {
        setOrders(ordersData.orders || []);
        setSummary(ordersData.summary);
        setPublishers(pubData.publishers || []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchData(fromDate, toDate);
  }, []);

  const handleFilter = () => fetchData(fromDate, toDate);

  const setPreset = (days: number) => {
    const end = new Date();
    const start = new Date(end);
    start.setDate(end.getDate() - days);
    const from = start.toISOString().split("T")[0];
    const to = end.toISOString().split("T")[0];
    setFromDate(from);
    setToDate(to);
    fetchData(from, to);
  };

  const setAllTime = () => {
    const from = "2020-01-01";
    const to = new Date().toISOString().split("T")[0];
    setFromDate(from);
    setToDate(to);
    fetchData(from, to);
  };

  // --- Chart Data Preparation ---

  const chartColors = [
    "rgba(233, 30, 140, 0.8)",
    "rgba(56, 189, 248, 0.8)",
    "rgba(167, 139, 250, 0.8)",
    "rgba(52, 211, 153, 0.8)",
    "rgba(251, 191, 36, 0.8)",
    "rgba(251, 113, 133, 0.8)",
    "rgba(34, 211, 238, 0.8)",
    "rgba(249, 115, 22, 0.8)",
    "rgba(132, 204, 22, 0.8)",
    "rgba(244, 63, 94, 0.8)",
  ];

  // Total sales by product
  const productMap = new Map<string, number>();
  for (const item of orders) {
    const rev = (productMap.get(item.productName) || 0) + item.price * item.quantity;
    productMap.set(item.productName, rev);
  }
  const sortedProducts = [...productMap.entries()].sort((a, b) => b[1] - a[1]);

  const salesByProductData = {
    labels: sortedProducts.map(([name]) => name.length > 40 ? name.slice(0, 40) + "..." : name),
    datasets: [{
      label: "Revenue (RM)",
      data: sortedProducts.map(([, rev]) => Math.round(rev * 100) / 100),
      backgroundColor: chartColors.slice(0, sortedProducts.length),
      borderRadius: 6,
      borderSkipped: false as const,
    }],
  };

  // Sales over time (group by date)
  const dailySales = new Map<string, number>();
  const dailyOrderCounts = new Map<string, Set<string>>();

  for (const item of orders) {
    const day = new Date(item.date).toISOString().split("T")[0];
    dailySales.set(day, (dailySales.get(day) || 0) + item.price * item.quantity);
    if (!dailyOrderCounts.has(day)) dailyOrderCounts.set(day, new Set());
    dailyOrderCounts.get(day)!.add(item.orderNumber);
  }

  const sortedDays = [...dailySales.keys()].sort();

  const salesOverTimeData = {
    labels: sortedDays.map((d) => {
      const date = new Date(d);
      return date.toLocaleDateString("en-MY", { day: "numeric", month: "short" });
    }),
    datasets: [{
      label: "Sales (RM)",
      data: sortedDays.map((d) => Math.round((dailySales.get(d) || 0) * 100) / 100),
      borderColor: "rgba(233, 30, 140, 1)",
      backgroundColor: "rgba(233, 30, 140, 0.1)",
      fill: true,
      tension: 0.3,
      pointRadius: sortedDays.length > 30 ? 0 : 3,
      pointHoverRadius: 5,
      borderWidth: 2,
    }],
  };

  // Average order value over time
  const dailyAOV = sortedDays.map((day) => {
    const revenue = dailySales.get(day) || 0;
    const orderCount = dailyOrderCounts.get(day)?.size || 1;
    return Math.round((revenue / orderCount) * 100) / 100;
  });

  const aovOverTimeData = {
    labels: sortedDays.map((d) => {
      const date = new Date(d);
      return date.toLocaleDateString("en-MY", { day: "numeric", month: "short" });
    }),
    datasets: [{
      label: "Avg Order Value (RM)",
      data: dailyAOV,
      borderColor: "rgba(56, 189, 248, 1)",
      backgroundColor: "rgba(56, 189, 248, 0.1)",
      fill: true,
      tension: 0.3,
      pointRadius: sortedDays.length > 30 ? 0 : 3,
      pointHoverRadius: 5,
      borderWidth: 2,
    }],
  };

  // Chart options
  const lineOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: "rgba(17, 24, 39, 0.95)",
        titleColor: "#f1f5f9",
        bodyColor: "#94a3b8",
        borderColor: "rgba(148, 163, 184, 0.1)",
        borderWidth: 1,
        padding: 12,
        cornerRadius: 8,
      },
    },
    scales: {
      x: {
        ticks: { color: "#64748b", font: { size: 10 }, maxRotation: 45 },
        grid: { display: false },
        border: { display: false },
      },
      y: {
        ticks: { color: "#64748b", font: { size: 11 }, callback: (v: string | number) => `RM ${v}` },
        grid: { color: "rgba(148, 163, 184, 0.06)" },
        border: { display: false },
      },
    },
  };

  const barOptions = {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: "y" as const,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: "rgba(17, 24, 39, 0.95)",
        titleColor: "#f1f5f9",
        bodyColor: "#94a3b8",
        padding: 12,
        cornerRadius: 8,
        callbacks: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          label: (ctx: any) => `RM ${(ctx.parsed.x ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
        },
      },
    },
    scales: {
      x: {
        ticks: { color: "#64748b", font: { size: 11 }, callback: (v: string | number) => `RM ${v}` },
        grid: { color: "rgba(148, 163, 184, 0.06)" },
        border: { display: false },
      },
      y: {
        ticks: { color: "#94a3b8", font: { size: 11 } },
        grid: { display: false },
        border: { display: false },
      },
    },
  };

  if (loading) {
    return (
      <div className="loading-container" style={{ minHeight: "60vh" }}>
        <div className="spinner" />
        <span>Loading dashboard data...</span>
      </div>
    );
  }

  return (
    <>
      <div className="page-header">
        <h1>Admin Overview</h1>
        <p>Real-time performance analytics</p>
      </div>

      {/* Date Range Filter */}
      <div className="card" style={{ marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <label style={{ fontSize: "0.8rem", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>From</label>
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)}
              style={{ padding: "0.45rem 0.65rem", background: "var(--bg-input)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-sm)", color: "var(--text-primary)", fontSize: "0.85rem", outline: "none", colorScheme: "dark" }} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <label style={{ fontSize: "0.8rem", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>To</label>
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)}
              style={{ padding: "0.45rem 0.65rem", background: "var(--bg-input)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-sm)", color: "var(--text-primary)", fontSize: "0.85rem", outline: "none", colorScheme: "dark" }} />
          </div>
          <button className="btn btn-primary btn-sm" onClick={handleFilter} disabled={loading}>
            {loading ? "Loading..." : "Apply"}
          </button>
          <div style={{ borderLeft: "1px solid var(--border-subtle)", height: "24px" }} />
          <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
            {[7, 30, 90, 365].map((d) => (
              <button key={d} className="btn btn-secondary btn-sm" onClick={() => setPreset(d)} disabled={loading}
                style={{ fontSize: "0.7rem", padding: "0.3rem 0.6rem" }}>
                {d === 365 ? "1 Year" : `${d}D`}
              </button>
            ))}
            <button className="btn btn-secondary btn-sm" onClick={setAllTime} disabled={loading}
              style={{ fontSize: "0.7rem", padding: "0.3rem 0.6rem" }}>All Time</button>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="stats-grid">
        <div className="stat-card pink">
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
                <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" /><line x1="3" y1="6" x2="21" y2="6" />
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
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
              </svg>
            </div>
          </div>
          <div className="stat-value">{summary?.totalOrders || 0}</div>
          <div className="stat-sub">Unique orders containing tracked products</div>
        </div>

        <div className="stat-card amber">
          <div className="stat-header">
            <span className="stat-label">Colaborators</span>
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

      {/* Sales Over Time */}
      <div className="card">
        <div className="card-header">
          <h2>Total Sales Over Time</h2>
          <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
            RM {summary?.totalRevenue?.toLocaleString() || 0} total
          </span>
        </div>
        <div className="chart-container">
          {sortedDays.length > 0 ? (
            <Line data={salesOverTimeData} options={lineOptions} />
          ) : (
            <div className="empty-state"><h3>No data for this period</h3></div>
          )}
        </div>
      </div>

      {/* Sales by Product + AOV side by side */}
      <div className="chart-row">
        <div className="card">
          <div className="card-header">
            <h2>Total Sales by Product</h2>
          </div>
          <div className="chart-container" style={{ height: Math.max(200, sortedProducts.length * 45) }}>
            {sortedProducts.length > 0 ? (
              <Bar data={salesByProductData} options={barOptions} />
            ) : (
              <div className="empty-state"><h3>No product data</h3></div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h2>Avg Order Value Over Time</h2>
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
              RM {summary && summary.totalOrders > 0 ? (summary.totalRevenue / summary.totalOrders).toFixed(2) : "0"} avg
            </span>
          </div>
          <div className="chart-container">
            {sortedDays.length > 0 ? (
              <Line data={aovOverTimeData} options={lineOptions} />
            ) : (
              <div className="empty-state"><h3>No data</h3></div>
            )}
          </div>
        </div>
      </div>

      {/* Colaborator Summary */}
      <div className="card">
        <div className="card-header">
          <h2>Colaborator Summary</h2>
        </div>
        {publishers.length === 0 ? (
          <div className="empty-state">
            <h3>No Colaborator Yet</h3>
            <p>Add publishers from the Colaborators page</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {publishers.map((pub) => (
              <div key={pub.id} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "0.5rem 0.75rem", background: "var(--bg-input)", borderRadius: "var(--radius-sm)",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: "50%", background: "var(--gradient-accent)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: "0.7rem", fontWeight: 700, color: "white"
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
    </>
  );
}
