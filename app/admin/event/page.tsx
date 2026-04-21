"use client";

import { useEffect, useState } from "react";

interface EventData {
  id: number;
  event_name: string;
  start_date: string | null;
  end_date: string | null;
}

export default function EventSettingsPage() {
  const [event, setEvent] = useState<EventData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [toast, setToast] = useState<{ message: string; type: string } | null>(null);

  useEffect(() => {
    fetch("/api/admin/event")
      .then((r) => r.json())
      .then((data) => {
        if (data.event) {
          setEvent(data.event);
          setName(data.event.event_name || "");
          setStartDate(data.event.start_date || "");
          setEndDate(data.event.end_date || "");
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const res = await fetch("/api/admin/event", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_name: name,
          start_date: startDate || null,
          end_date: endDate || null,
        }),
      });

      if (res.ok) {
        setToast({ message: "Event settings saved!", type: "success" });
      } else {
        setToast({ message: "Failed to save settings", type: "error" });
      }
    } catch {
      setToast({ message: "Network error", type: "error" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner" />
        <span>Loading settings...</span>
      </div>
    );
  }

  return (
    <>
      <div className="page-header">
        <h1>Event Settings</h1>
        <p>Configure the event details and date range for data filtering</p>
      </div>

      <div className="card" style={{ maxWidth: 600 }}>
        <div className="card-header">
          <h2>Event Configuration</h2>
        </div>

        <form onSubmit={handleSave}>
          <div className="form-group">
            <label>Event Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Book Fair 2026"
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            <div className="form-group">
              <label>Start Date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label>End Date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>

          <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "1.5rem" }}>
            When set, the dashboard will only show orders within this date range.
            Leave empty to show all orders.
          </p>

          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? <><span className="spinner" /> Saving...</> : "Save Event Settings"}
          </button>
        </form>
      </div>

      {event && (
        <div className="event-banner" style={{ marginTop: "1.5rem", maxWidth: 600 }}>
          <div className="event-info">
            <h3>{name || "Unnamed Event"}</h3>
            <p>Current event configuration</p>
          </div>
          <div className="event-dates">
            <div className="event-date">
              <div className="label">Starts</div>
              <div className="value">{startDate || "Not set"}</div>
            </div>
            <div className="event-date">
              <div className="label">Ends</div>
              <div className="value">{endDate || "Not set"}</div>
            </div>
          </div>
        </div>
      )}

      {toast && <div className={`toast ${toast.type}`}>{toast.message}</div>}
    </>
  );
}
