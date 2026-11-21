import { openDB } from "idb";
import { forgetJournal } from "./recovery.js";

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
export async function initialize() {
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
export async function list() {
  const d = await db;
  return Promise.all([d.getAll("projects"), d.getAll("boards")]);
}
export async function put(store, value) {
  return (await db).put(store, value);
}
export async function patchBoard(id, patch) {
  const tx = (await db).transaction("boards", "readwrite"),
    board = await tx.store.get(id);
  if (board) await tx.store.put({ ...board, ...patch });
  await tx.done;
}
export async function getScene(id) {
  return (await db).get("scenes", id);
}
export async function saveScene(id, scene, cover, expectedRevision) {
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
    const tx = (await db).transaction(["boards", "scenes"], "readwrite");
    await tx.objectStore("boards").delete(id);
    await tx.objectStore("scenes").delete(id);
    await tx.done;
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
  return (await db).put("settings", value, name);
}
