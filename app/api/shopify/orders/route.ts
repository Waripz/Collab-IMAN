import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, apiError } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase-server";
import { getShopifyToken } from "@/lib/shopify";

const SHOP = process.env.SHOPIFY_SHOP!;
const API_VERSION = "2024-01";

/**
 * GET /api/shopify/orders
 * 
 * Fetches orders DIRECTLY from Shopify (single fast request, like the Python script)
 * then filters by the user's allowed product IDs.
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

    // --- Single fast fetch from Shopify (like the Python script) ---
    const token = await getShopifyToken();
    const url = `https://${SHOP}.myshopify.com/admin/api/${API_VERSION}/orders.json?status=any&limit=250`;
    
    const response = await fetch(url, {
      headers: { "X-Shopify-Access-Token": token },
      next: { revalidate: 60 }, // Cache for 60 seconds
    });

    if (!response.ok) {
      throw new Error(`Shopify API error: ${response.status}`);
    }

    const data = await response.json();
    const shopifyOrders = data.orders || [];

    // --- Filter by allowed products (same logic as Python script) ---
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

    for (const order of shopifyOrders) {
      for (const item of order.line_items || []) {
        if (allowedSet.has(item.product_id)) {
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
