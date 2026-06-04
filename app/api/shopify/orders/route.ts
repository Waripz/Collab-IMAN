import { NextRequest, NextResponse } from "next/server";
export const dynamic = "force-dynamic";
import { getAuthUser, apiError } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase-server";
import { getShopifyToken, stores } from "@/lib/shopify";
export const maxDuration = 60;
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
        // Fetch specific publisher's products (usually < 1000)
        let allIds = [];
        let start = 0;
        let more = true;
        while (more) {
          const { data } = await supabase.from("publisher_products").select("shopify_product_id").eq("user_id", publisherId).range(start, start + 999);
          if (!data || data.length === 0) more = false;
          else { allIds.push(...data); start += 1000; }
        }
        allowedProductIds = allIds.map((d) => d.shopify_product_id);
      } else {
        // Fetch ALL products (definitely > 1000)
        let allIds = [];
        let start = 0;
        let more = true;
        while (more) {
          const { data } = await supabase.from("publisher_products").select("shopify_product_id").range(start, start + 999);
          if (!data || data.length === 0) more = false;
          else { allIds.push(...data); start += 1000; }
        }
        allowedProductIds = [...new Set(allIds.map((d) => d.shopify_product_id))];
      }
    } else {
      let allIds = [];
      let start = 0;
      let more = true;
      while (more) {
        const { data } = await supabase.from("publisher_products").select("shopify_product_id").eq("user_id", user.id).range(start, start + 999);
        if (!data || data.length === 0) more = false;
        else { allIds.push(...data); start += 1000; }
      }
      allowedProductIds = allIds.map((d) => d.shopify_product_id);
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

    // The Real-Time Delta Fetching logic has been moved to the background cron job (/api/cron/sync)
    // to prevent the dashboard from timing out on Vercel and improve load times.

    // 4. Finally, pull everything requested directly from Supabase! ⚡
    // Supabase has a default 1000-row limit, so we paginate to get ALL rows
    const PAGE_SIZE = 1000;
    let allCachedOrders: Record<string, unknown>[] = [];
    let rangeStart = 0;
    let hasMore = true;

    while (hasMore) {
      const { data: page, error: pageErr } = await supabase
        .from("orders_cache")
        .select("*")
        .in("product_id", allowedProductIds)
        .gte("order_date", fromDateIso)
        .lte("order_date", toDateIso)
        .order("order_date", { ascending: false })
        .range(rangeStart, rangeStart + PAGE_SIZE - 1);

      if (pageErr) throw new Error("Supabase error: " + pageErr.message);

      const rows = page || [];
      allCachedOrders = allCachedOrders.concat(rows);
      rangeStart += PAGE_SIZE;
      hasMore = rows.length === PAGE_SIZE;
    }

    const orders = allCachedOrders.map(o => ({
      date: o.order_date as string,
      orderNumber: o.order_number as string,
      productName: o.product_name as string,
      productId: o.product_id as number,
      quantity: o.quantity as number,
      price: Number(o.price),
      discount: Number(o.discount),
      channel: o.channel as string
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
