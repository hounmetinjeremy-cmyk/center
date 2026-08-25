/**
 * Worker "center" : sert le site statique (React) via env.ASSETS.fetch,
 * SAUF pour /api/fedapay/* qu'il intercepte pour :
 *  - relayer la cle secrete FedaPay + le mode (sandbox/live, decide ici
 *    cote serveur, jamais par le navigateur) vers Supabase ;
 *  - recevoir et VERIFIER les webhooks FedaPay (confirmation instantanee).
 */

export interface Env {
  ASSETS: Fetcher;
  FEDAPAY_MODE: string; // "sandbox" | "live"
  FEDAPAY_PUBLIC_KEY: string;
  FEDAPAY_SECRET_KEY: string;
  FEDAPAY_WEBHOOK_KEY: string;
}

const SUPABASE_CENTER_FUNCTION_BASE = "https://iykryokvyrbdznbdxxjo.supabase.co/functions/v1/access";
// Cle publique (anon) Supabase : intentionnellement visible cote client, ne
// donne acces qu'a des fonctions RPC controlees, plus a un acces table direct.
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml5a3J5b2t2eXJiZHpuYmR4eGpvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYxMjg2MDUsImV4cCI6MjEwMTcwNDYwNX0.2dlNDYxBcR9HYoBpNGbnnrdXIyd1qkH6ZE1M9S8OUIE";

async function hmacSha256Hex(key: string, message: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// FedaPay signe ses webhooks via l'en-tete "FedaPay-Signature": "t=<timestamp>,s=<signature_hex>"
async function verifyFedaPaySignature(rawBody: string, signatureHeader: string | null, webhookKey: string): Promise<boolean> {
  if (!signatureHeader || !webhookKey) return false;
  const parts = Object.fromEntries(
    signatureHeader.split(",").map((p) => {
      const [k, v] = p.split("=");
      return [k?.trim(), v?.trim()];
    }),
  );
  const timestamp = parts["t"];
  const signature = parts["s"];
  if (!timestamp || !signature) return false;
  const expected = await hmacSha256Hex(webhookKey, `${timestamp}.${rawBody}`);
  return expected === signature;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const mode = env.FEDAPAY_MODE === "live" ? "live" : "sandbox";

    // ─── Diagnostic : dit uniquement SI chaque variable est presente/vide,
    // JAMAIS sa valeur reelle. Utile pour verifier une config Cloudflare
    // sans exposer de secret. A retirer une fois le probleme resolu.
    if (url.pathname === "/api/fedapay/debug") {
      const describe = (v: string | undefined) => (v ? `presente (${v.length} caracteres)` : "VIDE ou absente");
      return new Response(
        JSON.stringify(
          {
            FEDAPAY_MODE: env.FEDAPAY_MODE || "VIDE ou absente",
            FEDAPAY_PUBLIC_KEY: describe(env.FEDAPAY_PUBLIC_KEY),
            FEDAPAY_SECRET_KEY: describe(env.FEDAPAY_SECRET_KEY),
            FEDAPAY_WEBHOOK_KEY: describe(env.FEDAPAY_WEBHOOK_KEY),
          },
          null,
          2,
        ),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    // ─── Webhook FedaPay : appele directement par FedaPay, pas par le navigateur ───
    if (url.pathname === "/api/fedapay/webhook" && request.method === "POST") {
      const rawBody = await request.text();
      const signatureHeader = request.headers.get("fedapay-signature") ?? request.headers.get("FedaPay-Signature");

      const valid = await verifyFedaPaySignature(rawBody, signatureHeader, env.FEDAPAY_WEBHOOK_KEY);
      if (!valid) {
        return new Response(JSON.stringify({ error: "Signature invalide" }), { status: 401 });
      }

      let event: Record<string, unknown> = {};
      try {
        event = JSON.parse(rawBody);
      } catch {
        return new Response(JSON.stringify({ received: true }), { status: 200 });
      }

      const data = event.data as Record<string, unknown> | undefined;
      const rawId = data?.id ?? (event.transaction as Record<string, unknown> | undefined)?.id;
      const transactionId = rawId != null ? Number(rawId) : null;
      const eventName = String(event.name ?? "");
      const status = eventName.includes("approved")
        ? "approved"
        : eventName.includes("declined")
          ? "declined"
          : eventName.includes("canceled")
            ? "canceled"
            : null;

      if (transactionId && status) {
        // Passe par une fonction SECURITY DEFINER : la table fedapay_transactions
        // n'accepte plus d'ecriture directe via l'API REST publique (evite
        // qu'un tiers falsifie un statut "approved" pour obtenir un ticket).
        await fetch(`https://iykryokvyrbdznbdxxjo.supabase.co/rest/v1/rpc/record_fedapay_status`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "apikey": SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ p_transaction_id: transactionId, p_status: status }),
        });
      }

      return new Response(JSON.stringify({ received: true }), { status: 200 });
    }

    // ─── Reste des appels de paiement : relais avec cle secrete + mode (serveur) ───
    if (url.pathname.startsWith("/api/fedapay/")) {
      const targetPath = url.pathname.replace("/api/fedapay", "");
      const targetUrl = new URL(`${SUPABASE_CENTER_FUNCTION_BASE}${targetPath}${url.search}`);
      targetUrl.searchParams.set("mode", mode);

      const forwardedHeaders = new Headers(request.headers);
      forwardedHeaders.set("X-Fedapay-Secret", env.FEDAPAY_SECRET_KEY ?? "");
      forwardedHeaders.set("X-Fedapay-Public", env.FEDAPAY_PUBLIC_KEY ?? "");
      forwardedHeaders.set("X-Fedapay-Mode", mode);
      forwardedHeaders.delete("host");

      let bodyText: string | undefined;
      if (request.method !== "GET" && request.method !== "HEAD") {
        bodyText = await request.text();
        try {
          const parsed = bodyText ? JSON.parse(bodyText) : {};
          parsed.mode = mode; // le serveur decide, pas le navigateur
          bodyText = JSON.stringify(parsed);
        } catch {
          // corps non-JSON : on le laisse tel quel
        }
      }

      const forwardedRequest = new Request(targetUrl.toString(), {
        method: request.method,
        headers: forwardedHeaders,
        body: bodyText,
      });

      const response = await fetch(forwardedRequest);
      const responseBody = await response.text();
      const responseHeaders = new Headers(response.headers);
      responseHeaders.set("Access-Control-Allow-Origin", request.headers.get("origin") ?? "*");
      responseHeaders.set("Access-Control-Allow-Credentials", "true");

      return new Response(responseBody, { status: response.status, headers: responseHeaders });
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
