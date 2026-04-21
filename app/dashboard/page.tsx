"use client";

import { useEffect, useState, useRef } from "react";
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
import { Bar, Doughnut } from "react-chartjs-2";

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

interface EventData {
  event_name: string;
  start_date: string | null;
  end_date: string | null;
}

export default function PublisherDashboard() {
  const [orders, setOrders] = useState<OrderItem[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [event, setEvent] = useState<EventData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"overview" | "orders">("overview");
  const chartRef = useRef(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/shopify/orders").then((r) => r.json()),
      fetch("/api/admin/event").then((r) => r.json()),
    ])
      .then(([ordersData, eventData]) => {
        setOrders(ordersData.orders || []);
        setSummary(ordersData.summary);
        setEvent(eventData.event);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="loading-container" style={{ minHeight: "60vh" }}>
        <div className="spinner" />
        <span>Loading your performance data...</span>
      </div>
    );
  }

  // --- Chart Data Preparation ---

  // Product breakdown
  const productMap = new Map<string, { units: number; revenue: number }>();
  for (const item of orders) {
    const existing = productMap.get(item.productName) || { units: 0, revenue: 0 };
    productMap.set(item.productName, {
      units: existing.units + item.quantity,
      revenue: existing.revenue + item.price * item.quantity,
    });
  }

  const productNames = Array.from(productMap.keys());
  const productUnits = productNames.map((n) => productMap.get(n)!.units);
  const productRevenue = productNames.map((n) => productMap.get(n)!.revenue);

  const chartColors = [
    "rgba(56, 189, 248, 0.8)",
    "rgba(167, 139, 250, 0.8)",
    "rgba(52, 211, 153, 0.8)",
    "rgba(251, 191, 36, 0.8)",
    "rgba(251, 113, 133, 0.8)",
    "rgba(34, 211, 238, 0.8)",
    "rgba(249, 115, 22, 0.8)",
    "rgba(168, 85, 247, 0.8)",
    "rgba(20, 184, 166, 0.8)",
    "rgba(244, 63, 94, 0.8)",
    "rgba(99, 102, 241, 0.8)",
    "rgba(132, 204, 22, 0.8)",
    "rgba(236, 72, 153, 0.8)",
  ];

  const productBarData = {
    labels: productNames,
    datasets: [
      {
        label: "Units Sold",
        data: productUnits,
        backgroundColor: chartColors.slice(0, productNames.length),
        borderRadius: 6,
        borderSkipped: false as const,
      },
    ],
  };

  const productBarOptions = {
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
        ticks: { color: "#64748b", font: { size: 11 } },
        grid: { display: false },
        border: { display: false },
      },
      y: {
        ticks: { color: "#64748b", font: { size: 11 } },
        grid: { color: "rgba(148, 163, 184, 0.06)" },
        border: { display: false },
      },
    },
  };

  // Channel doughnut
  const channelData = {
    labels: ["Online", "POS"],
    datasets: [
      {
        data: [summary?.onlineOrders || 0, summary?.posOrders || 0],
        backgroundColor: ["rgba(56, 189, 248, 0.8)", "rgba(167, 139, 250, 0.8)"],
        borderColor: ["rgba(56, 189, 248, 1)", "rgba(167, 139, 250, 1)"],
        borderWidth: 2,
        hoverOffset: 6,
      },
    ],
  };

  const channelOptions = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: "65%",
    plugins: {
      legend: {
        position: "bottom" as const,
        labels: {
          color: "#94a3b8",
          padding: 20,
          font: { size: 12 },
          usePointStyle: true,
        },
      },
    },
  };

  // Revenue by product (horizontal bar)
  const revenueBarData = {
    labels: productNames,
    datasets: [
      {
        label: "Revenue (RM)",
        data: productRevenue,
        backgroundColor: chartColors.slice(0, productNames.length).map(
          (c) => c.replace("0.8", "0.6")
        ),
        borderRadius: 6,
        borderSkipped: false as const,
      },
    ],
  };

  const revenueBarOptions = {
    ...productBarOptions,
    indexAxis: "y" as const,
    plugins: {
      ...productBarOptions.plugins,
      legend: { display: false },
    },
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-MY", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  return (
    <>
      {/* Event Banner */}
      {event && event.event_name && (
        <div className="event-banner">
          <div className="event-info">
            <h3>📅 {event.event_name}</h3>
            <p>Your product performance for this event</p>
          </div>
          {(event.start_date || event.end_date) && (
            <div className="event-dates">
              {event.start_date && (
                <div className="event-date">
                  <div className="label">From</div>
                  <div className="value">{formatDate(event.start_date)}</div>
                </div>
              )}
              {event.end_date && (
                <div className="event-date">
                  <div className="label">Until</div>
                  <div className="value">{formatDate(event.end_date)}</div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="page-header">
        <h1>Your Performance</h1>
        <p>Sales data for your assigned products</p>
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
          <div className="stat-value">{productNames.length}</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs">
        <button
          className={`tab ${activeTab === "overview" ? "active" : ""}`}
          onClick={() => setActiveTab("overview")}
        >
          Charts & Breakdown
        </button>
        <button
          className={`tab ${activeTab === "orders" ? "active" : ""}`}
          onClick={() => setActiveTab("orders")}
        >
          Order History ({orders.length})
        </button>
      </div>

      {activeTab === "overview" && (
        <>
          {/* Charts */}
          <div className="chart-row">
            <div className="card">
              <div className="card-header">
                <h2>Units Sold by Product</h2>
              </div>
              <div className="chart-container" ref={chartRef}>
                {productNames.length > 0 ? (
                  <Bar data={productBarData} options={productBarOptions} />
                ) : (
                  <div className="empty-state">
                    <h3>No sales data yet</h3>
                    <p>Sales will appear here once orders come in</p>
                  </div>
                )}
              </div>
            </div>

            <div className="card">
              <div className="card-header">
                <h2>Sales Channel</h2>
              </div>
              <div className="chart-container">
                {(summary?.onlineOrders || 0) + (summary?.posOrders || 0) > 0 ? (
                  <Doughnut data={channelData} options={channelOptions} />
                ) : (
                  <div className="empty-state">
                    <h3>No channel data</h3>
                    <p>Channel split will appear with sales</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Revenue breakdown */}
          <div className="card">
            <div className="card-header">
              <h2>Revenue by Product (RM)</h2>
            </div>
            <div className="chart-container" style={{ height: Math.max(200, productNames.length * 40) }}>
              {productNames.length > 0 ? (
                <Bar data={revenueBarData} options={revenueBarOptions} />
              ) : (
                <div className="empty-state">
                  <h3>No revenue data</h3>
                </div>
              )}
            </div>
          </div>

          {/* Product Table */}
          <div className="card">
            <div className="card-header">
              <h2>Product Summary</h2>
            </div>
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Units Sold</th>
                    <th>Revenue (RM)</th>
                    <th>Avg Price</th>
                  </tr>
                </thead>
                <tbody>
                  {productNames.map((name) => {
                    const data = productMap.get(name)!;
                    return (
                      <tr key={name}>
                        <td style={{ fontWeight: 500 }}>{name}</td>
                        <td>{data.units.toLocaleString()}</td>
                        <td>RM {data.revenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        <td>RM {(data.revenue / data.units).toFixed(2)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {activeTab === "orders" && (
        <div className="card">
          <div className="card-header">
            <h2>Order History</h2>
          </div>
          {orders.length === 0 ? (
            <div className="empty-state">
              <h3>No orders found</h3>
              <p>Orders will appear here when customers purchase your products</p>
            </div>
          ) : (
            <div className="table-wrapper" style={{ maxHeight: "600px", overflowY: "auto" }}>
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
                  {orders.map((item, idx) => (
                    <tr key={idx}>
                      <td>{formatDate(item.date)}</td>
                      <td style={{ fontWeight: 500 }}>{item.orderNumber}</td>
                      <td>{item.productName}</td>
                      <td>{item.quantity}</td>
                      <td>RM {(item.price * item.quantity).toFixed(2)}</td>
                      <td>
                        <span className={`badge ${item.channel === "POS" ? "badge-pos" : "badge-online"}`}>
                          {item.channel}
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
