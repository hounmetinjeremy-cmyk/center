import { clearPaidCookie, consumePayment, hasValidPayment } from "../_lib/access";

declare const process: { env: Record<string, string | undefined> };
type Request = { method?: string; headers: { cookie?: string } };
type Response = { setHeader(name: string, value: string): void; status(code: number): Response; json(body: unknown): void; redirect(code: number, url: string): void };

export default async function handler(req: Request, res: Response) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.status(405).json({ message: "Méthode non autorisée." });
    return;
  }
  const nonce = await hasValidPayment(req);
  if (!nonce) {
    res.status(403).json({ message: "Paiement non confirmé. Simulez le paiement avant de rejoindre le groupe." });
    return;
  }
  const inviteUrl = process.env.WHATSAPP_GROUP_INVITE_URL;
  if (!inviteUrl) {
    res.status(503).json({ message: "L’accès WhatsApp n’est pas configuré côté serveur." });
    return;
  }
  consumePayment(nonce);
  clearPaidCookie(res);
  res.redirect(303, inviteUrl);
}
