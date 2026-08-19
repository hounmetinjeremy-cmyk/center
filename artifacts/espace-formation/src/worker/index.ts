/**
 * Worker "center" : sert le site statique (React) via env.ASSETS.fetch,
 * SAUF pour /api/fedapay/* qu'il intercepte pour relayer la cle secrete
 * FedaPay (stockee ici, dans les secrets Cloudflare) vers la fonction
 * Supabase qui fait le vrai travail (creation de transaction, etc.).
 *
 * La cle ne quitte jamais Cloudflare -> Supabase que via un header HTTPS,
 * jamais visible cote navigateur.
 */

export interface Env {
  ASSETS: Fetcher;
  FEDAPAY_SECRET_KEY: string;
}

const SUPABASE_FUNCTION_BASE = "https://uvkpqgihomwgszhrapda.supabase.co/functions/v1/access";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/fedapay/")) {
      const targetPath = url.pathname.replace("/api/fedapay", "");
      const targetUrl = `${SUPABASE_FUNCTION_BASE}${targetPath}${url.search}`;

      const forwardedHeaders = new Headers(request.headers);
      forwardedHeaders.set("X-Fedapay-Secret", env.FEDAPAY_SECRET_KEY ?? "");
      forwardedHeaders.delete("host");

      const forwardedRequest = new Request(targetUrl, {
        method: request.method,
        headers: forwardedHeaders,
        body: request.method !== "GET" && request.method !== "HEAD" ? await request.text() : undefined,
      });

      const response = await fetch(forwardedRequest);

      // Recopie la reponse avec les en-tetes CORS necessaires pour le navigateur.
      const responseBody = await response.text();
      const responseHeaders = new Headers(response.headers);
      responseHeaders.set("Access-Control-Allow-Origin", request.headers.get("origin") ?? "*");
      responseHeaders.set("Access-Control-Allow-Credentials", "true");

      return new Response(responseBody, {
        status: response.status,
        headers: responseHeaders,
      });
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
