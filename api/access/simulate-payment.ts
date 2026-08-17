import { setPaidCookie } from "../_lib/access";

type Request = { method?: string; body?: { name?: unknown } };
type Response = { setHeader(name: string, value: string): void; status(code: number): Response; json(body: unknown): void };

export default async function handler(req: Request, res: Response) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.status(405).json({ message: "Méthode non autorisée." });
    return;
  }
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  if (name.length < 2) {
    res.status(400).json({ message: "Un nom valide est requis avant la simulation du paiement." });
    return;
  }
  await setPaidCookie(res);
  res.status(201).json({ paid: true, paymentMode: "simulation", expiresInSeconds: 30 * 60 });
}
