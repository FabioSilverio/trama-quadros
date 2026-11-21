import { openDB } from "idb";

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
      await tx
        .objectStore("boards")
        .put({
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
export async function saveScene(id, scene, cover) {
  const tx = (await db).transaction(["boards", "scenes"], "readwrite");
  const boards = tx.objectStore("boards"),
    board = await boards.get(id);
  if (board) {
    await tx.objectStore("scenes").put(scene, id);
    await boards.put({
      ...board,
      updated: Date.now(),
      ...(cover !== undefined ? { preview: cover, cover: null } : {}),
    });
  }
  await tx.done;
}
export async function deleteBoard(id) {
  const tx = (await db).transaction(["boards", "scenes"], "readwrite");
  await tx.objectStore("boards").delete(id);
  await tx.objectStore("scenes").delete(id);
  await tx.done;
}
export async function getSetting(name) {
  return (await db).get("settings", name);
}
export async function setSetting(name, value) {
  return (await db).put("settings", value, name);
}
