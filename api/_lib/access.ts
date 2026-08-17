declare const process: { env: Record<string, string | undefined> };

const COOKIE_NAME = "formation_access";
const TTL_SECONDS = 30 * 60;
const usedNonces = new Set<string>();

type ResponseLike = { setHeader(name: string, value: string): void };
type RequestLike = { headers: { cookie?: string } };

function secret() {
  return process.env.SESSION_SECRET ?? "";
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(normalized), (character) => character.charCodeAt(0));
}

async function sign(payload: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return bytesToBase64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload))));
}

function readCookie(req: RequestLike) {
  const raw = req.headers.cookie ?? "";
  const pair = raw.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE_NAME}=`));
  return pair ? decodeURIComponent(pair.slice(COOKIE_NAME.length + 1)) : null;
}

function cookie(value: string, maxAge: number) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${COOKIE_NAME}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export async function setPaidCookie(res: ResponseLike) {
  const exp = Math.floor(Date.now() / 1000) + TTL_SECONDS;
  const randomBytes = new Uint8Array(18);
  crypto.getRandomValues(randomBytes);
  const nonce = bytesToBase64Url(randomBytes);
  const payload = `${exp}.${nonce}`;
  res.setHeader("Set-Cookie", cookie(`${payload}.${await sign(payload)}`, TTL_SECONDS));
}

export function clearPaidCookie(res: ResponseLike) {
  res.setHeader("Set-Cookie", cookie("", 0));
}

export async function hasValidPayment(req: RequestLike) {
  const value = readCookie(req);
  if (!value || !secret()) return null;
  const [expText, nonce, signature] = value.split(".");
  const exp = Number(expText);
  if (!expText || !nonce || !signature || !Number.isFinite(exp) || exp <= Math.floor(Date.now() / 1000)) return null;
  const payload = `${expText}.${nonce}`;
  const expected = await sign(payload);
  if (expected !== signature || usedNonces.has(nonce)) return null;
  return nonce;
}

export function consumePayment(nonce: string) {
  usedNonces.add(nonce);
}
