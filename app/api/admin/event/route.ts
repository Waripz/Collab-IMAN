import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, apiError } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase-server";

// GET: Get event settings
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return apiError("Unauthorized", 401);

    const supabase = createServiceClient();
    const { data } = await supabase
      .from("event_settings")
      .select("*")
      .limit(1)
      .single();

    return NextResponse.json({ event: data });
  } catch (err) {
    console.error("Event settings GET error:", err);
    return apiError("Failed to fetch event settings", 500);
  }
}

// PUT: Update event settings (admin only)
export async function PUT(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return apiError("Unauthorized", 401);
    if (user.role !== "admin") return apiError("Forbidden", 403);

    const { event_name, start_date, end_date } = await request.json();

    const supabase = createServiceClient();

    const { data, error } = await supabase
      .from("event_settings")
      .update({
        event_name: event_name || "Event",
        start_date: start_date || null,
        end_date: end_date || null,
      })
      .eq("id", 1)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ event: data });
  } catch (err) {
    console.error("Event settings PUT error:", err);
    return apiError("Failed to update event settings", 500);
  }
}
