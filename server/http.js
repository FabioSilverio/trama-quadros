import { randomUUID } from "node:crypto";

export const COOKIE_NAME = "trama_session";
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export const STARTER_PALETTE = [
  "#7761ce",
  "#dc8b55",
  "#439b83",
  "#6894c6",
  "#c96887",
];

export const STARTERS = [
  ["mapa", "Mapa de ideias", "Pesquisa visual", "map"],
  ["paleta", "Cores e composição", "Direção de arte", "palette"],
  ["roteiro", "Roteiro visual", "Conteúdo", "story"],
];

export const VALID_ID = /^[a-zA-Z0-9_-]{1,80}$/;

export function isValidId(id) {
  return typeof id === "string" && VALID_ID.test(id);
}

export function newId() {
  return randomUUID();
}

export function parseCookies(header) {
  const out = {};
  if (!header || typeof header !== "string") return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

export function isSecureRequest(req) {
  const proto = String(req.headers["x-forwarded-proto"] || "").toLowerCase();
  if (proto.split(",")[0].trim() === "https") return true;
  return Boolean(req.socket?.encrypted);
}

export function sessionCookie(token, req, maxAgeSeconds = Math.floor(SESSION_TTL_MS / 1000)) {
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (isSecureRequest(req)) parts.push("Secure");
  return parts.join("; ");
}

export function clearSessionCookie(req) {
  const parts = [
    `${COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
  ];
  if (isSecureRequest(req)) parts.push("Secure");
  return parts.join("; ");
}

export function isSameOrigin(req) {
  const method = (req.method || "GET").toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return true;
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "").toLowerCase();
  const origin = req.headers.origin;
  if (origin) {
    try {
      const parsed = new URL(origin);
      return parsed.host.toLowerCase() === host;
    } catch {
      return false;
    }
  }
  const referer = req.headers.referer;
  if (referer) {
    try {
      const parsed = new URL(referer);
      return parsed.host.toLowerCase() === host;
    } catch {
      return false;
    }
  }
  return true;
}

export function sendJson(res, statusCode, payload, extraHeaders = {}) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  for (const [k, v] of Object.entries(extraHeaders)) {
    res.setHeader(k, v);
  }
  if (typeof res.status === "function" && typeof res.json === "function") {
    res.status(statusCode).json(payload);
  } else {
    res.statusCode = statusCode;
    res.end(JSON.stringify(payload));
  }
}

export async function readJson(req, maxBytes = 4_200_000) {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === "object" && !Buffer.isBuffer(req.body)) {
      return req.body;
    }
    const text = Buffer.isBuffer(req.body)
      ? req.body.toString("utf8")
      : String(req.body);
    if (!text.trim()) return {};
    try {
      return JSON.parse(text);
    } catch {
      const err = new Error("Corpo JSON inválido.");
      err.status = 400;
      throw err;
    }
  }
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buf.length;
    if (total > maxBytes) {
      const err = new Error("Payload muito grande para uma única requisição.");
      err.status = 413;
      throw err;
    }
    chunks.push(buf);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    const err = new Error("Corpo JSON inválido.");
    err.status = 400;
    throw err;
  }
}

export function getQuery(req) {
  if (req.query && typeof req.query === "object") return req.query;
  try {
    return Object.fromEntries(
      new URL(req.url || "/", "http://localhost").searchParams,
    );
  } catch {
    return {};
  }
}
