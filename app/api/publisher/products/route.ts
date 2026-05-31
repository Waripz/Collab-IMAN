import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, apiError } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase-server";
import { getShopifyToken, stores } from "@/lib/shopify";
const API_VERSION = "2024-01";

/**
 * GET /api/publisher/products
 * Returns the current publisher's assigned products with full Shopify details.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return apiError("Unauthorized", 401);

    const supabase = createServiceClient();

    // Get this publisher's assigned product IDs
    const { data: perms } = await supabase
      .from("publisher_products")
      .select("shopify_product_id, product_title")
      .eq("user_id", user.id);

    const productIds = (perms || []).map((p) => p.shopify_product_id);

    if (productIds.length === 0) {
      return NextResponse.json({ products: [] });
    }

    // Shopify API limits ?ids=... to 50 IDs per request. We must chunk them.
    const products: any[] = [];
    const chunkSize = 50;
    
    const fetchPromises = [];
    
    for (let i = 0; i < stores.length; i++) {
      const store = stores[i];
      const token = await getShopifyToken(i);
      
      for (let j = 0; j < productIds.length; j += chunkSize) {
        const idChunk = productIds.slice(j, j + chunkSize);
        const url = `https://${store.shop}.myshopify.com/admin/api/${API_VERSION}/products.json?ids=${idChunk.join(",")}&fields=id,title,vendor,product_type,status,image,variants,created_at,updated_at`;

        fetchPromises.push(
          fetch(url, { headers: { "X-Shopify-Access-Token": token } })
            .then(res => res.ok ? res.json() : null)
            .catch(err => {
              console.warn(`Shopify API error for store ${store.shop}:`, err);
              return null;
            })
        );
      }
    }

    const results = await Promise.all(fetchPromises);
    for (const data of results) {
      if (data && data.products) {
        products.push(...data.products);
      }
    }

    const formattedProducts = products.map((p: any) => ({
      id: p.id,
      title: p.title,
      vendor: p.vendor,
      product_type: p.product_type,
      status: p.status,
      image: p.image?.src || null,
      price: p.variants?.[0]?.price || "0.00",
      inventory: p.variants?.reduce((sum: number, v: { inventory_quantity: number }) => sum + (v.inventory_quantity || 0), 0) || 0,
      created_at: p.created_at,
      updated_at: p.updated_at,
    }));

    return NextResponse.json({ products: formattedProducts });
  } catch (err) {
    console.error("Publisher products error:", err);
    return apiError("Failed to fetch products", 500);
  }
}
