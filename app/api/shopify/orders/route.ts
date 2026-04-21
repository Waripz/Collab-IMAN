import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, apiError } from "@/lib/auth";
import { fetchAllOrders, filterOrdersByProducts } from "@/lib/shopify";
import { createServiceClient } from "@/lib/supabase-server";

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return apiError("Unauthorized", 401);

    const supabase = createServiceClient();

    // Get allowed product IDs for this user
    let allowedProductIds: number[] = [];

    if (user.role === "admin") {
      // Admin can optionally filter by publisher_id query param
      const publisherId = request.nextUrl.searchParams.get("publisher_id");
      if (publisherId) {
        const { data } = await supabase
          .from("publisher_products")
          .select("shopify_product_id")
          .eq("user_id", publisherId);
        allowedProductIds = (data || []).map((d) => d.shopify_product_id);
      } else {
        // Return all orders if no filter
        const { data } = await supabase
          .from("publisher_products")
          .select("shopify_product_id");
        const allIds = (data || []).map((d) => d.shopify_product_id);
        allowedProductIds = [...new Set(allIds)];
      }
    } else {
      // Publisher: only their assigned products
      const { data } = await supabase
        .from("publisher_products")
        .select("shopify_product_id")
        .eq("user_id", user.id);
      allowedProductIds = (data || []).map((d) => d.shopify_product_id);
    }

    if (allowedProductIds.length === 0) {
      return NextResponse.json({ orders: [], summary: { totalUnits: 0, totalRevenue: 0, totalOrders: 0 } });
    }

    // Get event date range
    const { data: eventSettings } = await supabase
      .from("event_settings")
      .select("start_date, end_date")
      .limit(1)
      .single();

    const sinceDate = request.nextUrl.searchParams.get("since") || eventSettings?.start_date || undefined;
    const untilDate = request.nextUrl.searchParams.get("until") || eventSettings?.end_date || undefined;

    // Fetch and filter orders
    const allOrders = await fetchAllOrders(sinceDate, untilDate);
    const filtered = filterOrdersByProducts(allOrders, allowedProductIds);

    // Calculate summary
    const totalUnits = filtered.reduce((sum, o) => sum + o.quantity, 0);
    const totalRevenue = filtered.reduce((sum, o) => sum + o.price * o.quantity, 0);
    const uniqueOrders = new Set(filtered.map((o) => o.orderNumber));

    return NextResponse.json({
      orders: filtered,
      summary: {
        totalUnits,
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        totalOrders: uniqueOrders.size,
        onlineOrders: filtered.filter((o) => o.channel === "Online").length,
        posOrders: filtered.filter((o) => o.channel === "POS").length,
      },
    });
  } catch (err) {
    console.error("Orders API error:", err);
    return apiError("Failed to fetch orders", 500);
  }
}
