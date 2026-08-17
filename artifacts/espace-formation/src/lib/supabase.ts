import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) ??
  "https://iykryokvyrbdznbdxxjo.supabase.co";

const SUPABASE_ANON_KEY =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml5a3J5b2t2eXJiZHpuYmR4eGpvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYxMjg2MDUsImV4cCI6MjEwMTcwNDYwNX0.2dlNDYxBcR9HYoBpNGbnnrdXIyd1qkH6ZE1M9S8OUIE";

/**
 * Supabase = base de donnees uniquement (profils et donnees de l'app).
 * Aucune authentification Supabase : la connexion passe par Firebase.
 */
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});
