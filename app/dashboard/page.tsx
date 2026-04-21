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
  grossSales: number;
  totalDiscounts: number;
  netSales: number;
  totalOrders: number;
  onlineOrders: number;
  posOrders: number;
}

export default function PublisherDashboard() {
  const [orders, setOrders] = useState<OrderItem[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"overview" | "orders">("overview");

  // Date range — default last 30 days
  const today = new Date();
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(today.getDate() - 30);

  const [fromDate, setFromDate] = useState(thirtyDaysAgo.toISOString().split("T")[0]);
  const [toDate, setToDate] = useState(today.toISOString().split("T")[0]);

  const fetchOrders = (from: string, to: string) => {
    setLoading(true);
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);

    fetch(`/api/shopify/orders?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => {
        setOrders(data.orders || []);
        setSummary(data.summary);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchOrders(fromDate, toDate);
  }, []);

  const handleFilter = () => fetchOrders(fromDate, toDate);

  const setPreset = (days: number) => {
    const end = new Date();
    const start = new Date(end);
    start.setDate(end.getDate() - days);
    const from = start.toISOString().split("T")[0];
    const to = end.toISOString().split("T")[0];
    setFromDate(from);
    setToDate(to);
    fetchOrders(from, to);
  };

  const setAllTime = () => {
    const from = "2020-01-01";
    const to = new Date().toISOString().split("T")[0];
    setFromDate(from);
    setToDate(to);
    fetchOrders(from, to);
  };

  if (loading) {
    return (
      <div className="loading-container" style={{ minHeight: "60vh" }}>
        <div className="spinner" />
        <span>Loading your performance data...</span>
      </div>
    );
  }

  // --- Data Preparation ---

  // Product breakdown by ID
  const productIdMap = new Map<number, { name: string; units: number; revenue: number }>();
  for (const item of orders) {
    const existing = productIdMap.get(item.productId) || { name: item.productName, units: 0, revenue: 0 };
    productIdMap.set(item.productId, {
      name: existing.name,
      units: existing.units + item.quantity,
      revenue: existing.revenue + item.price * item.quantity,
    });
  }

  const products = Array.from(productIdMap.values()).sort((a, b) => b.revenue - a.revenue);

  // Daily sales + AOV
  const dailySales = new Map<string, number>();
  const dailyOrderCounts = new Map<string, Set<string>>();

  for (const item of orders) {
    const day = new Date(item.date).toISOString().split("T")[0];
    dailySales.set(day, (dailySales.get(day) || 0) + item.price * item.quantity);
    if (!dailyOrderCounts.has(day)) dailyOrderCounts.set(day, new Set());
    dailyOrderCounts.get(day)!.add(item.orderNumber);
  }

  const sortedDays = [...dailySales.keys()].sort();
  const dayLabels = sortedDays.map((d) => new Date(d).toLocaleDateString("en-MY", { day: "numeric", month: "short" }));

  // Shopify-style chart options
  const lineChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: "#1a1c1e",
        titleColor: "#fff",
        bodyColor: "#ddd",
        padding: 10,
        cornerRadius: 6,
        displayColors: false,
      },
    },
    scales: {
      x: {
        ticks: { color: "#8c9196", font: { size: 10 }, maxRotation: 45 },
        grid: { display: false },
        border: { display: false },
      },
      y: {
        ticks: { color: "#8c9196", font: { size: 11 }, callback: (v: string | number) => `RM ${v}` },
        grid: { color: "#e3e3e3" },
        border: { display: false },
      },
    },
  };

  const barChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: "y" as const,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: "#1a1c1e",
        titleColor: "#fff",
        bodyColor: "#ddd",
        padding: 10,
        cornerRadius: 6,
        callbacks: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          label: (ctx: any) => `RM ${(ctx.parsed.x ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
        },
      },
    },
    scales: {
      x: {
        ticks: { color: "#8c9196", font: { size: 11 }, callback: (v: string | number) => `RM ${v}` },
        grid: { color: "#e3e3e3" },
        border: { display: false },
      },
      y: {
        ticks: { color: "#3d3d3d", font: { size: 11 } },
        grid: { display: false },
        border: { display: false },
      },
    },
  };

  // Chart data
  const salesOverTimeData = {
    labels: dayLabels,
    datasets: [{
      label: "Sales (RM)",
      data: sortedDays.map((d) => Math.round((dailySales.get(d) || 0) * 100) / 100),
      borderColor: "#1a73e8",
      backgroundColor: "rgba(26, 115, 232, 0.08)",
      fill: true,
      tension: 0.3,
      pointRadius: sortedDays.length > 30 ? 0 : 3,
      pointBackgroundColor: "#1a73e8",
      pointHoverRadius: 5,
      borderWidth: 2,
    }],
  };

  const aovData = {
    labels: dayLabels,
    datasets: [{
      label: "Avg Order Value (RM)",
      data: sortedDays.map((day) => {
        const revenue = dailySales.get(day) || 0;
        const count = dailyOrderCounts.get(day)?.size || 1;
        return Math.round((revenue / count) * 100) / 100;
      }),
      borderColor: "#0d9488",
      backgroundColor: "rgba(13, 148, 136, 0.08)",
      fill: true,
      tension: 0.3,
      pointRadius: sortedDays.length > 30 ? 0 : 3,
      pointBackgroundColor: "#0d9488",
      pointHoverRadius: 5,
      borderWidth: 2,
    }],
  };

  const productColors = ["#1a73e8", "#0d9488", "#7c3aed", "#d97706", "#e91e8c", "#dc2626", "#059669", "#6366f1"];

  const salesByProductData = {
    labels: products.map((p) => p.name.length > 50 ? p.name.slice(0, 50) + "..." : p.name),
    datasets: [{
      label: "Revenue (RM)",
      data: products.map((p) => Math.round(p.revenue * 100) / 100),
      backgroundColor: productColors.slice(0, products.length),
      borderRadius: 4,
      borderSkipped: false as const,
    }],
  };

  const avgOrderValue = summary && summary.totalOrders > 0
    ? (summary.totalRevenue / summary.totalOrders).toFixed(2) : "0.00";

  return (
    <>
      <div className="page-header">
        <h1>Products Performance</h1>
        <p>Sales data for your assigned products</p>
      </div>

      {/* Date Range Filter */}
      <div className="card" style={{ marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <label style={{ fontSize: "0.8rem", color: "#616161", whiteSpace: "nowrap" }}>From</label>
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)}
              style={{ padding: "0.45rem 0.65rem", background: "#fff", border: "1px solid #c9cccf", borderRadius: "var(--radius-sm)", color: "#1a1c1e", fontSize: "0.85rem", outline: "none" }} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <label style={{ fontSize: "0.8rem", color: "#616161", whiteSpace: "nowrap" }}>To</label>
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)}
              style={{ padding: "0.45rem 0.65rem", background: "#fff", border: "1px solid #c9cccf", borderRadius: "var(--radius-sm)", color: "#1a1c1e", fontSize: "0.85rem", outline: "none" }} />
          </div>
          <button className="btn btn-primary btn-sm" onClick={handleFilter} disabled={loading}>
            {loading ? "Loading..." : "Apply"}
          </button>
          <div style={{ borderLeft: "1px solid #c9cccf", height: "24px" }} />
          <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
            {[7, 30, 90, 365].map((d) => (
              <button key={d} className="btn btn-secondary btn-sm" onClick={() => setPreset(d)} disabled={loading}
                style={{ fontSize: "0.7rem", padding: "0.3rem 0.6rem", background: "#fff", color: "#3d3d3d", border: "1px solid #c9cccf" }}>
                {d === 365 ? "1 Year" : `${d}D`}
              </button>
            ))}
            <button className="btn btn-secondary btn-sm" onClick={setAllTime} disabled={loading}
              style={{ fontSize: "0.7rem", padding: "0.3rem 0.6rem", background: "#fff", color: "#3d3d3d", border: "1px solid #c9cccf" }}>
              All Time
            </button>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
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
        </div>

        <div className="stat-card purple">
          <div className="stat-header">
            <span className="stat-label">Orders</span>
            <div className="stat-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
              </svg>
            </div>
          </div>
          <div className="stat-value">{summary?.totalOrders || 0}</div>
        </div>

        <div className="stat-card amber">
          <div className="stat-header">
            <span className="stat-label">Products</span>
            <div className="stat-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
              </svg>
            </div>
          </div>
          <div className="stat-value">{productIdMap.size}</div>
        </div>
      </div>

      {/* Shopify-style Charts */}

      {/* 1. Total Sales Over Time */}
      <div className="card">
        <div className="card-header">
          <div>
            <h2>Total sales over time</h2>
            <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#1a1c1e", marginTop: "0.25rem" }}>
              RM {summary?.totalRevenue?.toLocaleString(undefined, { minimumFractionDigits: 2 }) || "0.00"}
            </div>
          </div>
        </div>
        <div className="chart-container">
          {sortedDays.length > 0 ? (
            <Line data={salesOverTimeData} options={lineChartOptions} />
          ) : (
            <div className="empty-state"><h3>No data for this period</h3></div>
          )}
        </div>
      </div>

      {/* 2. AOV + Sales by Product row */}
      <div className="chart-row">
        <div className="card">
          <div className="card-header">
            <div>
              <h2>Average order value over time</h2>
              <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "#1a1c1e", marginTop: "0.25rem" }}>
                RM {avgOrderValue}
              </div>
            </div>
          </div>
          <div className="chart-container">
            {sortedDays.length > 0 ? (
              <Line data={aovData} options={lineChartOptions} />
            ) : (
              <div className="empty-state"><h3>No data</h3></div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h2>Total sales by product</h2>
          </div>
          <div className="chart-container" style={{ height: Math.max(200, products.length * 50) }}>
            {products.length > 0 ? (
              <Bar data={salesByProductData} options={barChartOptions} />
            ) : (
              <div className="empty-state"><h3>No product data</h3></div>
            )}
          </div>
          {/* Product Breakdown Table */}
          {products.length > 0 && (
            <div style={{ marginTop: "1rem", borderTop: "1px solid #e3e3e3", paddingTop: "1rem" }}>
              {products.map((p, i) => (
                <div key={p.name} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "0.4rem 0", borderBottom: i < products.length - 1 ? "1px solid #f1f1f1" : "none",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <div style={{ width: 10, height: 10, borderRadius: 2, background: productColors[i] || "#ccc" }} />
                    <span style={{ fontSize: "0.78rem", color: "#3d3d3d" }}>{p.name}</span>
                  </div>
                  <span style={{ fontSize: "0.78rem", fontWeight: 600, color: "#1a1c1e" }}>
                    RM {p.revenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Total Sales Breakdown */}
      <div className="card">
        <div className="card-header">
          <h2>Total sales breakdown</h2>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          {[
            { label: "Gross sales", value: summary?.grossSales || 0, color: "#1a73e8" },
            { label: "Discounts", value: -(summary?.totalDiscounts || 0), color: "#dc2626", isNegative: true },
            { label: "Net sales", value: summary?.netSales || 0, color: "#1a1c1e", bold: true },
            { label: "Total sales", value: summary?.totalRevenue || 0, color: "#1a1c1e", bold: true, border: true },
          ].map((row, i) => (
            <div key={row.label} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "0.75rem 0",
              borderTop: i > 0 ? "1px solid #e3e3e3" : "none",
              ...(row.border ? { borderTop: "2px solid #1a1c1e", marginTop: "0.25rem" } : {}),
            }}>
              <span style={{
                fontSize: "0.85rem",
                color: row.isNegative ? "#dc2626" : row.bold ? "#1a1c1e" : "#616161",
                fontWeight: row.bold ? 600 : 400,
              }}>
                {row.label}
              </span>
              <span style={{
                fontSize: "0.85rem",
                fontWeight: row.bold ? 700 : 500,
                color: row.isNegative ? "#dc2626" : "#1a1c1e",
              }}>
                {row.isNegative ? "-" : ""}RM {Math.abs(row.value).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs: Charts & Order History */}
      <div className="tabs">
        <button className={`tab ${activeTab === "overview" ? "active" : ""}`} onClick={() => setActiveTab("overview")}>
          Product Breakdown
        </button>
        <button className={`tab ${activeTab === "orders" ? "active" : ""}`} onClick={() => setActiveTab("orders")}>
          Order History ({summary?.totalOrders || 0})
        </button>
      </div>

      {activeTab === "overview" && (
        <div className="card">
          <div className="card-header">
            <h2>Revenue by Product</h2>
          </div>
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Units</th>
                  <th>Revenue (RM)</th>
                  <th>Avg Price</th>
                </tr>
              </thead>
              <tbody>
                {Array.from(productIdMap.values()).map((data) => (
                  <tr key={data.name}>
                    <td style={{ fontWeight: 500 }}>{data.name}</td>
                    <td>{data.units.toLocaleString()}</td>
                    <td>RM {data.revenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    <td>RM {(data.revenue / data.units).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === "orders" && (
        <div className="card">
          <div className="card-header">
            <h2>Order History</h2>
          </div>
          {orders.length === 0 ? (
            <div className="empty-state">
              <h3>No orders found</h3>
              <p>Try adjusting the date range</p>
            </div>
          ) : (
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Order</th>
                    <th>Product</th>
                    <th>Qty</th>
                    <th>Price (RM)</th>
                    <th>Channel</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order, i) => (
                    <tr key={`${order.orderNumber}-${order.productId}-${i}`}>
                      <td>{new Date(order.date).toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" })}</td>
                      <td style={{ fontWeight: 500 }}>#{order.orderNumber.replace("#", "")}</td>
                      <td>{order.productName}</td>
                      <td>{order.quantity}</td>
                      <td>RM {(order.price * order.quantity).toFixed(2)}</td>
                      <td>
                        <span className={`badge ${order.channel === "Online" ? "badge-online" : "badge-pos"}`}>
                          {order.channel}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </>
  );
}
