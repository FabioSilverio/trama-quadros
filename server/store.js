import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import {
  STARTERS,
  STARTER_PALETTE,
  isValidId,
  newId,
} from "./http.js";

const { Pool } = pg;

const MAX_INLINE_FILES_BYTES = 2_800_000;

let pool = null;
let schemaReady = null;
let localLock = Promise.resolve();

export function isCloudEnabled() {
  return Boolean(process.env.DATABASE_URL || process.env.TRAMA_LOCAL_STORE);
}

function useLocalStore() {
  return !process.env.DATABASE_URL && Boolean(process.env.TRAMA_LOCAL_STORE);
}

function getPool() {
  if (!pool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL não configurada.");
    const isLocalHost = /^postgres(?:ql)?:\/\/[^/]*@(?:localhost|127\.0\.0\.1)\b/i.test(url);
    const disableSsl = /[?&]sslmode=disable\b/i.test(url);
    pool = new Pool({
      connectionString: url,
      max: 3,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 8000,
      ...(isLocalHost || disableSsl ? {} : { ssl: { rejectUnauthorized: true } }),
    });
  }
  return pool;
}

async function ensureSchema() {
  if (useLocalStore()) return;
  if (!schemaReady) {
    schemaReady = (async () => {
      const p = getPool();
      await p.query(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          email TEXT NOT NULL UNIQUE,
          name TEXT NOT NULL,
          password_hash TEXT NOT NULL,
          created_at BIGINT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS sessions (
          token_hash TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          created_at BIGINT NOT NULL,
          expires_at BIGINT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
        CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
        CREATE TABLE IF NOT EXISTS projects (
          id TEXT NOT NULL,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          color TEXT NOT NULL,
          updated_at BIGINT NOT NULL,
          PRIMARY KEY (user_id, id)
        );
        CREATE TABLE IF NOT EXISTS boards (
          id TEXT NOT NULL,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          project_id TEXT NOT NULL,
          cover TEXT,
          preview TEXT,
          favorite BOOLEAN NOT NULL DEFAULT FALSE,
          initial_link TEXT,
          revision INTEGER NOT NULL DEFAULT 0,
          updated_at BIGINT NOT NULL,
          PRIMARY KEY (user_id, id)
        );
        CREATE INDEX IF NOT EXISTS idx_boards_user_updated ON boards(user_id, updated_at DESC);
        CREATE TABLE IF NOT EXISTS scenes (
          board_id TEXT NOT NULL,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          writer TEXT,
          sequence INTEGER NOT NULL DEFAULT 0,
          revision INTEGER NOT NULL DEFAULT 0,
          elements_json TEXT NOT NULL,
          app_state_json TEXT NOT NULL,
          updated_at BIGINT NOT NULL,
          PRIMARY KEY (user_id, board_id),
          FOREIGN KEY (user_id, board_id) REFERENCES boards(user_id, id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS scene_files (
          file_id TEXT NOT NULL,
          board_id TEXT NOT NULL,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          mime_type TEXT NOT NULL,
          data_url TEXT NOT NULL,
          created_at BIGINT NOT NULL,
          PRIMARY KEY (user_id, board_id, file_id),
          FOREIGN KEY (user_id, board_id) REFERENCES boards(user_id, id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS user_settings (
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          key TEXT NOT NULL,
          value_json TEXT NOT NULL,
          updated_at BIGINT NOT NULL,
          PRIMARY KEY (user_id, key)
        );
      `);
    })().catch((err) => {
      schemaReady = null;
      throw err;
    });
  }
  return schemaReady;
}

function emptyLocalData() {
  return {
    users: {},
    sessions: {},
    projects: {},
    boards: {},
    scenes: {},
    sceneFiles: {},
    settings: {},
  };
}

function readLocalFile() {
  const filePath = process.env.TRAMA_LOCAL_STORE;
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return { ...emptyLocalData(), ...JSON.parse(raw) };
  } catch {
    return emptyLocalData();
  }
}

function writeLocalFile(data) {
  const filePath = process.env.TRAMA_LOCAL_STORE;
  fs.mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true });
  const tmp = filePath + ".tmp." + process.pid + "." + Date.now();
  fs.writeFileSync(tmp, JSON.stringify(data), "utf8");
  fs.renameSync(tmp, filePath);
}

function withLocal(fn, mutate = false) {
  const next = localLock.then(async () => {
    const data = readLocalFile();
    const result = await fn(data);
    if (mutate) writeLocalFile(data);
    return result;
  });
  localLock = next.catch(() => {});
  return next;
}

function mapBoardRow(row) {
  return {
    id: row.id,
    name: row.name,
    project: row.project_id,
    cover: row.cover || null,
    preview: row.preview || undefined,
    favorite: Boolean(row.favorite),
    initialLink: row.initial_link || null,
    revision: Number(row.revision || 0),
    updated: Number(row.updated_at || Date.now()),
  };
}

function mapProjectRow(row) {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    updated: Number(row.updated_at || Date.now()),
  };
}

function sanitizeBoardInput(input) {
  return {
    id: isValidId(input.id) ? input.id : newId(),
    name: String(input.name || "Quadro sem título").trim().slice(0, 90) || "Quadro sem título",
    project: String(input.project || "").slice(0, 80),
    cover: typeof input.cover === "string" ? input.cover.slice(0, 40) : null,
    preview: typeof input.preview === "string" && input.preview.startsWith("data:image/")
      ? input.preview
      : null,
    favorite: Boolean(input.favorite),
    initialLink: typeof input.initialLink === "string" && input.initialLink.trim()
      ? input.initialLink.trim().slice(0, 2000)
      : null,
    updated: Number.isFinite(Number(input.updated)) ? Math.floor(Number(input.updated)) : Date.now(),
  };
}

function sanitizeProjectInput(input) {
  return {
    id: isValidId(input.id) ? input.id : newId(),
    name: String(input.name || "Projeto").trim().slice(0, 90) || "Projeto",
    color: typeof input.color === "string" && /^#[0-9a-f]{3,8}$/i.test(input.color)
      ? input.color
      : STARTER_PALETTE[0],
    updated: Number.isFinite(Number(input.updated)) ? Math.floor(Number(input.updated)) : Date.now(),
  };
}

function httpError(status, message, extra = {}) {
  const err = new Error(message);
  err.status = status;
  Object.assign(err, extra);
  return err;
}

export async function createUser({ email, name, passwordHash }) {
  await ensureSchema();
  const user = {
    id: newId(),
    email,
    name: String(name || "").trim().slice(0, 90) || email.split("@")[0].slice(0, 90),
    passwordHash,
    createdAt: Date.now(),
  };
  if (useLocalStore()) {
    return withLocal((db) => {
      if (Object.values(db.users).some((u) => u.email === email)) {
        throw httpError(409, "Já existe uma conta com este e-mail. Tente entrar.");
      }
      db.users[user.id] = user;
      return { id: user.id, email: user.email, name: user.name };
    }, true);
  }
  try {
    await getPool().query(
      `INSERT INTO users (id, email, name, password_hash, created_at) VALUES ($1, $2, $3, $4, $5)`,
      [user.id, user.email, user.name, user.passwordHash, user.createdAt],
    );
    return { id: user.id, email: user.email, name: user.name };
  } catch (err) {
    if (err.code === "23505") {
      throw httpError(409, "Já existe uma conta com este e-mail. Tente entrar.");
    }
    throw err;
  }
}

export async function getUserByEmail(email) {
  await ensureSchema();
  if (useLocalStore()) {
    return withLocal((db) => {
      const u = Object.values(db.users).find((item) => item.email === email);
      return u ? { ...u } : null;
    });
  }
  const res = await getPool().query(
    `SELECT id, email, name, password_hash AS "passwordHash", created_at AS "createdAt" FROM users WHERE email = $1`,
    [email],
  );
  return res.rows[0] || null;
}

export async function createSession(userId, tokenHash, expiresAt) {
  await ensureSchema();
  const now = Date.now();
  if (useLocalStore()) {
    return withLocal((db) => {
      for (const [k, s] of Object.entries(db.sessions)) {
        if (s.expiresAt <= now) delete db.sessions[k];
      }
      db.sessions[tokenHash] = { tokenHash, userId, createdAt: now, expiresAt };
    }, true);
  }
  await getPool().query(`DELETE FROM sessions WHERE expires_at <= $1`, [now]);
  await getPool().query(
    `INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES ($1, $2, $3, $4)`,
    [tokenHash, userId, now, expiresAt],
  );
}

export async function getSessionUser(tokenHash) {
  if (!tokenHash) return null;
  await ensureSchema();
  const now = Date.now();
  if (useLocalStore()) {
    return withLocal((db) => {
      const s = db.sessions[tokenHash];
      if (!s || s.expiresAt <= now) return null;
      const u = db.users[s.userId];
      if (!u) return null;
      return { id: u.id, email: u.email, name: u.name };
    });
  }
  const res = await getPool().query(
    `SELECT u.id, u.email, u.name
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > $2`,
    [tokenHash, now],
  );
  return res.rows[0] || null;
}

export async function deleteSession(tokenHash) {
  if (!tokenHash) return;
  await ensureSchema();
  if (useLocalStore()) {
    return withLocal((db) => {
      delete db.sessions[tokenHash];
    }, true);
  }
  await getPool().query(`DELETE FROM sessions WHERE token_hash = $1`, [tokenHash]);
}

export async function seedStartersIfEmpty(userId) {
  await ensureSchema();
  const now = Date.now();
  if (useLocalStore()) {
    return withLocal((db) => {
      const hasAny =
        Object.values(db.projects).some((p) => p.userId === userId) ||
        Object.values(db.boards).some((b) => b.userId === userId);
      if (hasAny) return;
      for (const [i, [id, name, projectName, cover]] of STARTERS.entries()) {
        db.projects[`${userId}:${id}`] = {
          userId,
          id,
          name: projectName,
          color: STARTER_PALETTE[i],
          updated_at: now - i * 60000,
        };
        db.boards[`${userId}:${id}`] = {
          userId,
          id,
          name,
          project_id: id,
          cover,
          preview: null,
          favorite: false,
          initial_link: null,
          revision: 0,
          updated_at: now - i * 60000,
        };
      }
    }, true);
  }
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const existing = await client.query(
      `SELECT 1 FROM projects WHERE user_id = $1 UNION ALL SELECT 1 FROM boards WHERE user_id = $1 LIMIT 1`,
      [userId],
    );
    if (!existing.rows.length) {
      for (const [i, [id, name, projectName, cover]] of STARTERS.entries()) {
        const ts = now - i * 60000;
        await client.query(
          `INSERT INTO projects (id, user_id, name, color, updated_at) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`,
          [id, userId, projectName, STARTER_PALETTE[i], ts],
        );
        await client.query(
          `INSERT INTO boards (id, user_id, name, project_id, cover, preview, favorite, initial_link, revision, updated_at)
           VALUES ($1, $2, $3, $4, $5, NULL, FALSE, NULL, 0, $6) ON CONFLICT DO NOTHING`,
          [id, userId, name, id, cover, ts],
        );
      }
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export async function getWorkspace(userId) {
  await ensureSchema();
  if (useLocalStore()) {
    return withLocal((db) => {
      const projects = Object.values(db.projects)
        .filter((p) => p.userId === userId)
        .sort((a, b) => (a.updated_at || 0) - (b.updated_at || 0))
        .map(mapProjectRow);
      const boards = Object.values(db.boards)
        .filter((b) => b.userId === userId)
        .sort((a, b) => (b.updated_at || 0) - (a.updated_at || 0))
        .map(mapBoardRow);
      const settings = {};
      for (const s of Object.values(db.settings)) {
        if (s.userId === userId) {
          try {
            settings[s.key] = JSON.parse(s.value_json);
          } catch {}
        }
      }
      return { projects, boards, settings };
    });
  }
  const p = getPool();
  const [projectsRes, boardsRes, settingsRes] = await Promise.all([
    p.query(
      `SELECT id, name, color, updated_at FROM projects WHERE user_id = $1 ORDER BY updated_at ASC`,
      [userId],
    ),
    p.query(
      `SELECT id, name, project_id, cover, preview, favorite, initial_link, revision, updated_at
       FROM boards WHERE user_id = $1 ORDER BY updated_at DESC`,
      [userId],
    ),
    p.query(`SELECT key, value_json FROM user_settings WHERE user_id = $1`, [userId]),
  ]);
  const settings = {};
  for (const row of settingsRes.rows) {
    try {
      settings[row.key] = JSON.parse(row.value_json);
    } catch {}
  }
  return {
    projects: projectsRes.rows.map(mapProjectRow),
    boards: boardsRes.rows.map(mapBoardRow),
    settings,
  };
}

export async function putProject(userId, input) {
  await ensureSchema();
  const project = sanitizeProjectInput(input);
  if (useLocalStore()) {
    return withLocal((db) => {
      db.projects[`${userId}:${project.id}`] = {
        userId,
        id: project.id,
        name: project.name,
        color: project.color,
        updated_at: project.updated,
      };
      return project;
    }, true);
  }
  await getPool().query(
    `INSERT INTO projects (id, user_id, name, color, updated_at)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id, id) DO UPDATE SET name = EXCLUDED.name, color = EXCLUDED.color, updated_at = EXCLUDED.updated_at`,
    [project.id, userId, project.name, project.color, project.updated],
  );
  return project;
}

export async function createBoard(userId, input) {
  await ensureSchema();
  const board = sanitizeBoardInput(input);
  if (useLocalStore()) {
    return withLocal((db) => {
      db.boards[`${userId}:${board.id}`] = {
        userId,
        id: board.id,
        name: board.name,
        project_id: board.project,
        cover: board.cover,
        preview: board.preview,
        favorite: board.favorite,
        initial_link: board.initialLink,
        revision: 0,
        updated_at: board.updated,
      };
      return { ...board, revision: 0 };
    }, true);
  }
  await getPool().query(
    `INSERT INTO boards (id, user_id, name, project_id, cover, preview, favorite, initial_link, revision, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0, $9)
     ON CONFLICT (user_id, id) DO UPDATE SET
       name = EXCLUDED.name,
       project_id = EXCLUDED.project_id,
       favorite = EXCLUDED.favorite,
       updated_at = EXCLUDED.updated_at`,
    [
      board.id,
      userId,
      board.name,
      board.project,
      board.cover,
      board.preview,
      board.favorite,
      board.initialLink,
      board.updated,
    ],
  );
  return { ...board, revision: 0 };
}

export async function patchBoard(userId, id, patch) {
  if (!isValidId(id)) throw httpError(400, "Quadro inválido.");
  await ensureSchema();
  const now = Date.now();
  if (useLocalStore()) {
    return withLocal((db) => {
      const key = `${userId}:${id}`;
      const existing = db.boards[key];
      if (!existing) throw httpError(404, "Quadro não encontrado.");
      if (typeof patch.name === "string" && patch.name.trim()) {
        existing.name = patch.name.trim().slice(0, 90);
      }
      if (typeof patch.project === "string") {
        existing.project_id = patch.project.slice(0, 80);
      }
      if (typeof patch.favorite === "boolean") {
        existing.favorite = patch.favorite;
      }
      if (patch.name !== undefined || patch.project !== undefined) {
        existing.updated_at = now;
      }
      return mapBoardRow(existing);
    }, true);
  }
  const sets = [];
  const values = [userId, id];
  let idx = 3;
  if (typeof patch.name === "string" && patch.name.trim()) {
    sets.push(`name = $${idx++}`);
    values.push(patch.name.trim().slice(0, 90));
  }
  if (typeof patch.project === "string") {
    sets.push(`project_id = $${idx++}`);
    values.push(patch.project.slice(0, 80));
  }
  if (typeof patch.favorite === "boolean") {
    sets.push(`favorite = $${idx++}`);
    values.push(patch.favorite);
  }
  if (patch.name !== undefined || patch.project !== undefined) {
    sets.push(`updated_at = $${idx++}`);
    values.push(now);
  }
  if (!sets.length) throw httpError(400, "Nada para atualizar.");
  const res = await getPool().query(
    `UPDATE boards SET ${sets.join(", ")} WHERE user_id = $1 AND id = $2
     RETURNING id, name, project_id, cover, preview, favorite, initial_link, revision, updated_at`,
    values,
  );
  if (!res.rows.length) throw httpError(404, "Quadro não encontrado.");
  return mapBoardRow(res.rows[0]);
}

export async function copyBoard(userId, id) {
  if (!isValidId(id)) throw httpError(400, "Quadro inválido.");
  await ensureSchema();
  const copyId = newId();
  const now = Date.now();
  if (useLocalStore()) {
    return withLocal((db) => {
      const board = db.boards[`${userId}:${id}`];
      if (!board) throw httpError(404, "O quadro já foi excluído.");
      const copy = {
        ...board,
        id: copyId,
        name: (board.name + " (cópia)").slice(0, 90),
        revision: 0,
        updated_at: now,
      };
      db.boards[`${userId}:${copyId}`] = copy;
      const scene = db.scenes[`${userId}:${id}`];
      if (scene) {
        db.scenes[`${userId}:${copyId}`] = {
          ...scene,
          board_id: copyId,
          revision: 0,
          updated_at: now,
        };
      }
      for (const f of Object.values(db.sceneFiles)) {
        if (f.userId === userId && f.board_id === id) {
          db.sceneFiles[`${userId}:${copyId}:${f.file_id}`] = {
            ...f,
            board_id: copyId,
          };
        }
      }
      return mapBoardRow(copy);
    }, true);
  }
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const boardRes = await client.query(
      `SELECT * FROM boards WHERE user_id = $1 AND id = $2`,
      [userId, id],
    );
    const board = boardRes.rows[0];
    if (!board) throw httpError(404, "O quadro já foi excluído.");
    const copyName = (board.name + " (cópia)").slice(0, 90);
    const inserted = await client.query(
      `INSERT INTO boards (id, user_id, name, project_id, cover, preview, favorite, initial_link, revision, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0, $9)
       RETURNING id, name, project_id, cover, preview, favorite, initial_link, revision, updated_at`,
      [
        copyId,
        userId,
        copyName,
        board.project_id,
        board.cover,
        board.preview,
        board.favorite,
        board.initial_link,
        now,
      ],
    );
    await client.query(
      `INSERT INTO scenes (board_id, user_id, writer, sequence, revision, elements_json, app_state_json, updated_at)
       SELECT $1, user_id, writer, sequence, 0, elements_json, app_state_json, $2
       FROM scenes WHERE user_id = $3 AND board_id = $4`,
      [copyId, now, userId, id],
    );
    await client.query(
      `INSERT INTO scene_files (file_id, board_id, user_id, mime_type, data_url, created_at)
       SELECT file_id, $1, user_id, mime_type, data_url, created_at
       FROM scene_files WHERE user_id = $2 AND board_id = $3`,
      [copyId, userId, id],
    );
    await client.query("COMMIT");
    return mapBoardRow(inserted.rows[0]);
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export async function deleteBoard(userId, id) {
  if (!isValidId(id)) throw httpError(400, "Quadro inválido.");
  await ensureSchema();
  if (useLocalStore()) {
    return withLocal((db) => {
      delete db.boards[`${userId}:${id}`];
      delete db.scenes[`${userId}:${id}`];
      for (const k of Object.keys(db.sceneFiles)) {
        if (k.startsWith(`${userId}:${id}:`)) delete db.sceneFiles[k];
      }
    }, true);
  }
  await getPool().query(`DELETE FROM boards WHERE user_id = $1 AND id = $2`, [userId, id]);
}

export async function getScene(userId, boardId) {
  if (!isValidId(boardId)) throw httpError(400, "Quadro inválido.");
  await ensureSchema();
  if (useLocalStore()) {
    return withLocal((db) => {
      const boardRow = db.boards[`${userId}:${boardId}`];
      if (!boardRow) throw httpError(404, "Quadro não encontrado.");
      const sceneRow = db.scenes[`${userId}:${boardId}`];
      if (!sceneRow) {
        return { board: mapBoardRow(boardRow), scene: null, missingFileIds: [] };
      }
      const files = {};
      const missingFileIds = [];
      let bytes = 0;
      for (const f of Object.values(db.sceneFiles)) {
        if (f.userId !== userId || f.board_id !== boardId) continue;
        if (bytes + f.data_url.length <= MAX_INLINE_FILES_BYTES) {
          bytes += f.data_url.length;
          files[f.file_id] = {
            id: f.file_id,
            mimeType: f.mime_type,
            dataURL: f.data_url,
            created: f.created_at,
            lastRetrieved: Date.now(),
          };
        } else {
          missingFileIds.push(f.file_id);
        }
      }
      return {
        board: mapBoardRow(boardRow),
        scene: {
          writer: sceneRow.writer || undefined,
          sequence: Number(sceneRow.sequence || 0),
          revision: Number(sceneRow.revision || boardRow.revision || 0),
          elements: JSON.parse(sceneRow.elements_json),
          appState: JSON.parse(sceneRow.app_state_json),
          files,
        },
        missingFileIds,
      };
    });
  }
  const p = getPool();
  const [boardRes, sceneRes, filesRes] = await Promise.all([
    p.query(
      `SELECT id, name, project_id, cover, preview, favorite, initial_link, revision, updated_at
       FROM boards WHERE user_id = $1 AND id = $2`,
      [userId, boardId],
    ),
    p.query(
      `SELECT writer, sequence, revision, elements_json, app_state_json
       FROM scenes WHERE user_id = $1 AND board_id = $2`,
      [userId, boardId],
    ),
    p.query(
      `SELECT file_id, mime_type, data_url, created_at
       FROM scene_files WHERE user_id = $1 AND board_id = $2`,
      [userId, boardId],
    ),
  ]);
  const boardRow = boardRes.rows[0];
  if (!boardRow) throw httpError(404, "Quadro não encontrado.");
  const sceneRow = sceneRes.rows[0];
  if (!sceneRow) {
    return { board: mapBoardRow(boardRow), scene: null, missingFileIds: [] };
  }
  const files = {};
  const missingFileIds = [];
  let bytes = 0;
  for (const f of filesRes.rows) {
    if (bytes + f.data_url.length <= MAX_INLINE_FILES_BYTES) {
      bytes += f.data_url.length;
      files[f.file_id] = {
        id: f.file_id,
        mimeType: f.mime_type,
        dataURL: f.data_url,
        created: Number(f.created_at || Date.now()),
        lastRetrieved: Date.now(),
      };
    } else {
      missingFileIds.push(f.file_id);
    }
  }
  return {
    board: mapBoardRow(boardRow),
    scene: {
      writer: sceneRow.writer || undefined,
      sequence: Number(sceneRow.sequence || 0),
      revision: Number(sceneRow.revision || boardRow.revision || 0),
      elements: JSON.parse(sceneRow.elements_json),
      appState: JSON.parse(sceneRow.app_state_json),
      files,
    },
    missingFileIds,
  };
}

export async function getSceneFile(userId, boardId, fileId) {
  if (!isValidId(boardId) || typeof fileId !== "string" || !fileId || fileId.length > 120) {
    throw httpError(400, "Arquivo inválido.");
  }
  await ensureSchema();
  if (useLocalStore()) {
    return withLocal((db) => {
      const f = db.sceneFiles[`${userId}:${boardId}:${fileId}`];
      if (!f) throw httpError(404, "Arquivo não encontrado.");
      return {
        id: f.file_id,
        mimeType: f.mime_type,
        dataURL: f.data_url,
        created: f.created_at,
        lastRetrieved: Date.now(),
      };
    });
  }
  const res = await getPool().query(
    `SELECT file_id, mime_type, data_url, created_at
     FROM scene_files WHERE user_id = $1 AND board_id = $2 AND file_id = $3`,
    [userId, boardId, fileId],
  );
  const f = res.rows[0];
  if (!f) throw httpError(404, "Arquivo não encontrado.");
  return {
    id: f.file_id,
    mimeType: f.mime_type,
    dataURL: f.data_url,
    created: Number(f.created_at || Date.now()),
    lastRetrieved: Date.now(),
  };
}

export async function putSceneFile(userId, boardId, file) {
  if (
    !isValidId(boardId) ||
    !file ||
    typeof file.id !== "string" ||
    !file.id ||
    file.id.length > 120 ||
    typeof file.dataURL !== "string" ||
    !file.dataURL.startsWith("data:")
  ) {
    throw httpError(400, "Arquivo de cena inválido.");
  }
  await ensureSchema();
  const mimeType = String(file.mimeType || "application/octet-stream").slice(0, 120);
  const created = Number.isFinite(Number(file.created)) ? Math.floor(Number(file.created)) : Date.now();
  if (useLocalStore()) {
    return withLocal((db) => {
      if (!db.boards[`${userId}:${boardId}`]) {
        throw httpError(404, "Este quadro foi excluído em outro dispositivo.");
      }
      db.sceneFiles[`${userId}:${boardId}:${file.id}`] = {
        userId,
        board_id: boardId,
        file_id: file.id,
        mime_type: mimeType,
        data_url: file.dataURL,
        created_at: created,
      };
      return { ok: true, id: file.id };
    }, true);
  }
  const check = await getPool().query(
    `SELECT 1 FROM boards WHERE user_id = $1 AND id = $2`,
    [userId, boardId],
  );
  if (!check.rows.length) {
    throw httpError(404, "Este quadro foi excluído em outro dispositivo.");
  }
  await getPool().query(
    `INSERT INTO scene_files (file_id, board_id, user_id, mime_type, data_url, created_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (user_id, board_id, file_id) DO UPDATE SET mime_type = EXCLUDED.mime_type, data_url = EXCLUDED.data_url`,
    [file.id, boardId, userId, mimeType, file.dataURL, created],
  );
  return { ok: true, id: file.id };
}

export async function saveScene(
  userId,
  boardId,
  { scene, cover, expectedRevision, newFiles = {}, usedFileIds = [] },
) {
  if (!isValidId(boardId) || !scene || !Array.isArray(scene.elements)) {
    throw httpError(400, "Dados do quadro inválidos.");
  }
  await ensureSchema();
  const now = Date.now();
  const elementsJson = JSON.stringify(scene.elements);
  const appStateJson = JSON.stringify(scene.appState || {});
  const clearInitial = scene.elements.some((e) => e.customData?.initialReference === boardId);
  const cleanUsed = Array.isArray(usedFileIds)
    ? usedFileIds.filter((id) => typeof id === "string" && id.length <= 120)
    : [];
  const validCover =
    cover === undefined
      ? undefined
      : cover === null
        ? null
        : typeof cover === "string" && cover.startsWith("data:image/")
          ? cover
          : undefined;

  if (useLocalStore()) {
    return withLocal((db) => {
      const board = db.boards[`${userId}:${boardId}`];
      if (!board) {
        throw httpError(
          404,
          "Este quadro foi excluído em outro dispositivo. Exporte uma cópia pelo menu do editor.",
        );
      }
      const currentRev = Number(board.revision || 0);
      if (currentRev !== Number(expectedRevision)) {
        throw httpError(
          409,
          "Este quadro foi alterado em outro dispositivo. Recarregue para ver a versão mais recente ou exporte sua cópia.",
          { code: "CONFLICT", serverRevision: currentRev },
        );
      }
      const revision = currentRev + 1;
      for (const [fid, f] of Object.entries(newFiles || {})) {
        if (f && typeof f.dataURL === "string" && f.dataURL.startsWith("data:")) {
          db.sceneFiles[`${userId}:${boardId}:${fid}`] = {
            userId,
            board_id: boardId,
            file_id: fid,
            mime_type: String(f.mimeType || "image/png").slice(0, 120),
            data_url: f.dataURL,
            created_at: Number(f.created || now),
          };
        }
      }
      const usedSet = new Set(cleanUsed);
      for (const k of Object.keys(db.sceneFiles)) {
        if (k.startsWith(`${userId}:${boardId}:`)) {
          const fid = k.slice(`${userId}:${boardId}:`.length);
          if (!usedSet.has(fid)) delete db.sceneFiles[k];
        }
      }
      db.scenes[`${userId}:${boardId}`] = {
        userId,
        board_id: boardId,
        writer: typeof scene.writer === "string" ? scene.writer.slice(0, 80) : null,
        sequence: Number(scene.sequence || 0),
        revision,
        elements_json: elementsJson,
        app_state_json: appStateJson,
        updated_at: now,
      };
      board.revision = revision;
      board.updated_at = now;
      if (board.initial_link && clearInitial) board.initial_link = null;
      if (validCover !== undefined) {
        board.preview = validCover;
        board.cover = null;
      }
      return { revision, updated: now };
    }, true);
  }

  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const boardRes = await client.query(
      `SELECT revision, initial_link FROM boards WHERE user_id = $1 AND id = $2 FOR UPDATE`,
      [userId, boardId],
    );
    const board = boardRes.rows[0];
    if (!board) {
      throw httpError(
        404,
        "Este quadro foi excluído em outro dispositivo. Exporte uma cópia pelo menu do editor.",
      );
    }
    const currentRev = Number(board.revision || 0);
    if (currentRev !== Number(expectedRevision)) {
      throw httpError(
        409,
        "Este quadro foi alterado em outro dispositivo. Recarregue para ver a versão mais recente ou exporte sua cópia.",
        { code: "CONFLICT", serverRevision: currentRev },
      );
    }
    const revision = currentRev + 1;

    for (const [fid, f] of Object.entries(newFiles || {})) {
      if (
        typeof fid === "string" &&
        fid.length <= 120 &&
        f &&
        typeof f.dataURL === "string" &&
        f.dataURL.startsWith("data:")
      ) {
        await client.query(
          `INSERT INTO scene_files (file_id, board_id, user_id, mime_type, data_url, created_at)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (user_id, board_id, file_id) DO UPDATE SET mime_type = EXCLUDED.mime_type, data_url = EXCLUDED.data_url`,
          [
            fid,
            boardId,
            userId,
            String(f.mimeType || "image/png").slice(0, 120),
            f.dataURL,
            Number(f.created || now),
          ],
        );
      }
    }

    if (cleanUsed.length) {
      await client.query(
        `DELETE FROM scene_files WHERE user_id = $1 AND board_id = $2 AND NOT (file_id = ANY($3::text[]))`,
        [userId, boardId, cleanUsed],
      );
    } else {
      await client.query(
        `DELETE FROM scene_files WHERE user_id = $1 AND board_id = $2`,
        [userId, boardId],
      );
    }

    await client.query(
      `INSERT INTO scenes (board_id, user_id, writer, sequence, revision, elements_json, app_state_json, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (user_id, board_id) DO UPDATE SET
         writer = EXCLUDED.writer,
         sequence = EXCLUDED.sequence,
         revision = EXCLUDED.revision,
         elements_json = EXCLUDED.elements_json,
         app_state_json = EXCLUDED.app_state_json,
         updated_at = EXCLUDED.updated_at`,
      [
        boardId,
        userId,
        typeof scene.writer === "string" ? scene.writer.slice(0, 80) : null,
        Number(scene.sequence || 0),
        revision,
        elementsJson,
        appStateJson,
        now,
      ],
    );

    const updates = ["revision = $3", "updated_at = $4"];
    const params = [userId, boardId, revision, now];
    let idx = 5;
    if (board.initial_link && clearInitial) {
      updates.push("initial_link = NULL");
    }
    if (validCover !== undefined) {
      updates.push(`preview = $${idx++}`);
      params.push(validCover);
      updates.push("cover = NULL");
    }
    await client.query(
      `UPDATE boards SET ${updates.join(", ")} WHERE user_id = $1 AND id = $2`,
      params,
    );

    await client.query("COMMIT");
    return { revision, updated: now };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export async function setSetting(userId, key, value) {
  if (!["pen", "library"].includes(key)) {
    throw httpError(400, "Configuração inválida.");
  }
  await ensureSchema();
  const now = Date.now();
  const json = JSON.stringify(value ?? null);
  if (useLocalStore()) {
    return withLocal((db) => {
      db.settings[`${userId}:${key}`] = {
        userId,
        key,
        value_json: json,
        updated_at: now,
      };
    }, true);
  }
  await getPool().query(
    `INSERT INTO user_settings (user_id, key, value_json, updated_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, key) DO UPDATE SET value_json = EXCLUDED.value_json, updated_at = EXCLUDED.updated_at`,
    [userId, key, json, now],
  );
}

export async function importLocalMetadata(userId, { projects = [], boards = [], settings = {} }) {
  await ensureSchema();
  const now = Date.now();
  const importedBoardIds = [];
  if (useLocalStore()) {
    return withLocal((db) => {
      for (const rawProject of projects.slice(0, 200)) {
        const p = sanitizeProjectInput(rawProject);
        const key = `${userId}:${p.id}`;
        if (!db.projects[key]) {
          db.projects[key] = {
            userId,
            id: p.id,
            name: p.name,
            color: p.color,
            updated_at: p.updated,
          };
        }
      }
      for (const rawBoard of boards.slice(0, 500)) {
        const b = sanitizeBoardInput(rawBoard);
        const key = `${userId}:${b.id}`;
        if (!db.boards[key]) {
          db.boards[key] = {
            userId,
            id: b.id,
            name: b.name,
            project_id: b.project,
            cover: b.cover,
            preview: b.preview,
            favorite: b.favorite,
            initial_link: b.initialLink,
            revision: 0,
            updated_at: b.updated,
          };
          importedBoardIds.push(b.id);
        }
      }
      for (const k of ["pen", "library"]) {
        if (settings[k] !== undefined && !db.settings[`${userId}:${k}`]) {
          db.settings[`${userId}:${k}`] = {
            userId,
            key: k,
            value_json: JSON.stringify(settings[k]),
            updated_at: now,
          };
        }
      }
      return { importedBoardIds };
    }, true);
  }
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    for (const rawProject of projects.slice(0, 200)) {
      const p = sanitizeProjectInput(rawProject);
      await client.query(
        `INSERT INTO projects (id, user_id, name, color, updated_at)
         VALUES ($1, $2, $3, $4, $5) ON CONFLICT (user_id, id) DO NOTHING`,
        [p.id, userId, p.name, p.color, p.updated],
      );
    }
    for (const rawBoard of boards.slice(0, 500)) {
      const b = sanitizeBoardInput(rawBoard);
      const res = await client.query(
        `INSERT INTO boards (id, user_id, name, project_id, cover, preview, favorite, initial_link, revision, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0, $9) ON CONFLICT (user_id, id) DO NOTHING RETURNING id`,
        [b.id, userId, b.name, b.project, b.cover, b.preview, b.favorite, b.initialLink, b.updated],
      );
      if (res.rows.length) importedBoardIds.push(b.id);
    }
    for (const k of ["pen", "library"]) {
      if (settings[k] !== undefined) {
        await client.query(
          `INSERT INTO user_settings (user_id, key, value_json, updated_at)
           VALUES ($1, $2, $3, $4) ON CONFLICT (user_id, key) DO NOTHING`,
          [userId, k, JSON.stringify(settings[k]), now],
        );
      }
    }
    await client.query("COMMIT");
    return { importedBoardIds };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
