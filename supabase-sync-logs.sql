-- ============================================
-- Add sync_logs table for Store History Audit
-- Run this in Supabase SQL Editor
-- ============================================

CREATE TABLE IF NOT EXISTS public.sync_logs (
  id BIGSERIAL PRIMARY KEY,
  admin_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  scanned_from_date DATE NOT NULL,
  total_items_found INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('running', 'success', 'error', 'partial')),
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_sync_logs_started ON public.sync_logs(started_at DESC);
