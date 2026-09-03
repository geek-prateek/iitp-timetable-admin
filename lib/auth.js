import { createHmac, createHash, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "iitp_admin_session";
export const ADMIN_USERNAME = "admin";
const SESSION_SECONDS = 12 * 60 * 60;

function configuredPassword() {
  return process.env.ADMIN_PASSWORD || "";
}

function fixedHash(value) {
  return createHash("sha256").update(String(value)).digest();
}

export function passwordIsConfigured() {
  return Boolean(configuredPassword());
}

export function passwordMatches(candidate) {
  if (!passwordIsConfigured()) return false;
  return timingSafeEqual(fixedHash(candidate), fixedHash(configuredPassword()));
}

export function usernameMatches(candidate) {
  return timingSafeEqual(fixedHash(candidate), fixedHash(ADMIN_USERNAME));
}

function sign(expiresAt) {
  return createHmac("sha256", configuredPassword()).update(String(expiresAt)).digest("base64url");
}

export function createSessionCookie() {
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  const token = `${expiresAt}.${sign(expiresAt)}`;
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_SECONDS}`;
}

export function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

function cookieValue(request, name) {
  const cookies = request.headers.get("cookie") || "";
  const entry = cookies.split(";").map(value => value.trim()).find(value => value.startsWith(`${name}=`));
  return entry ? entry.slice(name.length + 1) : "";
}

export function isAuthenticated(request) {
  if (!passwordIsConfigured()) return false;

  const [expiresAtValue, suppliedSignature] = cookieValue(request, SESSION_COOKIE).split(".");
  const expiresAt = Number(expiresAtValue);
  if (!expiresAt || expiresAt <= Math.floor(Date.now() / 1000) || !suppliedSignature) return false;

  const expectedSignature = sign(expiresAt);
  return timingSafeEqual(fixedHash(suppliedSignature), fixedHash(expectedSignature));
}
