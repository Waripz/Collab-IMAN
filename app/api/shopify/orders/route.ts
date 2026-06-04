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

    // --- LIGHTWEIGHT REAL-TIME DELTA SYNC (DTR3 only) ---
    // Only checks DTR3 (store index 1) with a tight page cap so it finishes in seconds.
    // The daily cron job at /api/cron/sync handles the heavier full-store sync.
    const DTR3_INDEX = 1; // pbakl-2026-dtr3
    if (stores[DTR3_INDEX]) {
      try {
        const allowedSet = new Set(allowedProductIds);

        // Find latest sync timestamp
        const { data: latestCache } = await supabase
          .from("orders_cache")
          .select("synced_at")
          .order("synced_at", { ascending: false })
          .limit(1);

        let latestSyncDate = new Date();
        latestSyncDate.setDate(latestSyncDate.getDate() - 7);
        if (latestCache && latestCache.length > 0 && latestCache[0].synced_at) {
          latestSyncDate = new Date(latestCache[0].synced_at as string);
          latestSyncDate.setMinutes(latestSyncDate.getMinutes() - 10);
        }

        const token = await getShopifyToken(DTR3_INDEX);
        const store = stores[DTR3_INDEX];
        let pageInfo: string | null = null;
        let hasNext = true;
        let pages = 0;
        const newOrders: any[] = [];

        // Cap at 3 pages (750 orders max) — DTR3 is small, this finishes in ~3-5 seconds
        while (hasNext && pages < 3) {
          pages++;
          let url = `https://${store.shop}.myshopify.com/admin/api/${API_VERSION}/orders.json?`;
          if (pageInfo) {
            url += `limit=250&page_info=${pageInfo}`;
          } else {
            url += `status=any&limit=250&updated_at_min=${latestSyncDate.toISOString()}`;
          }

          const response = await fetch(url, {
            headers: { "X-Shopify-Access-Token": token },
            cache: "no-store",
          });
          if (!response.ok) break;

          const data = await response.json();
          const shopifyOrders = data.orders || [];
          if (shopifyOrders.length === 0) break;

          for (const order of shopifyOrders) {
            if (order.cancelled_at || order.financial_status === "refunded") continue;

            const matchingItems = (order.line_items || []).filter(
              (li: { product_id: number }) => allowedSet.has(li.product_id)
            );
            if (matchingItems.length === 0) continue;

            for (const item of matchingItems) {
              const allocatedDiscount = (item.discount_allocations || []).reduce(
                (sum: number, da: { amount: string }) => sum + parseFloat(da.amount || "0"), 0
              );
              let finalPrice = parseFloat(item.price);
              if (order.taxes_included) {
                const totalTax = (item.tax_lines || []).reduce(
                  (sum: number, t: { price: string }) => sum + parseFloat(t.price || "0"), 0
                );
                const unitTax = item.quantity > 0 ? totalTax / item.quantity : 0;
                finalPrice = finalPrice - unitTax;
              }
              newOrders.push({
                order_date: order.processed_at || order.created_at,
                order_number: order.name,
                product_name: item.title,
                product_id: item.product_id,
                quantity: item.quantity,
                price: finalPrice,
                discount: allocatedDiscount,
                channel: order.source_name === "pos" ? "POS" : "Online",
                synced_at: new Date().toISOString(),
              });
            }
          }

          const linkHeader = response.headers.get("Link");
          if (linkHeader && linkHeader.includes('rel="next"')) {
            const nextLink = linkHeader.split(",").find((l: string) => l.includes('rel="next"'));
            const match = nextLink ? nextLink.match(/page_info=([^>&]*)/) : null;
            pageInfo = match ? match[1] : null;
            if (!pageInfo) hasNext = false;
          } else {
            hasNext = false;
          }
        }

        // Upsert any new orders found
        if (newOrders.length > 0) {
          for (let i = 0; i < newOrders.length; i += 200) {
            await supabase.from("orders_cache").upsert(
              newOrders.slice(i, i + 200),
              { onConflict: "order_number,product_id" }
            );
          }
        }
      } catch (err) {
        console.warn("Real-time DTR3 delta sync error (non-fatal):", err);
        // Non-fatal — we still return cached data below
      }
    }

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
