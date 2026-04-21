import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, apiError } from "@/lib/auth";
import { fetchAllOrders, filterOrdersByProducts, fetchAllProducts } from "@/lib/shopify";
import { createServiceClient } from "@/lib/supabase-server";

/**
 * POST /api/admin/sync
 * Syncs orders and products from Shopify into Supabase cache.
 * Admin only. Takes a while but only needs to be done manually.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return apiError("Unauthorized", 401);
    if (user.role !== "admin") return apiError("Forbidden", 403);

    const supabase = createServiceClient();
    const results = { products: 0, orders: 0 };

    // 1. Sync products
    const products = await fetchAllProducts();
    const productRows = products.map((p) => ({
      shopify_product_id: p.id,
      title: p.title,
      vendor: p.vendor,
      product_type: p.product_type,
      image_url: p.image?.src || null,
      status: p.status,
      cached_at: new Date().toISOString(),
    }));

    for (let i = 0; i < productRows.length; i += 50) {
      await supabase
        .from("shopify_products_cache")
        .upsert(productRows.slice(i, i + 50), { onConflict: "shopify_product_id" });
    }
    results.products = products.length;

    // 2. Get all tracked product IDs (from publisher_products)
    const { data: allPerms } = await supabase
      .from("publisher_products")
      .select("shopify_product_id");

    const trackedIds = [...new Set((allPerms || []).map((p) => p.shopify_product_id))];

    if (trackedIds.length > 0) {
      // 3. Fetch orders from Shopify
      const allOrders = await fetchAllOrders();
      const filtered = filterOrdersByProducts(allOrders, trackedIds);

      // 4. Clear old cache and insert fresh
      await supabase.from("orders_cache").delete().gte("id", 0);

      const orderRows = filtered.map((o) => ({
        order_date: o.date,
        order_number: o.orderNumber,
        product_name: o.productName,
        product_id: o.productId,
        quantity: o.quantity,
        price: o.price,
        channel: o.channel,
        synced_at: new Date().toISOString(),
      }));

      for (let i = 0; i < orderRows.length; i += 50) {
        await supabase.from("orders_cache").upsert(
          orderRows.slice(i, i + 50),
          { onConflict: "order_number,product_id" }
        );
      }
      results.orders = filtered.length;
    }

    return NextResponse.json({
      message: "Sync complete!",
      products: results.products,
      orders: results.orders,
      syncedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Sync error:", err);
    return apiError("Sync failed: " + (err instanceof Error ? err.message : "Unknown error"), 500);
  }
}
