"use client";

import { createBrowserClient } from "@supabase/ssr";
import { supabaseUrl, supabasePublishableKey } from "./env";

/**
 * Browser Supabase client for client components (login form, etc.). Falls back
 * to a no-op marker when the environment is not configured so client code can
 * branch into "demo mode" without throwing.
 *
 * Uses the Publishable key (with legacy anon-key fallback).
 */
export function createClient() {
  const url = supabaseUrl();
  const key = supabasePublishableKey();
  if (!url || !key) {
    return null;
  }
  return createBrowserClient(url, key);
}
