import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, apiError } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase-server";

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return apiError("Unauthorized", 401);

    const supabase = createServiceClient();

    // Get allowed product IDs for this user
    let allowedProductIds: number[] = [];

    if (user.role === "admin") {
      const publisherId = request.nextUrl.searchParams.get("publisher_id");
      if (publisherId) {
        const { data } = await supabase
          .from("publisher_products")
          .select("shopify_product_id")
          .eq("user_id", publisherId);
        allowedProductIds = (data || []).map((d) => d.shopify_product_id);
      } else {
        const { data } = await supabase
          .from("publisher_products")
          .select("shopify_product_id");
        allowedProductIds = [...new Set((data || []).map((d) => d.shopify_product_id))];
      }
    } else {
      const { data } = await supabase
        .from("publisher_products")
        .select("shopify_product_id")
        .eq("user_id", user.id);
      allowedProductIds = (data || []).map((d) => d.shopify_product_id);
    }

    if (allowedProductIds.length === 0) {
      return NextResponse.json({
        orders: [],
        summary: { totalUnits: 0, totalRevenue: 0, totalOrders: 0, onlineOrders: 0, posOrders: 0 },
      });
    }

    // Read from orders_cache in Supabase (fast!)
    const { data: cachedOrders, error } = await supabase
      .from("orders_cache")
      .select("*")
      .in("product_id", allowedProductIds)
      .order("order_date", { ascending: false });

    if (error) {
      console.error("Orders cache error:", error);
      return apiError("Failed to fetch orders", 500);
    }

    const orders = (cachedOrders || []).map((o) => ({
      date: o.order_date,
      orderNumber: o.order_number,
      productName: o.product_name,
      productId: o.product_id,
      quantity: o.quantity,
      price: parseFloat(o.price),
      channel: o.channel,
    }));

    // Calculate summary
    const totalUnits = orders.reduce((sum, o) => sum + o.quantity, 0);
    const totalRevenue = orders.reduce((sum, o) => sum + o.price * o.quantity, 0);
    const uniqueOrders = new Set(orders.map((o) => o.orderNumber));

    return NextResponse.json({
      orders,
      summary: {
        totalUnits,
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        totalOrders: uniqueOrders.size,
        onlineOrders: orders.filter((o) => o.channel === "Online").length,
        posOrders: orders.filter((o) => o.channel === "POS").length,
      },
    });
  } catch (err) {
    console.error("Orders API error:", err);
    return apiError("Failed to fetch orders", 500);
  }
}
