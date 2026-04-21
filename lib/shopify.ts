/**
 * Shopify API Client
 * Ported from main.py — handles token management and data fetching.
 */

const SHOP = process.env.SHOPIFY_SHOP!;
const CLIENT_ID = process.env.SHOPIFY_CLIENT_ID!;
const CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET!;
const API_VERSION = "2024-01";

// --- Token Manager (same logic as Python get_token()) ---
let cachedToken: string | null = null;
let tokenExpiresAt = 0;

export async function getShopifyToken(): Promise<string> {
  if (cachedToken && Date.now() / 1000 < tokenExpiresAt - 60) {
    return cachedToken;
  }

  const response = await fetch(
    `https://${SHOP}.myshopify.com/admin/oauth/access_token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Shopify auth failed: ${response.statusText}`);
  }

  const data = await response.json();
  cachedToken = data.access_token;
  tokenExpiresAt = Date.now() / 1000 + (data.expires_in || 86400);
  return cachedToken!;
}

// --- Helper: authenticated fetch ---
async function shopifyFetch(endpoint: string) {
  const token = await getShopifyToken();
  const url = `https://${SHOP}.myshopify.com/admin/api/${API_VERSION}/${endpoint}`;
  const response = await fetch(url, {
    headers: { "X-Shopify-Access-Token": token },
  });
  if (!response.ok) {
    throw new Error(`Shopify API error: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

// --- Fetch ALL orders with pagination ---
export interface ShopifyLineItem {
  product_id: number;
  title: string;
  quantity: number;
  price: string;
  variant_title: string | null;
}

export interface ShopifyOrder {
  id: number;
  name: string;
  created_at: string;
  source_name: string;
  financial_status: string;
  line_items: ShopifyLineItem[];
  total_price: string;
  currency: string;
}

export async function fetchAllOrders(
  sinceDate?: string,
  untilDate?: string
): Promise<ShopifyOrder[]> {
  const allOrders: ShopifyOrder[] = [];
  let pageInfo: string | null = null;
  let hasNextPage = true;

  while (hasNextPage) {
    let endpoint: string;
    
    if (pageInfo) {
      endpoint = `orders.json?limit=250&page_info=${pageInfo}`;
    } else {
      let params = "status=any&limit=250";
      if (sinceDate) params += `&created_at_min=${sinceDate}`;
      if (untilDate) params += `&created_at_max=${untilDate}`;
      endpoint = `orders.json?${params}`;
    }

    const token = await getShopifyToken();
    const url = `https://${SHOP}.myshopify.com/admin/api/${API_VERSION}/${endpoint}`;
    const response = await fetch(url, {
      headers: { "X-Shopify-Access-Token": token },
    });

    if (!response.ok) {
      throw new Error(`Shopify API error: ${response.status}`);
    }

    const data = await response.json();
    allOrders.push(...(data.orders || []));

    // Handle pagination via Link header
    const linkHeader = response.headers.get("Link");
    if (linkHeader && linkHeader.includes('rel="next"')) {
      const match = linkHeader.match(/page_info=([^>&]*)/);
      pageInfo = match ? match[1] : null;
      hasNextPage = !!pageInfo;
    } else {
      hasNextPage = false;
    }
  }

  return allOrders;
}

// --- Filter orders by allowed product IDs ---
export interface FilteredOrderItem {
  date: string;
  orderNumber: string;
  productName: string;
  productId: number;
  quantity: number;
  price: number;
  channel: string;
}

export function filterOrdersByProducts(
  orders: ShopifyOrder[],
  allowedProductIds: number[]
): FilteredOrderItem[] {
  const allowedSet = new Set(allowedProductIds);
  const filtered: FilteredOrderItem[] = [];

  for (const order of orders) {
    for (const item of order.line_items) {
      if (allowedSet.has(item.product_id)) {
        filtered.push({
          date: order.created_at,
          orderNumber: order.name,
          productName: item.title,
          productId: item.product_id,
          quantity: item.quantity,
          price: parseFloat(item.price),
          channel: order.source_name === "pos" ? "POS" : "Online",
        });
      }
    }
  }

  return filtered;
}

// --- Fetch all products ---
export interface ShopifyProduct {
  id: number;
  title: string;
  vendor: string;
  product_type: string;
  status: string;
  image?: { src: string } | null;
  variants: { id: number; price: string; inventory_quantity: number }[];
}

export async function fetchAllProducts(): Promise<ShopifyProduct[]> {
  const allProducts: ShopifyProduct[] = [];
  let pageInfo: string | null = null;
  let hasNextPage = true;

  while (hasNextPage) {
    let endpoint: string;

    if (pageInfo) {
      endpoint = `products.json?limit=250&page_info=${pageInfo}`;
    } else {
      endpoint = `products.json?limit=250`;
    }

    const token = await getShopifyToken();
    const url = `https://${SHOP}.myshopify.com/admin/api/${API_VERSION}/${endpoint}`;
    const response = await fetch(url, {
      headers: { "X-Shopify-Access-Token": token },
    });

    if (!response.ok) {
      throw new Error(`Shopify API error: ${response.status}`);
    }

    const data = await response.json();
    allProducts.push(...(data.products || []));

    const linkHeader = response.headers.get("Link");
    if (linkHeader && linkHeader.includes('rel="next"')) {
      const match = linkHeader.match(/page_info=([^>&]*)/);
      pageInfo = match ? match[1] : null;
      hasNextPage = !!pageInfo;
    } else {
      hasNextPage = false;
    }
  }

  return allProducts;
}

// --- Fetch inventory levels ---
export async function fetchInventoryLevels(
  inventoryItemIds: number[]
): Promise<Record<number, number>> {
  const levels: Record<number, number> = {};
  
  // Shopify allows max 50 IDs per request
  const chunks = [];
  for (let i = 0; i < inventoryItemIds.length; i += 50) {
    chunks.push(inventoryItemIds.slice(i, i + 50));
  }

  for (const chunk of chunks) {
    const ids = chunk.join(",");
    const data = await shopifyFetch(
      `inventory_levels.json?inventory_item_ids=${ids}`
    );
    for (const level of data.inventory_levels || []) {
      const existing = levels[level.inventory_item_id] || 0;
      levels[level.inventory_item_id] = existing + (level.available || 0);
    }
  }

  return levels;
}
