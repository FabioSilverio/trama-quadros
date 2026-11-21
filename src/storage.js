import { openDB } from "idb";
import { forgetJournal } from "./recovery.js";
import {
  cloudCopyBoard,
  cloudCreateBoard,
  cloudDeleteBoard,
  cloudGetScene,
  cloudImportLocal,
  cloudPatchBoard,
  cloudPutProject,
  cloudSaveScene,
  cloudSeedStarters,
  cloudSetSetting,
  fetchWorkspace,
} from "./cloud.js";

export const palette = ["#7761ce", "#dc8b55", "#439b83", "#6894c6", "#c96887"];
const db = openDB("trama-workspace-v1", 1, {
  upgrade(db) {
    db.createObjectStore("projects", { keyPath: "id" });
    db.createObjectStore("boards", { keyPath: "id" });
    db.createObjectStore("scenes");
    db.createObjectStore("settings");
  },
});
const starters = [
  ["mapa", "Mapa de ideias", "Pesquisa visual", "map"],
  ["paleta", "Cores e composição", "Direção de arte", "palette"],
  ["roteiro", "Roteiro visual", "Conteúdo", "story"],
];
const starterIds = new Set(starters.map(([id]) => id));

let cloudMode = false;
const uploadedFilesByBoard = new Map();

export function setCloudMode(enabled) {
  cloudMode = Boolean(enabled);
  if (!cloudMode) uploadedFilesByBoard.clear();
}

export function isCloudMode() {
  return cloudMode;
}

function getUploadedSet(boardId) {
  let set = uploadedFilesByBoard.get(boardId);
  if (!set) {
    set = new Set();
    uploadedFilesByBoard.set(boardId, set);
  }
  return set;
}

export async function initialize() {
  if (cloudMode) return;
  const tx = (await db).transaction(
    ["projects", "boards", "settings"],
    "readwrite",
  );
  if (!(await tx.objectStore("settings").get("initialized"))) {
    for (const [i, [id, name, project, cover]] of starters.entries()) {
      await tx
        .objectStore("projects")
        .put({ id, name: project, color: palette[i] });
      await tx.objectStore("boards").put({
        id,
        name,
        project: id,
        cover,
        updated: Date.now() - i * 60000,
        favorite: false,
      });
    }
    await tx.objectStore("settings").put(true, "initialized");
  }
  await tx.done;
}

export async function inspectLocalWorkspace() {
  try {
    const d = await db;
    const [projects, boards, sceneKeys, pen, library, migratedFor] =
      await Promise.all([
        d.getAll("projects"),
        d.getAll("boards"),
        d.getAllKeys("scenes"),
        d.get("settings", "pen"),
        d.get("settings", "library"),
        d.get("settings", "cloudUserId"),
      ]);
    if (migratedFor) {
      return {
        hasCustomData: false,
        boardCount: 0,
        projects: [],
        boards: [],
        sceneKeys: [],
        settings: {},
      };
    }
    const hasCustomProject = projects.some((p) => !starterIds.has(p.id));
    const hasCustomBoard = boards.some(
      (b) =>
        !starterIds.has(b.id) ||
        b.favorite ||
        b.preview ||
        (b.revision || 0) > 0 ||
        b.initialLink,
    );
    const hasCustomData =
      hasCustomProject || hasCustomBoard || sceneKeys.length > 0;
    const settings = {};
    if (pen !== undefined) settings.pen = pen;
    if (library !== undefined) settings.library = library;
    return {
      hasCustomData,
      boardCount: boards.length,
      projects,
      boards,
      sceneKeys,
      settings,
    };
  } catch {
    return {
      hasCustomData: false,
      boardCount: 0,
      projects: [],
      boards: [],
      sceneKeys: [],
      settings: {},
    };
  }
}

export async function migrateLocalToCloud(userId, seedIfEmpty = false) {
  const local = await inspectLocalWorkspace();
  if (local.hasCustomData) {
    const { importedBoardIds } = await cloudImportLocal({
      projects: local.projects,
      boards: local.boards,
      settings: local.settings,
    });
    const d = await db;
    for (const boardId of importedBoardIds) {
      const scene = await d.get("scenes", boardId);
      const board = local.boards.find((b) => b.id === boardId);
      if (scene && Array.isArray(scene.elements)) {
        try {
          await cloudSaveScene(
            boardId,
            scene,
            board?.preview,
            0,
            getUploadedSet(boardId),
          );
        } catch {
          /* Keep going so remaining boards still migrate. */
        }
      }
    }
  } else if (seedIfEmpty) {
    await cloudSeedStarters();
  }
  const d = await db;
  await d.put("settings", userId, "cloudUserId");
}

export async function clearLocalCache() {
  uploadedFilesByBoard.clear();
  try {
    const d = await db;
    const tx = d.transaction(
      ["projects", "boards", "scenes", "settings"],
      "readwrite",
    );
    await Promise.all([
      tx.objectStore("projects").clear(),
      tx.objectStore("boards").clear(),
      tx.objectStore("scenes").clear(),
      tx.objectStore("settings").clear(),
    ]);
    await tx.done;
  } catch {}
}

async function cacheWorkspaceSnapshot(projects, boards, settings) {
  try {
    const d = await db;
    const tx = d.transaction(
      ["projects", "boards", "settings"],
      "readwrite",
    );
    const projectStore = tx.objectStore("projects");
    const boardStore = tx.objectStore("boards");
    const settingStore = tx.objectStore("settings");
    await projectStore.clear();
    await boardStore.clear();
    for (const p of projects) await projectStore.put(p);
    for (const b of boards) await boardStore.put(b);
    if (settings && typeof settings === "object") {
      for (const [k, v] of Object.entries(settings)) {
        await settingStore.put(v, k);
      }
    }
    await tx.done;
  } catch {}
}

export async function list() {
  if (cloudMode) {
    const data = await fetchWorkspace();
    const projects = data.projects || [];
    const boards = data.boards || [];
    await cacheWorkspaceSnapshot(projects, boards, data.settings || {});
    return [projects, boards];
  }
  const d = await db;
  return Promise.all([d.getAll("projects"), d.getAll("boards")]);
}

export async function put(store, value) {
  if (cloudMode) {
    if (store === "projects") {
      const { project } = await cloudPutProject(value);
      try {
        await (await db).put("projects", project);
      } catch {}
      return project;
    }
    if (store === "boards") {
      const { board } = await cloudCreateBoard(value);
      try {
        await (await db).put("boards", board);
      } catch {}
      return board;
    }
  }
  return (await db).put(store, value);
}

export async function patchBoard(id, patch) {
  if (cloudMode) {
    const { board } = await cloudPatchBoard(id, patch);
    try {
      await (await db).put("boards", board);
    } catch {}
    return board;
  }
  const tx = (await db).transaction("boards", "readwrite"),
    board = await tx.store.get(id);
  if (board) await tx.store.put({ ...board, ...patch });
  await tx.done;
}

export async function getScene(id) {
  if (cloudMode) {
    const { board, scene } = await cloudGetScene(id);
    const uploaded = new Set(Object.keys(scene?.files || {}));
    uploadedFilesByBoard.set(id, uploaded);
    try {
      const tx = (await db).transaction(["boards", "scenes"], "readwrite");
      if (board) await tx.objectStore("boards").put(board);
      if (scene) await tx.objectStore("scenes").put(scene, id);
      await tx.done;
    } catch {}
    return scene;
  }
  return (await db).get("scenes", id);
}

export async function saveScene(id, scene, cover, expectedRevision) {
  if (cloudMode) {
    const { revision, updated } = await cloudSaveScene(
      id,
      scene,
      cover,
      expectedRevision,
      getUploadedSet(id),
    );
    try {
      const tx = (await db).transaction(["boards", "scenes"], "readwrite");
      await tx.objectStore("scenes").put({ ...scene, revision }, id);
      const board = await tx.objectStore("boards").get(id);
      if (board) {
        await tx.objectStore("boards").put({
          ...board,
          revision,
          ...(board.initialLink &&
          scene.elements.some((e) => e.customData?.initialReference === id)
            ? { initialLink: null }
            : {}),
          updated,
          ...(cover !== undefined ? { preview: cover, cover: null } : {}),
        });
      }
      await tx.done;
    } catch {}
    return revision;
  }
  const tx = (await db).transaction(["boards", "scenes"], "readwrite");
  const boards = tx.objectStore("boards"),
    board = await boards.get(id);
  if (!board)
    throw Error(
      "Este quadro foi excluído em outra aba. Exporte uma cópia pelo menu do editor.",
    );
  if ((board.revision || 0) !== expectedRevision)
    throw Error(
      "Outra aba alterou o quadro. Exporte sua cópia antes de recarregar.",
    );
  const revision = expectedRevision + 1;
  {
    await tx.objectStore("scenes").put({ ...scene, revision }, id);
    await boards.put({
      ...board,
      revision,
      ...(board.initialLink &&
      scene.elements.some((e) => e.customData?.initialReference === id)
        ? { initialLink: null }
        : {}),
      updated: Date.now(),
      ...(cover !== undefined ? { preview: cover, cover: null } : {}),
    });
  }
  await tx.done;
  return revision;
}

export async function copyBoard(id) {
  if (cloudMode) {
    const { board } = await cloudCopyBoard(id);
    try {
      await (await db).put("boards", board);
    } catch {}
    return board;
  }
  const tx = (await db).transaction(["boards", "scenes"], "readwrite");
  const boards = tx.objectStore("boards"),
    scenes = tx.objectStore("scenes");
  const board = await boards.get(id);
  if (!board) throw Error("O quadro já foi excluído.");
  const scene = await scenes.get(id),
    copyId = crypto.randomUUID();
  await boards.put({
    ...board,
    id: copyId,
    name: board.name + " (cópia)",
    revision: 0,
    updated: Date.now(),
  });
  if (scene) await scenes.put({ ...scene, revision: 0 }, copyId);
  await tx.done;
}

export async function deleteBoard(id) {
  async function remove() {
    if (cloudMode) {
      await cloudDeleteBoard(id);
      uploadedFilesByBoard.delete(id);
    }
    try {
      const tx = (await db).transaction(["boards", "scenes"], "readwrite");
      await tx.objectStore("boards").delete(id);
      await tx.objectStore("scenes").delete(id);
      await tx.done;
    } catch {}
    forgetJournal(id);
  }
  if (!navigator.locks) return remove();
  return navigator.locks.request(
    "trama-board-" + id,
    { ifAvailable: true },
    (lock) => {
      if (!lock) throw Error("Feche o quadro na outra aba antes de excluí-lo.");
      return remove();
    },
  );
}

export async function getSetting(name) {
  return (await db).get("settings", name);
}

export async function setSetting(name, value) {
  if (cloudMode) {
    await cloudSetSetting(name, value);
  }
  try {
    return await (await db).put("settings", value, name);
  } catch {}
}
