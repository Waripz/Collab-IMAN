-- ============================================
-- Publisher Collab Dashboard - Supabase Schema
-- Run this in Supabase SQL Editor
-- ============================================

-- 1. Profiles (custom auth - no Supabase Auth dependency)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'publisher' CHECK (role IN ('admin', 'publisher')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Sessions
CREATE TABLE IF NOT EXISTS public.sessions (
  id BIGSERIAL PRIMARY KEY,
  token TEXT UNIQUE NOT NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Publisher <-> Product permission mapping
CREATE TABLE IF NOT EXISTS public.publisher_products (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  shopify_product_id BIGINT NOT NULL,
  product_title TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, shopify_product_id)
);

-- 4. Cached Shopify products
CREATE TABLE IF NOT EXISTS public.shopify_products_cache (
  shopify_product_id BIGINT PRIMARY KEY,
  title TEXT NOT NULL,
  vendor TEXT,
  product_type TEXT,
  image_url TEXT,
  status TEXT DEFAULT 'active',
  cached_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Event settings
CREATE TABLE IF NOT EXISTS public.event_settings (
  id SERIAL PRIMARY KEY,
  event_name TEXT DEFAULT 'Event',
  start_date DATE,
  end_date DATE,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default event settings
INSERT INTO public.event_settings (event_name) VALUES ('Upcoming Event');

-- 6. Auto-update trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER event_settings_updated_at
  BEFORE UPDATE ON public.event_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 7. Index for performance
CREATE INDEX IF NOT EXISTS idx_sessions_token ON public.sessions(token);
CREATE INDEX IF NOT EXISTS idx_publisher_products_user ON public.publisher_products(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON public.sessions(expires_at);

-- ============================================
-- IMPORTANT: After running this schema, create 
-- your admin account by running the setup-admin
-- API endpoint (POST /api/auth/setup)
-- ============================================
