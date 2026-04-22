import { NextRequest, NextResponse } from "next/server";
export const dynamic = "force-dynamic";
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

    // Build Supabase date filters
    const fromDate = request.nextUrl.searchParams.get("from");
    const toDate = request.nextUrl.searchParams.get("to");
    const fromDateIso = fromDate ? `${fromDate}T00:00:00+08:00` : "2020-01-01T00:00:00+08:00";
    const toDateIso = toDate ? `${toDate}T23:59:59+08:00` : new Date().toISOString();

    // 1. Find the latest synced order to know where to start fetching from real-time
    const { data: latestCache } = await supabase
      .from("orders_cache")
      .select("synced_at")
      .order("synced_at", { ascending: false })
      .limit(1);

    // If cache is empty, we only fetch the last 30 days of real-time data to prevent Vercel timeout.
    // The user MUST run the local sync script to populate older historical data.
    let latestSyncDate = new Date();
    latestSyncDate.setDate(latestSyncDate.getDate() - 30); 
    
    if (latestCache && latestCache.length > 0 && latestCache[0].synced_at) {
      latestSyncDate = new Date(latestCache[0].synced_at);
      // Subtract 5 minutes just to be safe with timezone overlaps
      latestSyncDate.setMinutes(latestSyncDate.getMinutes() - 5); 
    }

    // 2. Fetch RECENT orders from Shopify (Real-time delta sync)
    const token = await getShopifyToken();
    const allowedSet = new Set(allowedProductIds);
    let pageInfo: string | null = null;
    let hasNext = true;
    let pages = 0;
    const newValidOrders = [];

    while (hasNext && pages < 10) { // Safety cap of 10 pages for real-time delta
      pages++;
      let url = `https://${SHOP}.myshopify.com/admin/api/${API_VERSION}/orders.json?`;
      if (pageInfo) {
        url += `limit=250&page_info=${pageInfo}`;
      } else {
        url += `status=any&limit=250&updated_at_min=${latestSyncDate.toISOString()}`;
      }

      const response = await fetch(url, { headers: { "X-Shopify-Access-Token": token }, cache: "no-store" });
      if (!response.ok) break;

      const data = await response.json();
      const shopifyOrders = data.orders || [];

      if (shopifyOrders.length === 0) break;

      for (const order of shopifyOrders) {
        if (order.cancelled_at || order.financial_status === "refunded") continue;

        const matchingItems = (order.line_items || []).filter((li: { product_id: number }) => allowedSet.has(li.product_id));
        if (matchingItems.length === 0) continue;

        const orderTotalDiscount = parseFloat(order.total_discounts || "0");
        let totalAllocated = 0;
        let orderGross = 0;
        for (const li of order.line_items || []) {
          orderGross += parseFloat(li.price) * li.quantity;
          totalAllocated += (li.discount_allocations || []).reduce((sum: number, da: { amount: string }) => sum + parseFloat(da.amount || "0"), 0);
        }
        let shippingDiscount = 0;
        for (const app of order.discount_applications || []) {
          if (app.target_type === "shipping_line") shippingDiscount += parseFloat(app.value || "0");
        }
        const unallocatedLineDiscount = Math.max(0, orderTotalDiscount - totalAllocated - shippingDiscount);

        for (const item of matchingItems) {
          const allocatedDiscount = (item.discount_allocations || []).reduce((sum: number, da: { amount: string }) => sum + parseFloat(da.amount || "0"), 0);
          const itemGross = parseFloat(item.price) * item.quantity;
          const proportionalShare = orderGross > 0 ? (itemGross / orderGross) * unallocatedLineDiscount : 0;

          newValidOrders.push({
            order_date: order.created_at,
            order_number: order.name,
            product_name: item.title,
            product_id: item.product_id,
            quantity: item.quantity,
            price: parseFloat(item.price),
            discount: allocatedDiscount + proportionalShare,
            channel: order.source_name === "pos" ? "POS" : "Online",
            synced_at: new Date().toISOString()
          });
        }
      }

      const linkHeader = response.headers.get("Link");
      if (linkHeader && linkHeader.includes('rel="next"')) {
        const match = linkHeader.match(/page_info=([^>&]*)/);
        pageInfo = match ? match[1] : null;
      } else {
        hasNext = false;
      }
    }

    // 3. Upsert the real-time orders into Supabase synchronously
    if (newValidOrders.length > 0) {
      // Chunking just in case there's a big burst
      for (let i = 0; i < newValidOrders.length; i += 200) {
        await supabase.from("orders_cache").upsert(newValidOrders.slice(i, i + 200), { onConflict: "order_number,product_id" });
      }
    }

    // 4. Finally, pull everything requested directly from Supabase! ⚡
    const { data: cachedOrders, error: cacheErr } = await supabase
      .from("orders_cache")
      .select("*")
      .in("product_id", allowedProductIds)
      .gte("order_date", fromDateIso)
      .lte("order_date", toDateIso)
      .order("order_date", { ascending: false });

    if (cacheErr) throw new Error("Supabase error: " + cacheErr.message);

    const orders = (cachedOrders || []).map(o => ({
      date: o.order_date,
      orderNumber: o.order_number,
      productName: o.product_name,
      productId: o.product_id,
      quantity: o.quantity,
      price: Number(o.price),
      discount: Number(o.discount),
      channel: o.channel
    }));

    const totalUnits = orders.reduce((sum, o) => sum + o.quantity, 0);
    const grossSales = orders.reduce((sum, o) => sum + o.price * o.quantity, 0);
    const totalDiscounts = orders.reduce((sum, o) => sum + o.discount, 0);
    const netSales = grossSales - totalDiscounts;
    const totalRevenue = netSales;
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
