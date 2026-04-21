import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";

export async function POST(request: NextRequest) {
  const token = request.cookies.get("session_token")?.value;

  if (token) {
    const supabase = createServiceClient();
    await supabase.from("sessions").delete().eq("token", token);
  }

  const response = NextResponse.json({ success: true });
  response.cookies.delete("session_token");
  return response;
}
