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
        async getAll() {
          return (await cookies()).getAll();
        },
        async setAll(cookiesToSet) {
          try {
            const store = await cookies();
            cookiesToSet.forEach(({ name, value, options }) =>
              store.set(name, value, options),
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
