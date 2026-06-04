import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
import { createServiceClient } from "@/lib/supabase-server";
import { getShopifyToken, stores } from "@/lib/shopify";

// Max execution time: 60 seconds (Vercel Hobby max for API routes is 10s by default, but we can set maxDuration up to 60s)
export const maxDuration = 60;
const API_VERSION = "2024-01";

export async function GET(request: Request) {
  try {
    // Basic security to prevent unauthorized access (you can pass ?token=YOUR_SECRET)
    const { searchParams } = new URL(request.url);
    const authHeader = request.headers.get('authorization');
    
    // Check for standard Vercel Cron header OR custom query token
    const isVercelCron = authHeader === `Bearer ${process.env.CRON_SECRET}`;
    const hasQueryToken = searchParams.get('token') === process.env.CRON_SECRET;
    
    // If CRON_SECRET is set in environment, enforce it. If not, allow (for testing/simplicity).
    if (process.env.CRON_SECRET && !isVercelCron && !hasQueryToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createServiceClient();
    
    // 1. Get all allowed product IDs across all publishers
    let allIds: { shopify_product_id: number }[] = [];
    let start = 0;
    let more = true;
    while (more) {
      const { data } = await supabase.from("publisher_products").select("shopify_product_id").range(start, start + 999);
      if (!data || data.length === 0) more = false;
      else { allIds.push(...data); start += 1000; }
    }
    const allowedSet = new Set(allIds.map((d) => d.shopify_product_id));

    if (allowedSet.size === 0) {
      return NextResponse.json({ status: "skipped", reason: "no tracked products" });
    }

    // 2. Find the latest synced order to know where to start fetching from real-time
    const { data: latestCache } = await supabase
      .from("orders_cache")
      .select("synced_at")
      .order("synced_at", { ascending: false })
      .limit(1);

    let latestSyncDate = new Date();
    latestSyncDate.setDate(latestSyncDate.getDate() - 7); // Default fallback: last 7 days
    
    if (latestCache && latestCache.length > 0 && latestCache[0].synced_at) {
      latestSyncDate = new Date(latestCache[0].synced_at);
      // Subtract 10 minutes just to be safe with timezone overlaps
      latestSyncDate.setMinutes(latestSyncDate.getMinutes() - 10); 
    }

    // 3. Fetch RECENT orders from Shopify (Delta sync across ALL stores concurrently)
    const newValidOrders: any[] = [];

    const fetchPromises = stores.map(async (store, i) => {
      try {
        const token = await getShopifyToken(i);
        let pageInfo: string | null = null;
        let hasNext = true;
        let pages = 0;
        const storeOrders = [];

        // LIMIT to 5 pages per store to ensure it finishes under 60 seconds.
        // A cron running every 15 minutes rarely needs more than 1 page.
        while (hasNext && pages < 5) {
          pages++;
          let url = `https://${store.shop}.myshopify.com/admin/api/${API_VERSION}/orders.json?`;
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

            for (const item of matchingItems) {
              const allocatedDiscount = (item.discount_allocations || []).reduce((sum: number, da: { amount: string }) => sum + parseFloat(da.amount || "0"), 0);

              let finalPrice = parseFloat(item.price);
              if (order.taxes_included) {
                const totalTax = (item.tax_lines || []).reduce((sum: number, t: { price: string }) => sum + parseFloat(t.price || "0"), 0);
                const unitTax = item.quantity > 0 ? (totalTax / item.quantity) : 0;
                finalPrice = finalPrice - unitTax;
              }

              storeOrders.push({
                order_date: order.processed_at || order.created_at,
                order_number: order.name,
                product_name: item.title,
                product_id: item.product_id,
                quantity: item.quantity,
                price: finalPrice,
                discount: allocatedDiscount,
                channel: order.source_name === "pos" ? "POS" : "Online",
                synced_at: new Date().toISOString()
              });
            }
          }

          const linkHeader = response.headers.get("Link");
          if (linkHeader && linkHeader.includes('rel="next"')) {
            const nextLink = linkHeader.split(',').find((l: string) => l.includes('rel="next"'));
            const match = nextLink ? nextLink.match(/page_info=([^>&]*)/) : null;
            pageInfo = match ? match[1] : null;
            if (!pageInfo) hasNext = false;
          } else {
            hasNext = false;
          }
        }
        return storeOrders;
      } catch (err) {
        console.warn(`Delta sync error for store ${store.shop}:`, err);
        return [];
      }
    });

    const storeResults = await Promise.all(fetchPromises);
    for (const orders of storeResults) {
      newValidOrders.push(...orders);
    }

    // 4. Upsert the new orders into Supabase synchronously
    if (newValidOrders.length > 0) {
      for (let i = 0; i < newValidOrders.length; i += 200) {
        await supabase.from("orders_cache").upsert(newValidOrders.slice(i, i + 200), { onConflict: "order_number,product_id" });
      }
    }
    
    // 5. Log the sync run
    await supabase.from("sync_logs").insert({
      run_by: 'automated-cron',
      status: 'success',
      items_found: newValidOrders.length,
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString()
    });

    return NextResponse.json({ 
      status: "success", 
      synced_items: newValidOrders.length,
      timestamp: new Date().toISOString()
    });

  } catch (err: any) {
    console.error("Cron sync error:", err);
    return NextResponse.json({ error: "Failed to run sync", details: err.message }, { status: 500 });
  }
}
