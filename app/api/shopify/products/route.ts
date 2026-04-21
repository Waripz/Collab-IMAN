import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, apiError } from "@/lib/auth";
import { getShopifyToken } from "@/lib/shopify";

const SHOP = process.env.SHOPIFY_SHOP!;
const API_VERSION = "2024-01";

/**
 * GET /api/shopify/products
 * 
 * Fetch specific products by IDs (fast!) or search by title.
 * ?ids=123,456,789  → fetch specific product IDs
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return apiError("Unauthorized", 401);
    if (user.role !== "admin") return apiError("Forbidden", 403);

    const ids = request.nextUrl.searchParams.get("ids");
    
    if (!ids) {
      return NextResponse.json({ products: [] });
    }

    // Fetch specific products by IDs — single fast call
    const token = await getShopifyToken();
    const url = `https://${SHOP}.myshopify.com/admin/api/${API_VERSION}/products.json?ids=${ids}&fields=id,title,vendor,product_type,status,image`;
    
    const response = await fetch(url, {
      headers: { "X-Shopify-Access-Token": token },
    });

    if (!response.ok) {
      throw new Error(`Shopify API error: ${response.status}`);
    }

    const data = await response.json();

    return NextResponse.json({
      products: (data.products || []).map((p: { id: number; title: string; vendor: string; product_type: string; status: string; image?: { src: string } | null }) => ({
        id: p.id,
        title: p.title,
        vendor: p.vendor,
        product_type: p.product_type,
        status: p.status,
        image: p.image?.src || null,
      })),
    });
  } catch (err) {
    console.error("Products API error:", err);
    return apiError("Failed to fetch products", 500);
  }
}
