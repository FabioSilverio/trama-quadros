const key = (id) => "trama-recovery:" + id;

// A tab may close before an IndexedDB transaction completes. Keep only files
// missing from the last committed scene in the synchronous navigation journal.
export function journalScene(id, scene, committed, revision) {
  if (!scene || scene === committed) return true;
  try {
    const files = Object.fromEntries(
      Object.entries(scene.files).filter(
        ([fileId]) => !committed?.files?.[fileId],
      ),
    );
    localStorage.setItem(
      key(id),
      JSON.stringify({ revision, scene: { ...scene, files } }),
    );
    return true;
  } catch {
    return false;
  }
}
export function recoverJournal(id, committed) {
  try {
    const raw = localStorage.getItem(key(id));
    if (!raw) return null;
    const { revision, scene } = JSON.parse(raw),
      base = committed?.revision || 0;
    const moreRecent =
      scene.writer &&
      scene.writer === committed?.writer &&
      scene.sequence > committed.sequence;
    if (
      !Array.isArray(scene.elements) ||
      !scene.appState ||
      !scene.files ||
      (base !== revision && !moreRecent)
    )
      return null;
    const files = { ...committed?.files, ...scene.files };
    return {
      ...scene,
      files: Object.fromEntries(
        scene.elements
          .filter((e) => e.fileId && files[e.fileId])
          .map((e) => [e.fileId, files[e.fileId]]),
      ),
    };
  } catch {
    return null;
  }
}
export function forgetJournal(id) {
  try {
    localStorage.removeItem(key(id));
  } catch {}
}
