const ACCESS_API_BASE = "https://iykryokvyrbdznbdxxjo.supabase.co/functions/v1/access";

async function parseJsonOrThrow(response: Response) {
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      data && typeof data.message === "string" ? data.message : `Erreur ${response.status}`;
    throw new Error(message);
  }
  return data;
}

export type AccessStatus = { paid: boolean; paymentMode: string };

export async function fetchAccessStatus(): Promise<AccessStatus> {
  const res = await fetch(`${ACCESS_API_BASE}/status`, { credentials: "include" });
  return parseJsonOrThrow(res);
}

export async function simulatePayment(name: string): Promise<{
  paid: boolean;
  paymentMode: string;
  expiresInSeconds: number;
}> {
  const res = await fetch(`${ACCESS_API_BASE}/simulate-payment`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  return parseJsonOrThrow(res);
}

export async function joinWhatsappGroup(): Promise<{ inviteUrl: string }> {
  const res = await fetch(`${ACCESS_API_BASE}/whatsapp`, {
    method: "POST",
    credentials: "include",
  });
  return parseJsonOrThrow(res);
}
