import { NextRequest, NextResponse } from "next/server";
export const dynamic = "force-dynamic";
import { getAuthUser, apiError } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase-server";

/**
 * GET /api/admin/sync-log
 * Returns the most recent 10 sync history records
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return apiError("Unauthorized", 401);
    if (user.role !== "admin") return apiError("Forbidden", 403);

    const supabase = createServiceClient();
    
    // Fetch top 10 logs with the name of the admin who ran it
    const { data, error } = await supabase
      .from("sync_logs")
      .select(`
        *,
        profiles:admin_id ( name )
      `)
      .order("started_at", { ascending: false })
      .limit(10);

    if (error) throw new Error(error.message);

    return NextResponse.json({ logs: data || [] });
  } catch (err) {
    console.error("Fetch sync logs error:", err);
    return apiError("Failed to fetch logs", 500);
  }
}

/**
 * POST /api/admin/sync-log
 * Saves a completed or failed sync run iteration
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return apiError("Unauthorized", 401);
    if (user.role !== "admin") return apiError("Forbidden", 403);

    const body = await request.json();
    const supabase = createServiceClient();

    const { error } = await supabase
      .from("sync_logs")
      .insert({
        admin_id: user.id,
        started_at: body.started_at || new Date().toISOString(),
        completed_at: new Date().toISOString(),
        scanned_from_date: body.scanned_from_date || "2024-01-01",
        total_items_found: body.total_items_found || 0,
        status: body.status || 'success',
        error_message: body.error_message || null
      });

    if (error) throw new Error(error.message);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Save sync log error:", err);
    return apiError("Failed to save log", 500);
  }
}
