/**
 * Shopify API Client
 * Ported from main.py — handles token management and data fetching.
 */

export interface StoreConfig {
  shop: string;
  clientId: string;
  clientSecret: string;
}

export const stores: StoreConfig[] = [];
// ONLY check DTR3 (Shopify Store 2) as per user request
if (process.env.SHOPIFY_SHOP_2) {
  stores.push({
    shop: process.env.SHOPIFY_SHOP_2.replace('.myshopify.com', '').trim(),
    clientId: process.env.SHOPIFY_CLIENT_ID_2!.trim(),
    clientSecret: process.env.SHOPIFY_CLIENT_SECRET_2!.trim(),
  });
}

const API_VERSION = "2024-01";

// --- Token Manager ---
const tokenCache: Record<number, { token: string; expiresAt: number }> = {};

export async function getShopifyToken(storeIndex = 0): Promise<string> {
  const store = stores[storeIndex];
  if (!store) throw new Error(`Store index ${storeIndex} not configured`);

  const cached = tokenCache[storeIndex];
  if (cached && Date.now() / 1000 < cached.expiresAt - 60) {
    return cached.token;
  }

  const response = await fetch(
    `https://${store.shop}.myshopify.com/admin/oauth/access_token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: store.clientId,
        client_secret: store.clientSecret,
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Shopify auth failed for ${store.shop}: ${response.statusText}`);
  }

  const data = await response.json();
  tokenCache[storeIndex] = {
    token: data.access_token,
    expiresAt: Date.now() / 1000 + (data.expires_in || 86400)
  };
  return data.access_token;
}

// --- Helper: authenticated fetch ---
async function shopifyFetch(endpoint: string, storeIndex = 0) {
  const token = await getShopifyToken(storeIndex);
  const store = stores[storeIndex];
  const url = `https://${store.shop}.myshopify.com/admin/api/${API_VERSION}/${endpoint}`;
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

  for (let i = 0; i < stores.length; i++) {
    const store = stores[i];
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

      const token = await getShopifyToken(i);
      const url = `https://${store.shop}.myshopify.com/admin/api/${API_VERSION}/${endpoint}`;
      const response = await fetch(url, {
        headers: { "X-Shopify-Access-Token": token },
      });

      if (!response.ok) {
        throw new Error(`Shopify API error for store ${store.shop}: ${response.status}`);
      }

      const data = await response.json();
      allOrders.push(...(data.orders || []));

      // Handle pagination via Link header
      const linkHeader = response.headers.get("Link");
      if (linkHeader && linkHeader.includes('rel="next"')) {
        const links = linkHeader.split(",");
        const nextLink = links.find((l) => l.includes('rel="next"'));
        if (nextLink) {
          const match = nextLink.match(/page_info=([^>&]*)/);
          pageInfo = match ? match[1] : null;
          hasNextPage = !!pageInfo;
        } else {
          hasNextPage = false;
        }
      } else {
        hasNextPage = false;
      }
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

  for (let i = 0; i < stores.length; i++) {
    const store = stores[i];
    let pageInfo: string | null = null;
    let hasNextPage = true;

    while (hasNextPage) {
      let endpoint: string;

      if (pageInfo) {
        endpoint = `products.json?limit=250&page_info=${pageInfo}`;
      } else {
        endpoint = `products.json?limit=250`;
      }

      const token = await getShopifyToken(i);
      const url = `https://${store.shop}.myshopify.com/admin/api/${API_VERSION}/${endpoint}`;
      const response = await fetch(url, {
        headers: { "X-Shopify-Access-Token": token },
      });

      if (!response.ok) {
        throw new Error(`Shopify API error for store ${store.shop}: ${response.status}`);
      }

      const data = await response.json();
      allProducts.push(...(data.products || []));

      const linkHeader = response.headers.get("Link");
      if (linkHeader && linkHeader.includes('rel="next"')) {
        const links = linkHeader.split(",");
        const nextLink = links.find((l) => l.includes('rel="next"'));
        if (nextLink) {
          const match = nextLink.match(/page_info=([^>&]*)/);
          pageInfo = match ? match[1] : null;
          hasNextPage = !!pageInfo;
        } else {
          hasNextPage = false;
        }
      } else {
        hasNextPage = false;
      }
    }
  }

  return allProducts;
}

// --- Fetch inventory levels ---
export async function fetchInventoryLevels(
  inventoryItemIds: number[],
  storeIndex = 0
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
      `inventory_levels.json?inventory_item_ids=${ids}`,
      storeIndex
    );
    for (const level of data.inventory_levels || []) {
      const existing = levels[level.inventory_item_id] || 0;
      levels[level.inventory_item_id] = existing + (level.available || 0);
    }
  }

  return levels;
}
