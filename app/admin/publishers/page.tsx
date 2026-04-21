"use client";

import { useEffect, useState, useCallback } from "react";

interface Publisher {
  id: string;
  email: string;
  name: string;
  productCount: number;
  created_at: string;
}

export default function PublishersPage() {
  const [publishers, setPublishers] = useState<Publisher[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: string } | null>(null);

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

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    setSaving(true);

    try {
      const res = await fetch("/api/admin/publishers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formName,
          email: formEmail,
          password: formPassword,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setFormError(data.error || "Failed to create publisher");
        return;
      }

      setShowModal(false);
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
        <p>Manage collaborative publisher accounts</p>
      </div>

      <div className="card">
        <div className="card-header">
          <h2>{publishers.length} Publisher{publishers.length !== 1 ? "s" : ""}</h2>
          <button className="btn btn-primary btn-sm" onClick={() => setShowModal(true)}>
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
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Add Publisher</h2>
            <form onSubmit={handleCreate}>
              <div className="form-group">
                <label>Name</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Publisher name"
                  required
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label>Email</label>
                <input
                  type="email"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  placeholder="publisher@example.com"
                  required
                />
              </div>
              <div className="form-group">
                <label>Password</label>
                <input
                  type="password"
                  value={formPassword}
                  onChange={(e) => setFormPassword(e.target.value)}
                  placeholder="Minimum 6 characters"
                  required
                  minLength={6}
                />
              </div>
              {formError && <div className="form-error">{formError}</div>}
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? <><span className="spinner" /> Creating...</> : "Create Publisher"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Toast notification */}
      {toast && (
        <div className={`toast ${toast.type}`}>{toast.message}</div>
      )}
    </>
  );
}
