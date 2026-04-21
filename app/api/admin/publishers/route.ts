import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, apiError } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase-server";
import bcrypt from "bcryptjs";

// GET: List all publishers (admin only)
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return apiError("Unauthorized", 401);
    if (user.role !== "admin") return apiError("Forbidden", 403);

    const supabase = createServiceClient();

    const { data: publishers, error } = await supabase
      .from("profiles")
      .select("id, email, name, role, created_at")
      .eq("role", "publisher")
      .order("created_at", { ascending: false });

    if (error) throw error;

    // Get product counts per publisher
    const result = [];
    for (const pub of publishers || []) {
      const { count } = await supabase
        .from("publisher_products")
        .select("id", { count: "exact", head: true })
        .eq("user_id", pub.id);

      result.push({
        ...pub,
        productCount: count || 0,
      });
    }

    return NextResponse.json({ publishers: result });
  } catch (err) {
    console.error("Publishers API error:", err);
    return apiError("Failed to fetch publishers", 500);
  }
}

// POST: Create a new publisher (admin only)
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return apiError("Unauthorized", 401);
    if (user.role !== "admin") return apiError("Forbidden", 403);

    const { email, password, name } = await request.json();

    if (!email || !password || !name) {
      return apiError("email, password, and name are required", 400);
    }

    if (password.length < 6) {
      return apiError("Password must be at least 6 characters", 400);
    }

    const supabase = createServiceClient();

    // Check if email already exists
    const { data: existing } = await supabase
      .from("profiles")
      .select("id")
      .eq("email", email.toLowerCase().trim())
      .single();

    if (existing) {
      return apiError("A user with this email already exists", 409);
    }

    // Hash password and create publisher
    const passwordHash = await bcrypt.hash(password, 12);

    const { data: publisher, error } = await supabase
      .from("profiles")
      .insert({
        email: email.toLowerCase().trim(),
        password_hash: passwordHash,
        name,
        role: "publisher",
      })
      .select("id, email, name, role, created_at")
      .single();

    if (error) throw error;

    return NextResponse.json({ publisher }, { status: 201 });
  } catch (err) {
    console.error("Create publisher error:", err);
    return apiError("Failed to create publisher", 500);
  }
}

// DELETE: Delete a publisher (admin only)
export async function DELETE(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return apiError("Unauthorized", 401);
    if (user.role !== "admin") return apiError("Forbidden", 403);

    const { id } = await request.json();
    if (!id) return apiError("Publisher ID is required", 400);

    const supabase = createServiceClient();

    // Delete sessions, permissions, and profile (cascade should handle permissions)
    await supabase.from("sessions").delete().eq("user_id", id);
    const { error } = await supabase.from("profiles").delete().eq("id", id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Delete publisher error:", err);
    return apiError("Failed to delete publisher", 500);
  }
}
