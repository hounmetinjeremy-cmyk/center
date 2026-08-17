// Supabase Edge Function — équivalent de artifacts/api-server/src/routes/access.ts
// Deploie via Supabase Studio → Edge Functions → Create a new function → colle ce code
// Nom de la fonction : "access"
// URL finale : https://<ton-projet>.supabase.co/functions/v1/access/<route>

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const COOKIE_NAME = "formation_access";
const TTL_SECONDS = 30 * 60;
const usedNonces = new Set<string>();

// Secrets à définir dans Supabase Studio → Edge Functions → Secrets :
//   SESSION_SECRET, WHATSAPP_GROUP_INVITE_URL
const SESSION_SECRET = Deno.env.get("SESSION_SECRET") ?? "";
const WHATSAPP_GROUP_INVITE_URL = Deno.env.get("WHATSAPP_GROUP_INVITE_URL") ?? "";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...CORS_HEADERS,
      ...extraHeaders,
    },
  });
}

async function sign(payload: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)));
  return base64UrlEncode(sig);
}

function base64UrlEncode(bytes: Uint8Array) {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function getCookie(req: Request, name: string): string | undefined {
  const raw = req.headers.get("cookie") ?? "";
  const pair = raw.split(";").map((p) => p.trim()).find((p) => p.startsWith(`${name}=`));
  return pair ? decodeURIComponent(pair.slice(name.length + 1)) : undefined;
}

function setCookieHeader(value: string, maxAge: number) {
  return `${COOKIE_NAME}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}; Secure`;
}

async function hasValidPayment(req: Request): Promise<string | null> {
  const value = getCookie(req, COOKIE_NAME);
  if (!value || !SESSION_SECRET) return null;
  const [expText, nonce, signature] = value.split(".");
  const exp = Number(expText);
  if (
    !expText || !nonce || !signature ||
    !Number.isFinite(exp) || exp <= Math.floor(Date.now() / 1000) ||
    usedNonces.has(nonce)
  ) {
    return null;
  }
  const expected = await sign(`${expText}.${nonce}`, SESSION_SECRET);
  if (expected !== signature) return null;
  return nonce;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  const url = new URL(req.url);
  // Retire le préfixe /access du chemin, ex: /access/status -> /status
  const path = url.pathname.replace(/^\/access/, "");

  if (path === "/status" && req.method === "GET") {
    const nonce = await hasValidPayment(req);
    return jsonResponse({ paid: Boolean(nonce), paymentMode: "simulation" });
  }

  if (path === "/simulate-payment" && req.method === "POST") {
    const body = await req.json().catch(() => ({}));
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    if (name.length < 2) {
      return jsonResponse({ message: "Un nom valide est requis avant la simulation du paiement." }, 400);
    }
    const exp = Math.floor(Date.now() / 1000) + TTL_SECONDS;
    const nonceBytes = new Uint8Array(18);
    crypto.getRandomValues(nonceBytes);
    const nonce = base64UrlEncode(nonceBytes);
    const payload = `${exp}.${nonce}`;
    const value = `${payload}.${await sign(payload, SESSION_SECRET)}`;

    return jsonResponse(
      { paid: true, paymentMode: "simulation", expiresInSeconds: TTL_SECONDS },
      201,
      { "Set-Cookie": setCookieHeader(value, TTL_SECONDS) },
    );
  }

  if (path === "/whatsapp" && req.method === "POST") {
    const nonce = await hasValidPayment(req);
    if (!nonce) {
      return jsonResponse(
        { message: "Paiement non confirmé. Simulez le paiement avant de rejoindre le groupe." },
        403,
      );
    }
    if (!WHATSAPP_GROUP_INVITE_URL) {
      return jsonResponse({ message: "L'accès WhatsApp n'est pas configuré côté serveur." }, 503);
    }
    usedNonces.add(nonce);
    return new Response(null, {
      status: 303,
      headers: {
        Location: WHATSAPP_GROUP_INVITE_URL,
        "Set-Cookie": setCookieHeader("", 0),
        ...CORS_HEADERS,
      },
    });
  }

  return jsonResponse({ message: "Not found" }, 404);
});
