// Toutes les routes passent par /api/fedapay/* -> relais Cloudflare Worker
// qui injecte la cle secrete + le mode (sandbox/live) avant de forwader vers Supabase.
const API_BASE = "/api/fedapay";

async function parseJsonOrThrow(response: Response) {
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = data && typeof data.message === "string" ? data.message : `Erreur ${response.status}`;
    throw new Error(message);
  }
  return data;
}

// --- Paiement Mobile Money ---
// userId : uid de l'utilisateur connecte, associe a la transaction cote
// serveur pour pouvoir declencher la recompense de parrainage une fois le
// paiement approuve (voir grant_access_and_start_referral_drip).
export async function payMobile(
  phoneNumber: string,
  country: string,
  operator: string,
  userId: string,
): Promise<{
  transactionId: number;
  status: string;
  message: string;
}> {
  const res = await fetch(`${API_BASE}/pay/mobile`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phoneNumber, country, operator, userId }),
  });
  return parseJsonOrThrow(res);
}

// --- Paiement Carte : renvoie une URL de checkout FedaPay ---
export async function payCard(customerEmail: string): Promise<{
  transactionId: number;
  paymentUrl: string;
}> {
  const res = await fetch(`${API_BASE}/pay/card`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ customerEmail }),
  });
  return parseJsonOrThrow(res);
}

// --- Verification du statut d'une transaction ---
export async function checkPaymentStatus(transactionId: number): Promise<{
  status: "pending" | "approved" | "declined" | "canceled";
  ticketCode?: string;
}> {
  const res = await fetch(`${API_BASE}/pay/status?transactionId=${transactionId}`, {
    credentials: "include",
  });
  return parseJsonOrThrow(res);
}

// --- Simulation (conservee pour les tests sans vraie cle) ---
export async function payForTicket(name: string): Promise<{
  paid: boolean;
  paymentMode: string;
  ticketCode: string;
  expiresInSeconds: number;
}> {
  const res = await fetch(`${API_BASE}/simulate-payment`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  return parseJsonOrThrow(res);
}

// --- Validation du code ticket ---
export async function redeemTicketCode(code: string): Promise<{ inviteUrl: string }> {
  const res = await fetch(`${API_BASE}/redeem`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
  return parseJsonOrThrow(res);
}

// --- Réclame un ticket gratuit accordé manuellement (côté admin) ---
export async function claimCompTicket(userId: string): Promise<{ ticketCode: string }> {
  const res = await fetch(`${API_BASE}/pay/comp`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId }),
  });
  return parseJsonOrThrow(res);
}

// --- Demande de retrait (coins -> Mobile Money) ---
export async function requestWithdrawal(params: {
  userId: string;
  amountCoins: number;
  phoneNumber: string;
  country: string;
  operator: string;
}): Promise<{ success: boolean; withdrawalId: string; payoutId: number; status: string }> {
  const res = await fetch(`${API_BASE}/withdraw/request`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  return parseJsonOrThrow(res);
}
