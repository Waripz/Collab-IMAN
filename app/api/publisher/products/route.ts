import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, apiError } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase-server";
import { getShopifyToken } from "@/lib/shopify";

const SHOP = process.env.SHOPIFY_SHOP!;
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

    // Fetch product details from Shopify by IDs (single fast call)
    const token = await getShopifyToken();
    const url = `https://${SHOP}.myshopify.com/admin/api/${API_VERSION}/products.json?ids=${productIds.join(",")}&fields=id,title,vendor,product_type,status,image,variants,created_at,updated_at`;

    const response = await fetch(url, {
      headers: { "X-Shopify-Access-Token": token },
    });

    if (!response.ok) {
      throw new Error(`Shopify API error: ${response.status}`);
    }

    const data = await response.json();

    const products = (data.products || []).map((p: {
      id: number;
      title: string;
      vendor: string;
      product_type: string;
      status: string;
      image?: { src: string } | null;
      variants?: { price: string; inventory_quantity: number }[];
      created_at: string;
      updated_at: string;
    }) => ({
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

    return NextResponse.json({ products });
  } catch (err) {
    console.error("Publisher products error:", err);
    return apiError("Failed to fetch products", 500);
  }
}
