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
 * ?from=2024-01-01&to=2024-12-31  (date range filter)
 * Paginates automatically to get ALL orders within the date range.
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

    // Build Shopify query params
    const fromDate = request.nextUrl.searchParams.get("from");
    const toDate = request.nextUrl.searchParams.get("to");

    let baseParams = "status=any&limit=250";
    if (fromDate) baseParams += `&created_at_min=${fromDate}T00:00:00+08:00`;
    if (toDate) baseParams += `&created_at_max=${toDate}T23:59:59+08:00`;

    // Fetch orders from Shopify with pagination
    const token = await getShopifyToken();
    const allowedSet = new Set(allowedProductIds);

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

    const orders: OrderItem[] = [];
    let pageInfo: string | null = null;
    const seenKeys = new Set<string>();
    const MAX_PAGES = 20; // Safety cap: 20 pages = 5000 orders max

    for (let page = 0; page < MAX_PAGES; page++) {
      let url: string;

      if (page === 0) {
        url = `https://${SHOP}.myshopify.com/admin/api/${API_VERSION}/orders.json?${baseParams}`;
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

      if (shopifyOrders.length === 0) break;

      // Filter by allowed products + skip cancelled/refunded orders + dedup
      for (const order of shopifyOrders) {
        // Skip cancelled or fully refunded orders (Shopify Reports excludes these)
        if (order.cancelled_at || order.financial_status === "refunded") continue;

        for (const item of order.line_items || []) {
          if (allowedSet.has(item.product_id)) {
            const key = `${order.name}_${item.product_id}_${item.id}`;
            if (!seenKeys.has(key)) {
              seenKeys.add(key);
              // Calculate discounts from discount_allocations
              const lineDiscount = (item.discount_allocations || []).reduce(
                (sum: number, da: { amount: string }) => sum + parseFloat(da.amount || "0"), 0
              );
              orders.push({
                date: order.created_at,
                orderNumber: order.name,
                productName: item.title,
                productId: item.product_id,
                quantity: item.quantity,
                price: parseFloat(item.price),
                discount: lineDiscount,
                channel: order.source_name === "pos" ? "POS" : "Online",
              });
            }
          }
        }
      }

      // Check for next page
      const linkHeader = response.headers.get("Link");
      if (linkHeader && linkHeader.includes('rel="next"')) {
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
        break;
      }
    }

    // Calculate summary
    // Shopify line_item.price = unit price BEFORE discounts
    // So: gross = price × qty, net = gross - discounts
    const totalUnits = orders.reduce((sum, o) => sum + o.quantity, 0);
    const grossSales = orders.reduce((sum, o) => sum + o.price * o.quantity, 0);
    const totalDiscounts = orders.reduce((sum, o) => sum + o.discount, 0);
    const netSales = grossSales - totalDiscounts;
    const totalRevenue = netSales; // Revenue = what was actually earned
    const uniqueOrders = new Set(orders.map((o) => o.orderNumber));

    return NextResponse.json({
      orders,
      summary: {
        totalUnits,
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        grossSales: Math.round(grossSales * 100) / 100,
        totalDiscounts: Math.round(totalDiscounts * 100) / 100,
        netSales: Math.round(netSales * 100) / 100,
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
