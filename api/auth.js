import {
  COOKIE_NAME,
  SESSION_TTL_MS,
  clearSessionCookie,
  isSameOrigin,
  parseCookies,
  readJson,
  sendJson,
  sessionCookie,
} from "../server/http.js";
import {
  createSessionToken,
  hashPassword,
  hashSessionToken,
  isValidEmail,
  normalizeEmail,
  verifyPassword,
} from "../server/auth-crypto.js";
import {
  createSession,
  createUser,
  deleteSession,
  getSessionUser,
  getUserByEmail,
  isCloudEnabled,
  seedStartersIfEmpty,
} from "../server/store.js";

export default async function handler(req, res) {
  try {
    if (!isSameOrigin(req)) {
      return sendJson(res, 403, { error: "Origem não autorizada." });
    }
    const cloudEnabled = isCloudEnabled();
    const cookies = parseCookies(req.headers.cookie);
    const currentToken = cookies[COOKIE_NAME];

    if (req.method === "GET") {
      if (!cloudEnabled) {
        return sendJson(res, 200, { cloudEnabled: false, user: null });
      }
      const user = currentToken
        ? await getSessionUser(hashSessionToken(currentToken))
        : null;
      return sendJson(res, 200, { cloudEnabled: true, user });
    }

    if (req.method !== "POST") {
      return sendJson(res, 405, { error: "Método não permitido." });
    }
    if (!cloudEnabled) {
      return sendJson(res, 503, {
        error: "Sincronização em nuvem não configurada neste servidor.",
      });
    }

    const body = await readJson(req, 64_000);
    const action = body.action;

    if (action === "logout") {
      if (currentToken) {
        await deleteSession(hashSessionToken(currentToken));
      }
      return sendJson(
        res,
        200,
        { ok: true },
        { "Set-Cookie": clearSessionCookie(req) },
      );
    }

    const email = normalizeEmail(body.email);
    const password = typeof body.password === "string" ? body.password : "";

    if (action === "register") {
      if (!isValidEmail(email)) {
        return sendJson(res, 400, { error: "Digite um e-mail válido." });
      }
      if (password.length < 6 || password.length > 128) {
        return sendJson(res, 400, {
          error: "A senha deve ter entre 6 e 128 caracteres.",
        });
      }
      const name = String(body.name || "").trim();
      if (name.length > 90) {
        return sendJson(res, 400, { error: "Nome muito longo." });
      }
      const passwordHash = await hashPassword(password);
      const user = await createUser({ email, name, passwordHash });
      if (!body.skipStarters) {
        await seedStartersIfEmpty(user.id);
      }
      const { token, tokenHash } = createSessionToken();
      await createSession(user.id, tokenHash, Date.now() + SESSION_TTL_MS);
      return sendJson(
        res,
        201,
        { user },
        { "Set-Cookie": sessionCookie(token, req) },
      );
    }

    if (action === "login") {
      if (!isValidEmail(email) || !password) {
        return sendJson(res, 400, { error: "Informe seu e-mail e senha." });
      }
      const found = await getUserByEmail(email);
      const ok = found && (await verifyPassword(password, found.passwordHash));
      if (!ok) {
        return sendJson(res, 401, { error: "E-mail ou senha incorretos." });
      }
      const { token, tokenHash } = createSessionToken();
      await createSession(found.id, tokenHash, Date.now() + SESSION_TTL_MS);
      return sendJson(
        res,
        200,
        { user: { id: found.id, email: found.email, name: found.name } },
        { "Set-Cookie": sessionCookie(token, req) },
      );
    }

    return sendJson(res, 400, { error: "Ação inválida." });
  } catch (err) {
    const status = err.status || 500;
    return sendJson(res, status, {
      error:
        status < 500
          ? err.message
          : "Erro interno ao autenticar. Tente novamente.",
    });
  }
}
