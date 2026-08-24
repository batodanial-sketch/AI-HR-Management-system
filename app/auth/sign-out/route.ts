import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { supabaseUrl, supabasePublishableKey } from "@/lib/supabase/env";

export const dynamic = "force-dynamic";

export async function POST(): Promise<NextResponse> {
  const url = supabaseUrl();
  const anonKey = supabasePublishableKey();

  if (url && anonKey) {
    const supabase = createServerClient(url, anonKey, {
      cookies: {
        getAll() {
          return cookies().getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookies().set(name, value, options),
            );
          } catch {
            // Response already started; cookie handling delegated to middleware.
          }
        },
      },
    });
    await supabase.auth.signOut();
  }

  return NextResponse.redirect(new URL("/login", process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"));
}
