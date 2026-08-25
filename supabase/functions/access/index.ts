// Supabase Edge Function — gestion du ticket d'entree + retraits (payout) FedaPay.

const COOKIE_NAME = "formation_access";
const TTL_SECONDS = 30 * 60;
const usedNonces = new Set<string>();
const TICKET_PRICE_XOF = 1000;

// Email fixe utilise pour TOUTES les transactions FedaPay (pas celui de
// l'utilisateur) : evite que FedaPay envoie ses notifications aux clients.
const FEDAPAY_CUSTOMER_EMAIL = "hounmetinjeremy@gmail.com";

// SESSION_SECRET, SUPABASE_ANON_KEY et WHATSAPP_GROUP_INVITE_URL doivent etre
// definies dans Supabase Studio -> Edge Functions -> Secrets. Aucune valeur
// par defaut ici : ne jamais committer de secret en dur dans ce fichier.
const SESSION_SECRET = Deno.env.get("SESSION_SECRET") ?? "";
const WHATSAPP_GROUP_INVITE_URL = Deno.env.get("WHATSAPP_GROUP_INVITE_URL") ?? "";
const SUPABASE_URL = "https://iykryokvyrbdznbdxxjo.supabase.co";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-fedapay-secret",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Credentials": "true",
    "Vary": "Origin",
  };
}

function jsonResponse(cors: Record<string, string>, body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...cors, ...extraHeaders },
  });
}

async function sign(payload: string, secret: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)));
  return base64UrlEncode(sig);
}

function base64UrlEncode(bytes: Uint8Array) {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function randomTicketCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

function getCookie(req: Request, name: string): string | undefined {
  const raw = req.headers.get("cookie") ?? "";
  const pair = raw.split(";").map((p) => p.trim()).find((p) => p.startsWith(`${name}=`));
  return pair ? decodeURIComponent(pair.slice(name.length + 1)) : undefined;
}

function setCookieHeader(value: string, maxAge: number) {
  return `${COOKIE_NAME}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=None; Max-Age=${maxAge}; Secure`;
}

async function readTicket(req: Request): Promise<{ nonce: string; code: string } | null> {
  const value = getCookie(req, COOKIE_NAME);
  if (!value || !SESSION_SECRET) return null;
  const [expText, nonce, code, signature] = value.split(".");
  const exp = Number(expText);
  if (!expText || !nonce || !code || !signature || !Number.isFinite(exp) || exp <= Math.floor(Date.now() / 1000) || usedNonces.has(nonce)) return null;
  const expected = await sign(`${expText}.${nonce}.${code}`, SESSION_SECRET);
  if (expected !== signature) return null;
  return { nonce, code };
}

async function issueTicketCookie(): Promise<{ code: string; header: string }> {
  const exp = Math.floor(Date.now() / 1000) + TTL_SECONDS;
  const nonceBytes = new Uint8Array(18);
  crypto.getRandomValues(nonceBytes);
  const nonce = base64UrlEncode(nonceBytes);
  const code = randomTicketCode();
  const payload = `${exp}.${nonce}.${code}`;
  const value = `${payload}.${await sign(payload, SESSION_SECRET)}`;
  return { code, header: setCookieHeader(value, TTL_SECONDS) };
}

async function createFedaPayTransaction(apiBase: string, secretKey: string, input: { amount: number; description: string; customerEmail: string; customerFirstname: string; customerLastname: string; phoneNumber?: string; country?: string }): Promise<{ id: number }> {
  const body: Record<string, unknown> = {
    description: input.description,
    amount: input.amount,
    currency: { iso: "XOF" },
    customer: {
      firstname: input.customerFirstname,
      lastname: input.customerLastname,
      email: input.customerEmail,
      ...(input.phoneNumber && input.country ? { phone_number: { number: input.phoneNumber, country: input.country.toLowerCase() } } : {}),
    },
  };
  const res = await fetch(`${apiBase}/transactions`, { method: "POST", headers: { Authorization: `Bearer ${secretKey}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const raw = await res.text();
  let data: Record<string, unknown> = {};
  try { if (raw.trim()) data = JSON.parse(raw); } catch { /* ignore */ }
  if (!res.ok) throw new Error((data?.message as string) ?? `FedaPay HTTP ${res.status}`);
  const tx = (data?.["v1/transaction"] as Record<string, unknown>) ?? (data?.transaction as Record<string, unknown>) ?? data;
  const id = tx?.id as number | undefined;
  if (!id) throw new Error("ID transaction FedaPay non recu");
  return { id };
}

async function generateFedaPayToken(apiBase: string, secretKey: string, transactionId: number): Promise<{ token: string; url?: string }> {
  const res = await fetch(`${apiBase}/transactions/${transactionId}/token`, { method: "POST", headers: { Authorization: `Bearer ${secretKey}`, "Content-Type": "application/json" }, body: "{}" });
  const raw = await res.text();
  let data: Record<string, unknown> = {};
  try { if (raw.trim()) data = JSON.parse(raw); } catch { /* ignore */ }
  if (!res.ok) throw new Error((data?.message as string) ?? `FedaPay HTTP ${res.status}`);
  const tokenObj = data?.token as Record<string, unknown> | string | undefined;
  const token = typeof tokenObj === "string" ? tokenObj : (tokenObj?.token as string | undefined);
  const url = (data?.url as string) ?? (typeof tokenObj === "object" ? (tokenObj?.url as string) : undefined);
  if (!token) throw new Error("Token FedaPay non recu");
  return { token, url };
}

function fedaPayApiBase(mode: string) {
  return mode === "live" ? "https://api.fedapay.com/v1" : "https://sandbox-api.fedapay.com/v1";
}

async function readTransactionFromDb(transactionId: string): Promise<{ status: string | null; userId: string | null }> {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/fedapay_transactions?transaction_id=eq.${transactionId}&select=status,user_id`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
    });
    if (!res.ok) return { status: null, userId: null };
    const rows = (await res.json()) as Array<{ status: string; user_id: string | null }>;
    return { status: rows[0]?.status ?? null, userId: rows[0]?.user_id ?? null };
  } catch {
    return { status: null, userId: null };
  }
}

async function upsertFedapayTransaction(transactionId: number, status: string, userId: string | null): Promise<void> {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/fedapay_transactions`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates",
      },
      body: JSON.stringify({ transaction_id: transactionId, status, user_id: userId, updated_at: new Date().toISOString() }),
    });
  } catch {
    // non-critique : le webhook ecrira quand meme le statut plus tard
  }
}

async function createFedaPayPayout(apiBase: string, secretKey: string, input: { amount: number; phoneNumber: string; country: string; operator: string; description: string }): Promise<{ id: number; status: string }> {
  const res = await fetch(`${apiBase}/payouts`, {
    method: "POST",
    headers: { Authorization: `Bearer ${secretKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      amount: input.amount,
      currency: { iso: "XOF" },
      mode: input.operator,
      description: input.description,
      customer: {
        firstname: "Utilisateur",
        lastname: "EspaceFormation",
        phone_number: { number: input.phoneNumber, country: input.country.toLowerCase() },
      },
    }),
  });
  const raw = await res.text();
  let data: Record<string, unknown> = {};
  try { if (raw.trim()) data = JSON.parse(raw); } catch { /* ignore */ }
  if (!res.ok) throw new Error((data?.message as string) ?? `FedaPay HTTP ${res.status}`);
  const payout = (data?.["v1/payout"] as Record<string, unknown>) ?? (data?.payout as Record<string, unknown>) ?? data;
  const id = payout?.id as number | undefined;
  if (!id) throw new Error("ID payout FedaPay non recu");
  return { id, status: (payout?.status as string) ?? "pending" };
}

async function rpc(fnName: string, args: Record<string, unknown>) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fnName}`, {
    method: "POST",
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  const raw = await res.text();
  let data: unknown = null;
  try { if (raw.trim()) data = JSON.parse(raw); } catch { /* ignore */ }
  return { ok: res.ok, data };
}

Deno.serve(async (req: Request) => {
  const cors = corsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/access/, "");

  if (path === "/status" && req.method === "GET") {
    const ticket = await readTicket(req);
    return jsonResponse(cors, { hasTicket: Boolean(ticket), paymentMode: "real" });
  }

  if (path === "/simulate-payment" && req.method === "POST") {
    const body = await req.json().catch(() => ({}));
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    if (name.length < 2) return jsonResponse(cors, { message: "Un nom valide est requis avant la simulation du paiement." }, 400);
    const { code, header } = await issueTicketCookie();
    return jsonResponse(cors, { paid: true, paymentMode: "simulation", ticketCode: code, expiresInSeconds: TTL_SECONDS }, 201, { "Set-Cookie": header });
  }

  if (path === "/pay/mobile" && req.method === "POST") {
    const secretKey = req.headers.get("x-fedapay-secret") ?? "";
    if (!secretKey) return jsonResponse(cors, { message: "Cle FedaPay manquante (non transmise par le relais Cloudflare)." }, 500);
    const body = await req.json().catch(() => ({}));
    const phoneNumber = typeof body?.phoneNumber === "string" ? body.phoneNumber : "";
    const country = typeof body?.country === "string" ? body.country : "";
    const operator = typeof body?.operator === "string" ? body.operator : "";
    const userId = typeof body?.userId === "string" && body.userId ? body.userId : null;
    const mode = body?.mode === "live" ? "live" : "sandbox";
    if (!phoneNumber || !country || !operator) return jsonResponse(cors, { message: "phoneNumber, country et operator sont requis." }, 400);
    try {
      const apiBase = fedaPayApiBase(mode);
      const tx = await createFedaPayTransaction(apiBase, secretKey, { amount: TICKET_PRICE_XOF, description: "Ticket d'entree - Espace de Formation", customerEmail: FEDAPAY_CUSTOMER_EMAIL, customerFirstname: "Client", customerLastname: "Formation", phoneNumber, country });
      if (userId) await upsertFedapayTransaction(tx.id, "pending", userId);
      const { token } = await generateFedaPayToken(apiBase, secretKey, tx.id);
      const payRes = await fetch(`${apiBase}/${operator}`, { method: "POST", headers: { Authorization: `Bearer ${secretKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ token, phone_number: { number: phoneNumber.replace(/\D/g, ""), country: country.toLowerCase() } }) });
      const rawPay = await payRes.text();
      let payData: Record<string, unknown> = {};
      try { if (rawPay.trim()) payData = JSON.parse(rawPay); } catch { /* ignore */ }
      if (!payRes.ok) throw new Error((payData?.message as string) ?? `FedaPay HTTP ${payRes.status}`);
      return jsonResponse(cors, { transactionId: tx.id, status: "pending", message: "Demande envoyee sur ton telephone. Valide le paiement via ton operateur mobile." });
    } catch (error) {
      return jsonResponse(cors, { message: error instanceof Error ? error.message : "Erreur FedaPay" }, 500);
    }
  }

  if (path === "/pay/card" && req.method === "POST") {
    const secretKey = req.headers.get("x-fedapay-secret") ?? "";
    if (!secretKey) return jsonResponse(cors, { message: "Cle FedaPay manquante (non transmise par le relais Cloudflare)." }, 500);
    const body = await req.json().catch(() => ({}));
    const mode = body?.mode === "live" ? "live" : "sandbox";
    try {
      const apiBase = fedaPayApiBase(mode);
      const tx = await createFedaPayTransaction(apiBase, secretKey, { amount: TICKET_PRICE_XOF, description: "Ticket d'entree - Espace de Formation", customerEmail: FEDAPAY_CUSTOMER_EMAIL, customerFirstname: "Client", customerLastname: "Formation" });
      const { token, url: tokenUrl } = await generateFedaPayToken(apiBase, secretKey, tx.id);
      const checkoutBase = mode === "live" ? "https://process.fedapay.com" : "https://sandbox-process.fedapay.com";
      const paymentUrl = tokenUrl ?? `${checkoutBase}/${token}`;
      return jsonResponse(cors, { transactionId: tx.id, paymentUrl });
    } catch (error) {
      return jsonResponse(cors, { message: error instanceof Error ? error.message : "Erreur FedaPay" }, 500);
    }
  }

  if (path === "/pay/status" && req.method === "GET") {
    const transactionId = url.searchParams.get("transactionId") ?? "";
    if (!transactionId) return jsonResponse(cors, { message: "transactionId manquant." }, 400);
    const { status: dbStatus, userId } = await readTransactionFromDb(transactionId);
    if (dbStatus === "approved") {
      if (userId) await rpc("grant_access_and_start_referral_drip", { p_user_id: userId });
      const { code, header } = await issueTicketCookie();
      return jsonResponse(cors, { status: "approved", ticketCode: code }, 200, { "Set-Cookie": header });
    }
    if (dbStatus === "declined" || dbStatus === "canceled") return jsonResponse(cors, { status: dbStatus });
    const secretKey = req.headers.get("x-fedapay-secret") ?? "";
    const mode = url.searchParams.get("mode") === "live" ? "live" : "sandbox";
    if (!secretKey) return jsonResponse(cors, { status: "pending" });
    try {
      const apiBase = fedaPayApiBase(mode);
      const res = await fetch(`${apiBase}/transactions/${transactionId}`, { headers: { Authorization: `Bearer ${secretKey}` } });
      const raw = await res.text();
      let data: Record<string, unknown> = {};
      try { if (raw.trim()) data = JSON.parse(raw); } catch { /* ignore */ }
      if (!res.ok) throw new Error((data?.message as string) ?? `FedaPay HTTP ${res.status}`);
      const tx = (data?.["v1/transaction"] as Record<string, unknown>) ?? (data?.transaction as Record<string, unknown>) ?? data;
      const status = (tx?.status as string) ?? "pending";
      if (status === "approved") {
        if (userId) await rpc("grant_access_and_start_referral_drip", { p_user_id: userId });
        const { code, header } = await issueTicketCookie();
        return jsonResponse(cors, { status, ticketCode: code }, 200, { "Set-Cookie": header });
      }
      return jsonResponse(cors, { status });
    } catch (error) {
      return jsonResponse(cors, { message: error instanceof Error ? error.message : "Erreur FedaPay" }, 500);
    }
  }

  if (path === "/redeem" && req.method === "POST") {
    const ticket = await readTicket(req);
    if (!ticket) return jsonResponse(cors, { message: "Aucun ticket valide. Paye d'abord pour recevoir ton code." }, 403);
    const body = await req.json().catch(() => ({}));
    const enteredCode = typeof body?.code === "string" ? body.code.trim().toUpperCase() : "";
    if (enteredCode !== ticket.code) return jsonResponse(cors, { message: "Code incorrect. Verifie et reessaie." }, 400);
    if (!WHATSAPP_GROUP_INVITE_URL) return jsonResponse(cors, { message: "L'acces WhatsApp n'est pas configure cote serveur." }, 503);
    usedNonces.add(ticket.nonce);
    return jsonResponse(cors, { inviteUrl: WHATSAPP_GROUP_INVITE_URL }, 200, { "Set-Cookie": setCookieHeader("", 0) });
  }

  if (path === "/withdraw/request" && req.method === "POST") {
    const body = await req.json().catch(() => ({}));
    const userId = typeof body?.userId === "string" ? body.userId : "";
    const amountCoins = typeof body?.amountCoins === "number" ? body.amountCoins : 0;
    const phoneNumber = typeof body?.phoneNumber === "string" ? body.phoneNumber : "";
    const country = typeof body?.country === "string" ? body.country : "bj";
    const operator = typeof body?.operator === "string" ? body.operator : "";
    if (!userId || !amountCoins || !phoneNumber || !operator) {
      return jsonResponse(cors, { message: "Champs manquants pour la demande de retrait." }, 400);
    }

    const { ok, data } = await rpc("request_withdrawal", { p_user_id: userId, p_amount_coins: amountCoins, p_phone_number: phoneNumber, p_country: country, p_operator: operator });
    const row = Array.isArray(data) ? data[0] : data;
    if (!ok || !row?.success) {
      return jsonResponse(cors, { message: row?.message ?? "Impossible de traiter la demande de retrait." }, 400);
    }

    const withdrawalId = row.withdrawal_id as string;
    const amountXof = row.amount_xof as number;
    const secretKey = req.headers.get("x-fedapay-secret") ?? "";
    const mode = body?.mode === "live" ? "live" : "sandbox";

    if (!secretKey) {
      await rpc("fail_withdrawal", { p_withdrawal_id: withdrawalId, p_reason: "Cle FedaPay manquante" });
      return jsonResponse(cors, { message: "Cle FedaPay manquante (non transmise par le relais Cloudflare)." }, 500);
    }

    try {
      const apiBase = fedaPayApiBase(mode);
      const payout = await createFedaPayPayout(apiBase, secretKey, { amount: amountXof, phoneNumber, country, operator, description: "Retrait Espace de Formation" });
      await rpc("complete_withdrawal", { p_withdrawal_id: withdrawalId, p_fedapay_payout_id: payout.id });
      return jsonResponse(cors, { success: true, withdrawalId, payoutId: payout.id, status: payout.status });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erreur FedaPay (payout)";
      await rpc("fail_withdrawal", { p_withdrawal_id: withdrawalId, p_reason: message });
      return jsonResponse(cors, { message: `Retrait echoue, coins recredites : ${message}` }, 500);
    }
  }

  return jsonResponse(cors, { message: "Not found" }, 404);
});
