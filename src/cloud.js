const MAX_INLINE_UPLOAD_BYTES = 1_500_000;
const MAX_SINGLE_INLINE_FILE_BYTES = 450_000;

async function apiRequest(url, options = {}) {
  const res = await fetch(url, {
    credentials: "same-origin",
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
    ...options,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {}
  if (!res.ok) {
    const err = new Error(
      data?.error || "Falha ao comunicar com o servidor. Tente novamente.",
    );
    err.status = res.status;
    if (res.status === 401) err.code = "UNAUTHORIZED";
    else if (data?.code) err.code = data.code;
    if (data?.serverRevision !== undefined) {
      err.serverRevision = data.serverRevision;
    }
    throw err;
  }
  return data;
}

export async function getSession() {
  try {
    return await apiRequest("/api/auth", { method: "GET" });
  } catch {
    return { cloudEnabled: false, user: null };
  }
}

export function registerAccount({ name, email, password, skipStarters = false }) {
  return apiRequest("/api/auth", {
    method: "POST",
    body: JSON.stringify({
      action: "register",
      name,
      email,
      password,
      skipStarters,
    }),
  });
}

export function loginAccount({ email, password }) {
  return apiRequest("/api/auth", {
    method: "POST",
    body: JSON.stringify({ action: "login", email, password }),
  });
}

export function logoutAccount() {
  return apiRequest("/api/auth", {
    method: "POST",
    body: JSON.stringify({ action: "logout" }),
  });
}

export function fetchWorkspace() {
  return apiRequest("/api/workspace", { method: "GET" });
}

export function cloudPutProject(project) {
  return apiRequest("/api/workspace", {
    method: "POST",
    body: JSON.stringify({ resource: "project", project }),
  });
}

export function cloudCreateBoard(board) {
  return apiRequest("/api/workspace", {
    method: "POST",
    body: JSON.stringify({ resource: "board", board }),
  });
}

export function cloudPatchBoard(id, patch) {
  return apiRequest("/api/workspace", {
    method: "PATCH",
    body: JSON.stringify({ resource: "board", id, patch }),
  });
}

export function cloudCopyBoard(id) {
  return apiRequest("/api/workspace", {
    method: "POST",
    body: JSON.stringify({ resource: "copy-board", id }),
  });
}

export function cloudDeleteBoard(id) {
  return apiRequest(
    "/api/workspace?resource=board&id=" + encodeURIComponent(id),
    { method: "DELETE" },
  );
}

export async function cloudGetScene(id) {
  const data = await apiRequest(
    "/api/workspace?resource=scene&id=" + encodeURIComponent(id),
    { method: "GET" },
  );
  if (data.scene && Array.isArray(data.missingFileIds) && data.missingFileIds.length) {
    const files = { ...(data.scene.files || {}) };
    for (const fileId of data.missingFileIds) {
      const res = await apiRequest(
        "/api/workspace?resource=scene-file&id=" +
          encodeURIComponent(id) +
          "&fileId=" +
          encodeURIComponent(fileId),
        { method: "GET" },
      );
      if (res?.file) files[fileId] = res.file;
    }
    data.scene.files = files;
  }
  return data;
}

export async function cloudSaveScene(
  boardId,
  scene,
  cover,
  expectedRevision,
  uploadedFileIds,
) {
  const allFiles = scene.files || {};
  const usedFileIds = Object.keys(allFiles);
  const unsentEntries = Object.entries(allFiles).filter(
    ([fid, f]) => f && !uploadedFileIds.has(fid),
  );
  const inlineFiles = {};
  let inlineBytes = 0;

  for (const [fid, f] of unsentEntries) {
    const size = typeof f.dataURL === "string" ? f.dataURL.length : 0;
    if (
      size > MAX_SINGLE_INLINE_FILE_BYTES ||
      inlineBytes + size > MAX_INLINE_UPLOAD_BYTES
    ) {
      await apiRequest("/api/workspace", {
        method: "PUT",
        body: JSON.stringify({
          resource: "scene-file",
          boardId,
          file: {
            id: fid,
            mimeType: f.mimeType || "image/png",
            dataURL: f.dataURL,
            created: f.created || Date.now(),
          },
        }),
      });
      uploadedFileIds.add(fid);
    } else {
      inlineFiles[fid] = f;
      inlineBytes += size;
    }
  }

  const res = await apiRequest("/api/workspace", {
    method: "PUT",
    body: JSON.stringify({
      resource: "scene",
      boardId,
      expectedRevision,
      cover,
      usedFileIds,
      newFiles: inlineFiles,
      scene: {
        writer: scene.writer,
        sequence: scene.sequence,
        elements: scene.elements,
        appState: scene.appState,
      },
    }),
  });
  for (const fid of Object.keys(inlineFiles)) {
    uploadedFileIds.add(fid);
  }
  return res;
}

export function cloudSetSetting(key, value) {
  return apiRequest("/api/workspace", {
    method: "PUT",
    body: JSON.stringify({ resource: "setting", key, value }),
  });
}

export function cloudImportLocal({ projects, boards, settings }) {
  return apiRequest("/api/workspace", {
    method: "POST",
    body: JSON.stringify({
      resource: "import-local",
      projects,
      boards,
      settings,
    }),
  });
}

export function cloudSeedStarters() {
  return apiRequest("/api/workspace", {
    method: "POST",
    body: JSON.stringify({ resource: "seed-starters" }),
  });
}
