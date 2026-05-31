import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, apiError } from "@/lib/auth";
import { getShopifyToken, stores } from "@/lib/shopify";
const API_VERSION = "2024-01";
export const maxDuration = 60;

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
      // Fetch all products for the Permissions page
      const { fetchAllProducts } = await import("@/lib/shopify");
      const allProducts = await fetchAllProducts();
      
      return NextResponse.json({
        products: allProducts.map((p: any) => ({
          id: p.id,
          title: p.title,
          vendor: p.vendor,
          product_type: p.product_type,
          status: p.status,
          image: p.image?.src || null,
        })),
      });
    }

    // Fetch specific products by IDs — across all configured stores
    const products: any[] = [];
    
    const fetchPromises = stores.map(async (store, i) => {
      try {
        const token = await getShopifyToken(i);
        const url = `https://${store.shop}.myshopify.com/admin/api/${API_VERSION}/products.json?ids=${ids}&fields=id,title,vendor,product_type,status,image`;
        
        const response = await fetch(url, { headers: { "X-Shopify-Access-Token": token } });
        if (response.ok) {
          return await response.json();
        } else {
          console.warn(`Shopify API error for store ${store.shop}: ${response.status}`);
          return null;
        }
      } catch (e) {
        console.warn(`Failed to fetch for store ${store.shop}`, e);
        return null;
      }
    });

    const results = await Promise.all(fetchPromises);
    for (const data of results) {
      if (data && data.products) {
        products.push(...data.products);
      }
    }

    return NextResponse.json({
      products: products.map((p: { id: number; title: string; vendor: string; product_type: string; status: string; image?: { src: string } | null }) => ({
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
