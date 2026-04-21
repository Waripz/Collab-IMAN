import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import bcrypt from "bcryptjs";

/**
 * One-time admin setup endpoint.
 * POST /api/auth/setup
 * Body: { email, password, name }
 * 
 * Only works if no admin exists yet.
 */
export async function POST(request: NextRequest) {
  try {
    const { email, password, name } = await request.json();

    if (!email || !password || !name) {
      return NextResponse.json(
        { error: "email, password, and name are required" },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();

    // Check if any admin already exists
    const { data: existingAdmin } = await supabase
      .from("profiles")
      .select("id")
      .eq("role", "admin")
      .limit(1);

    if (existingAdmin && existingAdmin.length > 0) {
      return NextResponse.json(
        { error: "Admin account already exists. Use login instead." },
        { status: 403 }
      );
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Create admin profile
    const { data: profile, error } = await supabase
      .from("profiles")
      .insert({
        email: email.toLowerCase().trim(),
        password_hash: passwordHash,
        name,
        role: "admin",
      })
      .select("id, email, name, role")
      .single();

    if (error) {
      console.error("Setup error:", error);
      return NextResponse.json(
        { error: "Failed to create admin account" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message: "Admin account created successfully!",
      user: profile,
    });
  } catch (err) {
    console.error("Setup error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
