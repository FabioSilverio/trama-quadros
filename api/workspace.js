import {
  COOKIE_NAME,
  getQuery,
  isSameOrigin,
  parseCookies,
  readJson,
  sendJson,
} from "../server/http.js";
import { hashSessionToken } from "../server/auth-crypto.js";
import {
  copyBoard,
  createBoard,
  deleteBoard,
  getScene,
  getSceneFile,
  getSessionUser,
  getWorkspace,
  importLocalMetadata,
  isCloudEnabled,
  patchBoard,
  putProject,
  putSceneFile,
  saveScene,
  seedStartersIfEmpty,
  setSetting,
} from "../server/store.js";

export default async function handler(req, res) {
  try {
    if (!isSameOrigin(req)) {
      return sendJson(res, 403, { error: "Origem não autorizada." });
    }
    if (!isCloudEnabled()) {
      return sendJson(res, 503, { error: "Nuvem não configurada." });
    }
    const cookies = parseCookies(req.headers.cookie);
    const token = cookies[COOKIE_NAME];
    const user = token ? await getSessionUser(hashSessionToken(token)) : null;
    if (!user) {
      return sendJson(res, 401, {
        error: "Sessão expirada. Entre novamente.",
      });
    }

    const query = getQuery(req);
    const resource = query.resource || "workspace";

    if (req.method === "GET") {
      if (resource === "scene") {
        const data = await getScene(user.id, query.id);
        return sendJson(res, 200, data);
      }
      if (resource === "scene-file") {
        const file = await getSceneFile(user.id, query.id, query.fileId);
        return sendJson(res, 200, { file });
      }
      const workspace = await getWorkspace(user.id);
      return sendJson(res, 200, workspace);
    }

    if (req.method === "DELETE") {
      if (resource === "board") {
        await deleteBoard(user.id, query.id);
        return sendJson(res, 200, { ok: true });
      }
      return sendJson(res, 400, { error: "Recurso inválido." });
    }

    const body = await readJson(req);

    if (req.method === "POST") {
      const target = body.resource || resource;
      if (target === "project") {
        const project = await putProject(user.id, body.project || body);
        return sendJson(res, 201, { project });
      }
      if (target === "board") {
        const board = await createBoard(user.id, body.board || body);
        return sendJson(res, 201, { board });
      }
      if (target === "copy-board") {
        const board = await copyBoard(user.id, body.id);
        return sendJson(res, 201, { board });
      }
      if (target === "import-local") {
        const result = await importLocalMetadata(user.id, body);
        if (!result.importedBoardIds.length) {
          await seedStartersIfEmpty(user.id);
        }
        return sendJson(res, 200, result);
      }
      if (target === "seed-starters") {
        await seedStartersIfEmpty(user.id);
        return sendJson(res, 200, { ok: true });
      }
      return sendJson(res, 400, { error: "Recurso inválido." });
    }

    if (req.method === "PATCH") {
      const target = body.resource || resource;
      if (target === "board") {
        const board = await patchBoard(user.id, body.id, body.patch || body);
        return sendJson(res, 200, { board });
      }
      return sendJson(res, 400, { error: "Recurso inválido." });
    }

    if (req.method === "PUT") {
      const target = body.resource || resource;
      if (target === "scene-file") {
        const result = await putSceneFile(user.id, body.boardId, body.file);
        return sendJson(res, 200, result);
      }
      if (target === "scene") {
        const result = await saveScene(user.id, body.boardId, {
          scene: body.scene,
          cover: body.cover,
          expectedRevision: body.expectedRevision,
          newFiles: body.newFiles,
          usedFileIds: body.usedFileIds,
        });
        return sendJson(res, 200, result);
      }
      if (target === "setting") {
        await setSetting(user.id, body.key, body.value);
        return sendJson(res, 200, { ok: true });
      }
      return sendJson(res, 400, { error: "Recurso inválido." });
    }

    return sendJson(res, 405, { error: "Método não permitido." });
  } catch (err) {
    const status = err.status || 500;
    return sendJson(res, status, {
      error:
        status < 500
          ? err.message
          : "Falha ao sincronizar com o servidor. Tente novamente.",
      ...(err.code ? { code: err.code } : {}),
      ...(err.serverRevision !== undefined
        ? { serverRevision: err.serverRevision }
        : {}),
    });
  }
}
