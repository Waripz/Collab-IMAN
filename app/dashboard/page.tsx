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
  discount: number;
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
  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [productSearchQuery, setProductSearchQuery] = useState("");
  const itemsPerPage = 25;

  // Date range — default last 30 days
  const today = new Date();
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(today.getDate() - 30);

  const [fromDate, setFromDate] = useState(thirtyDaysAgo.toISOString().split("T")[0]);
  const [toDate, setToDate] = useState(today.toISOString().split("T")[0]);
  const [activePreset, setActivePreset] = useState<string>("30");

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
        setCurrentPage(1); // Reset page on new data
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchOrders(fromDate, toDate);
  }, []);

  const handleFilter = () => {
    setActivePreset("custom");
    fetchOrders(fromDate, toDate);
  };

  const setPreset = (days: number) => {
    const end = new Date();
    const start = new Date(end);
    start.setDate(end.getDate() - days);
    const from = start.toISOString().split("T")[0];
    const to = end.toISOString().split("T")[0];
    setFromDate(from);
    setToDate(to);
    setActivePreset(String(days));
    fetchOrders(from, to);
  };

  const setAllTime = () => {
    const from = "2020-01-01";
    const to = new Date().toISOString().split("T")[0];
    setFromDate(from);
    setToDate(to);
    setActivePreset("all");
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

  // Product breakdown by ID (with discounts)
  // Note: item.price is BEFORE discounts, so price×qty = gross
  const productIdMap = new Map<number, { name: string; units: number; gross: number; discount: number }>();
  for (const item of orders) {
    const existing = productIdMap.get(item.productId) || { name: item.productName, units: 0, gross: 0, discount: 0 };
    productIdMap.set(item.productId, {
      name: existing.name,
      units: existing.units + item.quantity,
      gross: existing.gross + item.price * item.quantity,
      discount: existing.discount + (item.discount || 0),
    });
  }

  const products = Array.from(productIdMap.values()).sort((a, b) => (b.gross - b.discount) - (a.gross - a.discount));

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
      label: "Net Sales (RM)",
      data: products.map((p) => Math.round((p.gross - p.discount) * 100) / 100),
      backgroundColor: productColors.slice(0, products.length),
      borderRadius: 4,
      borderSkipped: false as const,
    }],
  };

  const avgOrderValue = summary && summary.totalOrders > 0
    ? (summary.totalRevenue / summary.totalOrders).toFixed(2) : "0.00";

  const filteredProducts = productSearchQuery.trim()
    ? products.filter(p => p.name.toLowerCase().includes(productSearchQuery.toLowerCase()))
    : products;

  const filteredSummary = {
    units: filteredProducts.reduce((sum, p) => sum + p.units, 0),
    gross: filteredProducts.reduce((sum, p) => sum + p.gross, 0),
    discount: filteredProducts.reduce((sum, p) => sum + p.discount, 0),
    net: filteredProducts.reduce((sum, p) => sum + (p.gross - p.discount), 0),
  };

  const downloadCSV = () => {
    const headers = ["Product Title", "Items Sold", "Gross Sales (RM)", "Discounts (RM)", "Net Sales (RM)", "Total Sales (RM)"];
    const rows = filteredProducts.map((p) => {
      const net = p.gross - p.discount;
      return [
        `"${p.name.replace(/"/g, '""')}"`,
        p.units,
        p.gross.toFixed(2),
        p.discount > 0 ? `-${p.discount.toFixed(2)}` : "0.00",
        net.toFixed(2),
        net.toFixed(2),
      ].join(",");
    });
    // Add summary row
    const summaryRow = [
      "Summary",
      filteredSummary.units,
      filteredSummary.gross.toFixed(2),
      `-${filteredSummary.discount.toFixed(2)}`,
      filteredSummary.net.toFixed(2),
      filteredSummary.net.toFixed(2),
    ].join(",");

    const csv = [headers.join(","), summaryRow, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sales-breakdown_${fromDate}_to_${toDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

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
              <button key={d} className={`btn btn-sm ${activePreset === String(d) ? "btn-primary" : "btn-secondary"}`} onClick={() => setPreset(d)} disabled={loading}
                style={activePreset === String(d) ? { fontSize: "0.7rem", padding: "0.3rem 0.6rem" } : { fontSize: "0.7rem", padding: "0.3rem 0.6rem", background: "#fff", color: "#3d3d3d", border: "1px solid #c9cccf" }}>
                {d === 365 ? "1 Year" : `${d}D`}
              </button>
            ))}
            <button className={`btn btn-sm ${activePreset === "all" ? "btn-primary" : "btn-secondary"}`} onClick={setAllTime} disabled={loading}
              style={activePreset === "all" ? { fontSize: "0.7rem", padding: "0.3rem 0.6rem" } : { fontSize: "0.7rem", padding: "0.3rem 0.6rem", background: "#fff", color: "#3d3d3d", border: "1px solid #c9cccf" }}>
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
                    RM {(p.gross - p.discount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Total Sales Breakdown — Shopify Report Style */}
      <div className="card">
        <div className="card-header" style={{ flexWrap: "wrap", gap: "1rem" }}>
          <h2>Total sales breakdown</h2>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <div style={{ position: "relative" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)" }}>
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                placeholder="Search products..."
                value={productSearchQuery}
                onChange={(e) => setProductSearchQuery(e.target.value)}
                style={{ padding: "0.4rem 0.6rem 0.4rem 1.8rem", border: "1px solid #e3e3e3", borderRadius: "6px", fontSize: "0.82rem", outline: "none", width: "200px", color: "#1a1c1e", background: "white" }}
              />
            </div>
            <button className="btn btn-secondary btn-sm" onClick={downloadCSV} style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Download CSV
            </button>
          </div>
        </div>
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Product title</th>
                <th style={{ textAlign: "right" }}>Items sold</th>
                <th style={{ textAlign: "right" }}>Gross sales</th>
                <th style={{ textAlign: "right" }}>Discounts</th>
                <th style={{ textAlign: "right" }}>Net sales</th>
                <th style={{ textAlign: "right" }}>Total sales</th>
              </tr>
            </thead>
            <tbody>
              {/* Summary Row */}
              {filteredProducts.length > 0 && (
                <tr style={{ fontWeight: 600, background: "#f9fafb" }}>
                  <td style={{ fontWeight: 700, color: "#1a1c1e" }}>Summary</td>
                  <td style={{ textAlign: "right", color: "#1a1c1e" }}>{filteredSummary.units}</td>
                  <td style={{ textAlign: "right", color: "#1a1c1e" }}>RM {filteredSummary.gross.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  <td style={{ textAlign: "right", color: "#dc2626" }}>-RM {filteredSummary.discount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  <td style={{ textAlign: "right", color: "#1a1c1e" }}>RM {filteredSummary.net.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  <td style={{ textAlign: "right", color: "#1a1c1e", fontWeight: 700 }}>RM {filteredSummary.net.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                </tr>
              )}
              {/* Product Rows */}
              {filteredProducts.length > 0 ? filteredProducts.map((p) => {
                const net = p.gross - p.discount;
                return (
                  <tr key={p.name}>
                    <td style={{ fontWeight: 500 }}>{p.name}</td>
                    <td style={{ textAlign: "right" }}>{p.units}</td>
                    <td style={{ textAlign: "right" }}>RM {p.gross.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    <td style={{ textAlign: "right", color: p.discount > 0 ? "#dc2626" : undefined }}>
                      {p.discount > 0 ? "-" : ""}RM {p.discount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td style={{ textAlign: "right" }}>RM {net.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    <td style={{ textAlign: "right", fontWeight: 600 }}>RM {net.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  </tr>
                );
              }) : (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: "2rem", color: "#616161" }}>
                    No products found matching "{productSearchQuery}"
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Order History (Paginated) */}
      {(() => {
        const filteredOrders = searchQuery.trim()
          ? orders.filter(o => o.orderNumber.toLowerCase().includes(searchQuery.toLowerCase().replace("#", "")))
          : orders;
        const totalPages = Math.ceil(filteredOrders.length / itemsPerPage);
        const safePage = Math.min(currentPage, totalPages || 1);

        // Build page numbers: show max 7 pages with ellipsis
        const getPageNumbers = () => {
          const pages: (number | string)[] = [];
          if (totalPages <= 7) {
            for (let i = 1; i <= totalPages; i++) pages.push(i);
          } else {
            pages.push(1);
            if (safePage > 3) pages.push("...");
            const start = Math.max(2, safePage - 1);
            const end = Math.min(totalPages - 1, safePage + 1);
            for (let i = start; i <= end; i++) pages.push(i);
            if (safePage < totalPages - 2) pages.push("...");
            pages.push(totalPages);
          }
          return pages;
        };

        const btnBase = { padding: "0.3rem 0.6rem", border: "1px solid #e3e3e3", borderRadius: "4px", fontSize: "0.8rem", cursor: "pointer", background: "white", color: "#3d3d3d" };
        const btnActive = { ...btnBase, background: "#e91e8c", color: "white", border: "1px solid #e91e8c", fontWeight: 600 };
        const btnDisabled = { ...btnBase, background: "#f9fafb", cursor: "not-allowed", color: "#c0c0c0" };

        return (
          <div className="card">
            <div className="card-header" style={{ flexDirection: "column", alignItems: "stretch", gap: "0.75rem" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.75rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                  <h2>Order History</h2>
                  {filteredOrders.length > 0 && (
                    <span style={{ fontSize: "0.8rem", color: "#616161", fontWeight: 400 }}>
                      Showing {(safePage - 1) * itemsPerPage + 1}–{Math.min(safePage * itemsPerPage, filteredOrders.length)} of {filteredOrders.length}
                    </span>
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  {/* Search */}
                  <div style={{ position: "relative" }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)" }}>
                      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                    <input
                      type="text"
                      placeholder="Search order ID..."
                      value={searchQuery}
                      onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                      style={{ padding: "0.4rem 0.6rem 0.4rem 1.8rem", border: "1px solid #e3e3e3", borderRadius: "6px", fontSize: "0.82rem", outline: "none", width: "170px", color: "#1a1c1e", background: "white" }}
                    />
                  </div>
                </div>
              </div>
              {/* Pagination */}
              {totalPages > 1 && (
                <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", flexWrap: "wrap" }}>
                  <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={safePage === 1}
                    style={safePage === 1 ? btnDisabled : btnBase}>Previous</button>
                  {getPageNumbers().map((p, i) =>
                    typeof p === "string" ? (
                      <span key={`ellipsis-${i}`} style={{ padding: "0 0.3rem", color: "#9ca3af", fontSize: "0.8rem" }}>…</span>
                    ) : (
                      <button key={p} onClick={() => setCurrentPage(p)} style={p === safePage ? btnActive : btnBase}>{p}</button>
                    )
                  )}
                  <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={safePage >= totalPages}
                    style={safePage >= totalPages ? btnDisabled : btnBase}>Next</button>
                </div>
              )}
            </div>
            {filteredOrders.length === 0 ? (
              <div className="empty-state">
                <h3>{searchQuery ? "No matching orders" : "No orders found"}</h3>
                <p>{searchQuery ? `No orders matching "${searchQuery}"` : "Try adjusting the date range"}</p>
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
                      <th style={{ textAlign: "right" }}>Price (RM)</th>
                      <th style={{ textAlign: "right" }}>Discount (RM)</th>
                      <th>Channel</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredOrders.slice((safePage - 1) * itemsPerPage, safePage * itemsPerPage).map((order, i) => (
                      <tr key={`${order.orderNumber}-${order.productId}-${i}`}>
                        <td>{new Date(order.date).toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" })}</td>
                        <td style={{ fontWeight: 500 }}>#{order.orderNumber.replace("#", "")}</td>
                        <td>{order.productName}</td>
                        <td>{order.quantity}</td>
                        <td style={{ textAlign: "right" }}>RM {(order.price * order.quantity).toFixed(2)}</td>
                        <td style={{ textAlign: "right", color: order.discount > 0 ? "#dc2626" : undefined }}>
                          {order.discount > 0 ? `-RM ${order.discount.toFixed(2)}` : "RM 0.00"}
                        </td>
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
        );
      })()}
    </>
  );
}
