import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, apiError } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase-server";

// GET: Get permissions for a publisher
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return apiError("Unauthorized", 401);
    if (user.role !== "admin") return apiError("Forbidden", 403);

    const publisherId = request.nextUrl.searchParams.get("publisher_id");
    if (!publisherId) return apiError("publisher_id is required", 400);

    const supabase = createServiceClient();

    const { data: permissions, error } = await supabase
      .from("publisher_products")
      .select("shopify_product_id, product_title")
      .eq("user_id", publisherId);

    if (error) throw error;

    return NextResponse.json({ permissions: permissions || [] });
  } catch (err) {
    console.error("Permissions GET error:", err);
    return apiError("Failed to fetch permissions", 500);
  }
}

// PUT: Update permissions for a publisher (replace all)
export async function PUT(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return apiError("Unauthorized", 401);
    if (user.role !== "admin") return apiError("Forbidden", 403);

    const { publisher_id, products } = await request.json();

    if (!publisher_id || !Array.isArray(products)) {
      return apiError("publisher_id and products array are required", 400);
    }

    const supabase = createServiceClient();

    // Delete existing permissions
    await supabase
      .from("publisher_products")
      .delete()
      .eq("user_id", publisher_id);

    // Insert new permissions
    if (products.length > 0) {
      const rows = products.map((p: { id: number; title: string }) => ({
        user_id: publisher_id,
        shopify_product_id: p.id,
        product_title: p.title,
      }));

      const { error } = await supabase
        .from("publisher_products")
        .insert(rows);

      if (error) throw error;
    }

    return NextResponse.json({ success: true, count: products.length });
  } catch (err) {
    console.error("Permissions PUT error:", err);
    return apiError("Failed to update permissions", 500);
  }
}
