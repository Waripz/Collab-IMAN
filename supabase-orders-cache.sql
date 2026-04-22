-- ============================================
-- Add orders cache table
-- Run this in Supabase SQL Editor
-- ============================================

DROP TABLE IF EXISTS public.orders_cache CASCADE;

CREATE TABLE public.orders_cache (
  id BIGSERIAL PRIMARY KEY,
  order_date TIMESTAMPTZ NOT NULL,
  order_number TEXT NOT NULL,
  product_name TEXT NOT NULL,
  product_id BIGINT NOT NULL,
  quantity INT NOT NULL DEFAULT 0,
  price DECIMAL(10,2) NOT NULL DEFAULT 0,
  discount DECIMAL(10,2) NOT NULL DEFAULT 0,
  channel TEXT NOT NULL DEFAULT 'Online',
  synced_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_cache_product ON public.orders_cache(product_id);
CREATE INDEX IF NOT EXISTS idx_orders_cache_date ON public.orders_cache(order_date);

-- Prevent duplicate order line items
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_cache_unique 
  ON public.orders_cache(order_number, product_id);
