import { hasValidPayment } from "../_lib/access";

type Request = { headers: { cookie?: string } };
type Response = { setHeader(name: string, value: string): void; status(code: number): Response; json(body: unknown): void };

export default async function handler(req: Request, res: Response) {
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({ paid: Boolean(await hasValidPayment(req)), paymentMode: "simulation" });
}
