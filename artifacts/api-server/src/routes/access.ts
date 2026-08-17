import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Bindings } from "../app";

const router = new Hono<{ Bindings: Bindings }>();
const COOKIE_NAME = "formation_access";
const TTL_SECONDS = 30 * 60;
const usedNonces = new Set<string>();

function sign(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function hasValidPayment(value: string | undefined, secret: string) {
  if (!value || !secret) return null;
  const [expText, nonce, signature] = value.split(".");
  const exp = Number(expText);
  if (
    !expText ||
    !nonce ||
    !signature ||
    !Number.isFinite(exp) ||
    exp <= Math.floor(Date.now() / 1000) ||
    usedNonces.has(nonce)
  ) {
    return null;
  }

  const expected = sign(`${expText}.${nonce}`, secret);
  const expectedBytes = Buffer.from(expected);
  const signatureBytes = Buffer.from(signature);
  if (
    expectedBytes.length !== signatureBytes.length ||
    !timingSafeEqual(expectedBytes, signatureBytes)
  ) {
    return null;
  }

  return nonce;
}

router.get("/access/status", (c) => {
  c.header("Cache-Control", "no-store");
  const nonce = hasValidPayment(getCookie(c, COOKIE_NAME), c.env.SESSION_SECRET);
  return c.json({ paid: Boolean(nonce), paymentMode: "simulation" });
});

router.post("/access/simulate-payment", async (c) => {
  c.header("Cache-Control", "no-store");
  const body = await c.req.json().catch(() => ({}) as Record<string, unknown>);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (name.length < 2) {
    return c.json(
      { message: "Un nom valide est requis avant la simulation du paiement." },
      400,
    );
  }

  const exp = Math.floor(Date.now() / 1000) + TTL_SECONDS;
  const nonce = randomBytes(18).toString("base64url");
  const payload = `${exp}.${nonce}`;
  const value = `${payload}.${sign(payload, c.env.SESSION_SECRET)}`;

  setCookie(c, COOKIE_NAME, value, {
    path: "/",
    httpOnly: true,
    sameSite: "Lax",
    maxAge: TTL_SECONDS,
    secure: true,
  });

  return c.json(
    { paid: true, paymentMode: "simulation", expiresInSeconds: TTL_SECONDS },
    201,
  );
});

router.post("/access/whatsapp", (c) => {
  c.header("Cache-Control", "no-store");
  const nonce = hasValidPayment(getCookie(c, COOKIE_NAME), c.env.SESSION_SECRET);
  if (!nonce) {
    return c.json(
      { message: "Paiement non confirmé. Simulez le paiement avant de rejoindre le groupe." },
      403,
    );
  }

  const inviteUrl = c.env.WHATSAPP_GROUP_INVITE_URL;
  if (!inviteUrl) {
    return c.json({ message: "L'accès WhatsApp n'est pas configuré côté serveur." }, 503);
  }

  usedNonces.add(nonce);
  deleteCookie(c, COOKIE_NAME, { path: "/" });
  return c.redirect(inviteUrl, 303);
});

export default router;
