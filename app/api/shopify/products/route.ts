import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, apiError } from "@/lib/auth";
import { fetchAllProducts } from "@/lib/shopify";
import { createServiceClient } from "@/lib/supabase-server";

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return apiError("Unauthorized", 401);
    if (user.role !== "admin") return apiError("Forbidden", 403);

    // Fetch products from Shopify
    const products = await fetchAllProducts();

    // Update cache in Supabase
    const supabase = createServiceClient();
    const cacheRows = products.map((p) => ({
      shopify_product_id: p.id,
      title: p.title,
      vendor: p.vendor,
      product_type: p.product_type,
      image_url: p.image?.src || null,
      status: p.status,
      cached_at: new Date().toISOString(),
    }));

    // Upsert in batches of 50
    for (let i = 0; i < cacheRows.length; i += 50) {
      const batch = cacheRows.slice(i, i + 50);
      await supabase
        .from("shopify_products_cache")
        .upsert(batch, { onConflict: "shopify_product_id" });
    }

    return NextResponse.json({
      products: products.map((p) => ({
        id: p.id,
        title: p.title,
        vendor: p.vendor,
        product_type: p.product_type,
        status: p.status,
        image: p.image?.src || null,
        totalInventory: p.variants.reduce(
          (sum, v) => sum + (v.inventory_quantity || 0),
          0
        ),
      })),
    });
  } catch (err) {
    console.error("Products API error:", err);
    return apiError("Failed to fetch products", 500);
  }
}
