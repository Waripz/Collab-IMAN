import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "./supabase-server";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: "admin" | "publisher";
}

/**
 * Validate the session token from cookies and return user info.
 * Uses the service client to bypass RLS for profile lookup.
 */
export async function getAuthUser(
  request: NextRequest
): Promise<AuthUser | null> {
  const token = request.cookies.get("session_token")?.value;
  if (!token) return null;

  const supabase = createServiceClient();

  // Look up the user ID from the session token
  const { data: session, error: sessionError } = await supabase
    .from("sessions")
    .select("user_id, expires_at")
    .eq("token", token)
    .single();

  if (sessionError || !session) return null;

  // Check expiration
  if (new Date(session.expires_at) < new Date()) {
    await supabase.from("sessions").delete().eq("token", token);
    return null;
  }

  // Get the profile
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, email, name, role")
    .eq("id", session.user_id)
    .single();

  if (profileError || !profile) return null;

  return profile as AuthUser;
}

/**
 * Require authentication — returns 401 if not authenticated.
 */
export async function requireAuth(
  request: NextRequest
): Promise<AuthUser> {
  const user = await getAuthUser(request);
  if (!user) {
    throw new Response("Unauthorized", { status: 401 });
  }
  return user;
}

/**
 * Require admin role — returns 403 if not admin.
 */
export async function requireAdmin(
  request: NextRequest
): Promise<AuthUser> {
  const user = await requireAuth(request);
  if (user.role !== "admin") {
    throw new Response("Forbidden", { status: 403 });
  }
  return user;
}

/**
 * Helper for API route error handling.
 */
export function apiError(message: string, status: number = 500) {
  return NextResponse.json({ error: message }, { status });
}
