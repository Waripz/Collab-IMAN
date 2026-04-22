import { NextRequest, NextResponse } from "next/server";
export const dynamic = "force-dynamic";
import { getAuthUser, apiError } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase-server";
import { getShopifyToken } from "@/lib/shopify";

const SHOP = process.env.SHOPIFY_SHOP!;
const API_VERSION = "2024-01";

/**
 * POST /api/admin/sync-chunk
 * 
 * Fetches exactly 5 pages of historical Shopify orders and syncs tracked items into Supabase.
 * Designed to be called recursively by the Admin Web UI to bypass Vercel 10s timeouts.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return apiError("Unauthorized", 401);
    if (user.role !== "admin") return apiError("Forbidden", 403);

    const body = await request.json();
    const { fromDate, pageInfo: clientPageInfo } = body;

    const supabase = createServiceClient();
    
    // 1. Get ALL global tracked products
    const { data: allPerms } = await supabase
      .from("publisher_products")
      .select("shopify_product_id");
    const allowedProductIds = [...new Set((allPerms || []).map((d) => d.shopify_product_id))];
    const allowedSet = new Set(allowedProductIds);

    if (allowedProductIds.length === 0) {
      return NextResponse.json({ success: true, nextPageInfo: null, message: "No tracked products" });
    }

    const token = await getShopifyToken();
    let currentPageInfo = clientPageInfo || null;
    let hasNext = true;
    let pagesProcessed = 0;
    const newValidOrders = [];

    // Safety limit of 5 pages per API chunk to strictly stay under the Vercel 10-15s timeout
    while (hasNext && pagesProcessed < 5) {
      pagesProcessed++;
      let url = `https://${SHOP}.myshopify.com/admin/api/${API_VERSION}/orders.json?`;
      
      if (currentPageInfo) {
        url += `limit=250&page_info=${currentPageInfo}`;
      } else {
        const fromIso = fromDate ? `${fromDate}T00:00:00+08:00` : "2024-01-01T00:00:00+08:00";
        url += `status=any&limit=250&created_at_min=${fromIso}`;
      }

      const response = await fetch(url, { headers: { "X-Shopify-Access-Token": token }, cache: "no-store" });
      if (!response.ok) {
        if (response.status === 429) {
          // Rate limited, wait 2 sec and retry once
          await new Promise(r => setTimeout(r, 2000));
          continue;
        }
        throw new Error(`Shopify API error: ${response.status}`);
      }

      const data = await response.json();
      const shopifyOrders = data.orders || [];

      if (shopifyOrders.length === 0) {
        hasNext = false;
        currentPageInfo = null;
        break;
      }

      // 2. Parse orders
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

      // 3. Carefully extract ONLY rel="next"
      const linkHeader = response.headers.get("Link");
      if (linkHeader && linkHeader.includes('rel="next"')) {
        const links = linkHeader.split(",");
        const nextLink = links.find((l) => l.includes('rel="next"'));
        if (nextLink) {
          const match = nextLink.match(/page_info=([^>&]*)/);
          currentPageInfo = match ? match[1] : null;
        } else {
          hasNext = false;
          currentPageInfo = null;
        }
      } else {
        hasNext = false;
        currentPageInfo = null;
      }
    }

    // 4. Batch UPSERT into Supabase synchronously
    if (newValidOrders.length > 0) {
      for (let i = 0; i < newValidOrders.length; i += 200) {
        const { error } = await supabase.from("orders_cache").upsert(newValidOrders.slice(i, i + 200), { onConflict: "order_number,product_id" });
        if (error) console.error("Supabase upsert chunk error:", error);
      }
    }

    return NextResponse.json({
      success: true,
      nextPageInfo: currentPageInfo,
      itemsFound: newValidOrders.length
    });
  } catch (err) {
    console.error("Chunk sync error:", err);
    return apiError("Chunk Sync Failed", 500);
  }
}
