import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, apiError } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase-server";
import { getShopifyToken } from "@/lib/shopify";

const SHOP = process.env.SHOPIFY_SHOP!;
const API_VERSION = "2024-01";

/**
 * GET /api/shopify/orders
 * 
 * Fetches orders from Shopify, filtered by user's allowed product IDs.
 * ?limit=250|500|1000|2000 (default 250)
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return apiError("Unauthorized", 401);

    const supabase = createServiceClient();

    // Get allowed product IDs for this user
    let allowedProductIds: number[] = [];

    if (user.role === "admin") {
      const publisherId = request.nextUrl.searchParams.get("publisher_id");
      if (publisherId) {
        const { data } = await supabase
          .from("publisher_products")
          .select("shopify_product_id")
          .eq("user_id", publisherId);
        allowedProductIds = (data || []).map((d) => d.shopify_product_id);
      } else {
        const { data } = await supabase
          .from("publisher_products")
          .select("shopify_product_id");
        allowedProductIds = [...new Set((data || []).map((d) => d.shopify_product_id))];
      }
    } else {
      const { data } = await supabase
        .from("publisher_products")
        .select("shopify_product_id")
        .eq("user_id", user.id);
      allowedProductIds = (data || []).map((d) => d.shopify_product_id);
    }

    if (allowedProductIds.length === 0) {
      return NextResponse.json({
        orders: [],
        summary: { totalUnits: 0, totalRevenue: 0, totalOrders: 0, onlineOrders: 0, posOrders: 0 },
      });
    }

    // Parse limit (max 2000, default 250)
    const requestedLimit = Math.min(
      Math.max(parseInt(request.nextUrl.searchParams.get("limit") || "250"), 250),
      2000
    );
    const pages = Math.ceil(requestedLimit / 250);

    // Fetch orders from Shopify (paginated in batches of 250)
    const token = await getShopifyToken();
    const allowedSet = new Set(allowedProductIds);

    interface OrderItem {
      date: string;
      orderNumber: string;
      productName: string;
      productId: number;
      quantity: number;
      price: number;
      channel: string;
    }

    const orders: OrderItem[] = [];
    let pageInfo: string | null = null;
    const seenKeys = new Set<string>(); // Dedup: order_number + product_id

    for (let page = 0; page < pages; page++) {
      let url: string;

      if (page === 0) {
        url = `https://${SHOP}.myshopify.com/admin/api/${API_VERSION}/orders.json?status=any&limit=250`;
      } else {
        url = `https://${SHOP}.myshopify.com/admin/api/${API_VERSION}/orders.json?limit=250&page_info=${pageInfo}`;
      }

      const response = await fetch(url, {
        headers: { "X-Shopify-Access-Token": token },
      });

      if (!response.ok) {
        throw new Error(`Shopify API error: ${response.status}`);
      }

      const data = await response.json();
      const shopifyOrders = data.orders || [];

      // Filter by allowed products + dedup
      for (const order of shopifyOrders) {
        for (const item of order.line_items || []) {
          if (allowedSet.has(item.product_id)) {
            const key = `${order.name}_${item.product_id}_${item.id}`;
            if (!seenKeys.has(key)) {
              seenKeys.add(key);
              orders.push({
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
      }

      // Check for next page - must extract from rel="next" specifically
      const linkHeader = response.headers.get("Link");
      if (linkHeader && linkHeader.includes('rel="next"')) {
        // Split by comma to separate prev/next links, then find the "next" one
        const links = linkHeader.split(",");
        const nextLink = links.find((l) => l.includes('rel="next"'));
        if (nextLink) {
          const match = nextLink.match(/page_info=([^>&]*)/);
          pageInfo = match ? match[1] : null;
        } else {
          pageInfo = null;
        }
        if (!pageInfo) break;
      } else {
        break; // No more pages
      }
    }

    // Calculate summary
    const totalUnits = orders.reduce((sum, o) => sum + o.quantity, 0);
    const totalRevenue = orders.reduce((sum, o) => sum + o.price * o.quantity, 0);
    const uniqueOrders = new Set(orders.map((o) => o.orderNumber));

    return NextResponse.json({
      orders,
      summary: {
        totalUnits,
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        totalOrders: uniqueOrders.size,
        onlineOrders: orders.filter((o) => o.channel === "Online").length,
        posOrders: orders.filter((o) => o.channel === "POS").length,
      },
    });
  } catch (err) {
    console.error("Orders API error:", err);
    return apiError("Failed to fetch orders", 500);
  }
}
