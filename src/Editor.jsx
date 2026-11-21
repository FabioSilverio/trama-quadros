import React, { useEffect, useRef, useState } from "react";
import {
  Excalidraw,
  convertToExcalidrawElements as convert,
  viewportCoordsToSceneCoords,
  sceneCoordsToViewportCoords,
  newElementWith,
  CaptureUpdateAction,
  exportToBlob,
} from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import {
  ArrowLeft,
  Link2,
  SlidersHorizontal,
  Check,
  ExternalLink,
  Play,
  Type,
  Folder,
  MessageSquareText,
  X,
} from "lucide-react";
import {
  getScene,
  saveScene,
  patchBoard,
  getSetting,
  setSetting,
} from "./storage.js";
import { sceneSpecs } from "./art.jsx";
import { Dialog } from "./ui.jsx";
import { parseLink } from "./links.js";
import { linkCard, lettering, textDefaults, readData } from "./media.js";
import "./editor.css";

const immediate = CaptureUpdateAction.IMMEDIATELY;
const defaults = { smoothing: 0 };
const sceneState = (a) =>
  Object.fromEntries(
    [
      "viewBackgroundColor",
      "scrollX",
      "scrollY",
      "zoom",
      "gridSize",
      "gridModeEnabled",
      "currentItemFontFamily",
      "currentItemFontSize",
      "currentItemStrokeColor",
      "currentItemStrokeWidth",
      "currentItemRoughness",
      "currentItemFillStyle",
      "currentItemBackgroundColor",
      "currentItemOpacity",
      "currentItemStrokeStyle",
      "currentItemRoundness",
    ]
      .filter((k) => a[k] !== undefined)
      .map((k) => [k, a[k]]),
  );
export default function Editor({ board, project, leave }) {
  const [initial, init] = useState(null),
    [api, setApi] = useState(null),
    [problem, fail] = useState(""),
    [status, setStatus] = useState("Salvo"),
    [selected, select] = useState(null),
    [modal, dialog] = useState(null),
    [busy, setBusy] = useState(0),
    [live, showLive] = useState(null),
    [liveRect, positionLive] = useState(null),
    [prefs, preferences] = useState(defaults);
  const host = useRef(null),
    alive = useRef(true),
    apiRef = useRef(null),
    latest = useRef(null),
    written = useRef(null),
    timer = useRef(),
    queue = useRef(Promise.resolve()),
    started = useRef(false),
    base = useRef(null),
    pointer = useRef(null),
    liveId = useRef(null),
    hover = useRef(null),
    pending = useRef(0);
  function notify(message) {
    apiRef.current?.setToast({ message, duration: 4200, closable: true });
  }
  function save(cover) {
    clearTimeout(timer.current);
    const snap = latest.current;
    if (!snap || (cover === undefined && snap === written.current))
      return queue.current;
    const op = queue.current
      .catch(() => {})
      .then(() => saveScene(board.id, snap, cover))
      .then(() => {
        written.current = snap;
        if (alive.current && latest.current === snap) setStatus("Salvo");
      })
      .catch((err) => {
        if (alive.current) setStatus("Erro ao salvar");
        throw err;
      });
    queue.current = op;
    return op;
  }
  useEffect(() => {
    alive.current = true;
    let release;
    const held = new Promise((r) => (release = r));
    async function load() {
      const [scene, settings, library] = await Promise.all([
        getScene(board.id),
        getSetting("pen"),
        getSetting("library"),
      ]);
      if (!alive.current) return;
      preferences({ ...defaults, ...settings });
      init(
        scene
          ? { ...scene, libraryItems: library || [] }
          : {
              elements: convert(sceneSpecs(board.cover)),
              appState: { viewBackgroundColor: "#ffffff" },
              scrollToContent: true,
              libraryItems: library || [],
            },
      );
    }
    const lock = navigator.locks
      ? navigator.locks.request(
          "trama-board-" + board.id,
          { ifAvailable: true },
          async (lock) => {
            if (!alive.current) return;
            if (!lock) {
              fail(
                "Este quadro está aberto em outra aba. Feche a outra aba para editar aqui.",
              );
              return;
            }
            await load();
            await held;
            await queue.current.catch(() => {});
          },
        )
      : load();
    lock.catch(() => fail("Não foi possível abrir o quadro neste navegador."));
    const hide = () => {
      if (document.visibilityState === "hidden") save().catch(() => {});
    };
    const unload = () => save().catch(() => {});
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("pagehide", unload);
    return () => {
      alive.current = false;
      clearTimeout(timer.current);
      save().catch(() => {});
      release();
      document.removeEventListener("visibilitychange", hide);
      window.removeEventListener("pagehide", unload);
    };
  }, [board.id]);
  useEffect(() => {
    apiRef.current = api;
    if (!api || !initial || started.current || !board.initialLink) return;
    started.current = true;
    const task = setTimeout(async () => {
      if (
        !api
          .getSceneElements()
          .some((e) => e.customData?.initialReference === board.id)
      ) {
        const added = await addReference(board.initialLink, undefined, true);
        if (!added || !alive.current) return;
        snapshot(api.getSceneElements(), api.getAppState(), api.getFiles());
        await save().catch(() => {});
        if (written.current !== latest.current) return;
      }
      await patchBoard(board.id, { initialLink: null });
    }, 150);
    return () => clearTimeout(task);
  }, [api, initial]);
  function center() {
    const r = host.current.getBoundingClientRect();
    return viewportCoordsToSceneCoords(
      { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 },
      api.getAppState(),
    );
  }
  function append(elements, focus = true) {
    const els = convert(elements, { regenerateIds: false });
    api.updateScene({
      elements: [...api.getSceneElements(), ...els],
      appState: focus
        ? {
            selectedElementIds: Object.fromEntries(
              els.map((e) => [e.id, true]),
            ),
          }
        : {},
      captureUpdate: immediate,
    });
    if (focus) api.setActiveTool({ type: "selection" });
    return els;
  }
  function insertImage(data, pos, oldId) {
    const fileId = crypto.randomUUID(),
      now = Date.now();
    api.addFiles([
      {
        id: fileId,
        dataURL: data.dataURL,
        mimeType: "image/png",
        created: now,
        lastRetrieved: now,
      },
    ]);
    const old = oldId && api.getSceneElements().find((e) => e.id === oldId);
    if (old) {
      api.updateScene({
        elements: api
          .getSceneElements()
          .map((e) =>
            e === old
              ? newElementWith(e, {
                  fileId,
                  width: data.width,
                  height: data.height,
                  customData: data.customData,
                  status: "saved",
                })
              : e,
          ),
        captureUpdate: immediate,
      });
      return;
    }
    const scale = Math.min(
      1,
      (host.current.clientWidth - 44) /
        (data.width * api.getAppState().zoom.value),
    );
    append([
      {
        type: "image",
        id: crypto.randomUUID(),
        fileId,
        status: "saved",
        x: pos.x - (data.width * scale) / 2,
        y: pos.y - (data.height * scale) / 2,
        width: data.width * scale,
        height: data.height * scale,
        scale: [1, 1],
        customData: data.customData,
        link: data.link || null,
      },
    ]);
  }
  async function addReference(raw, pos, isInitial = false) {
    const at = pos || center();
    pending.current++;
    setBusy(pending.current);
    try {
      const data = await linkCard(raw);
      if (!alive.current) return false;
      if (isInitial) data.customData.initialReference = board.id;
      insertImage(data, at);
      return true;
    } catch (e) {
      if (alive.current) notify(e.message || "Falha ao inserir a referência.");
      return false;
    } finally {
      pending.current--;
      if (alive.current) setBusy(pending.current);
    }
  }
  function snapshot(elements, state, files) {
    const active = elements.filter((e) => !e.isDeleted),
      used = new Set(active.map((e) => e.fileId).filter(Boolean));
    latest.current = {
      elements: active,
      appState: sceneState(state),
      files: Object.fromEntries(
        Object.entries(files).filter(([id]) => used.has(id)),
      ),
    };
  }
  function onChange(elements, state, files) {
    const only = Object.keys(state.selectedElementIds);
    const chosen =
      only.length === 1
        ? elements.find((e) => e.id === only[0] && !e.isDeleted)
        : null;
    select(
      chosen?.customData?.reference || chosen?.customData?.lettering
        ? chosen
        : null,
    );
    if (liveId.current) {
      const e = elements.find(
        (el) => el.id === liveId.current && !el.isDeleted,
      );
      if (e) livePosition(e, state);
      else closeLive();
    }
    const previous = base.current,
      version = elements.map((e) => e.id + ":" + e.versionNonce).join(","),
      view = JSON.stringify(sceneState(state));
    if (
      previous?.version === version &&
      previous.view === view &&
      previous.files === files
    )
      return;
    base.current = { version, view, files };
    snapshot(elements, state, files);
    if (!previous) return;
    setStatus("Salvando…");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => save().catch(() => {}), 300);
  }
  function openLive(el) {
    const ref = parseLink(el.customData.reference.url);
    if (!ref) return;
    liveId.current = el.id;
    showLive({ ...el.customData.reference, frame: ref.frame, url: ref.url });
    livePosition(el, api.getAppState());
  }
  function livePosition(e, state) {
    const xy = sceneCoordsToViewportCoords({ sceneX: e.x, sceneY: e.y }, state);
    const r = host.current.getBoundingClientRect();
    const w = Math.min(
        Math.max(e.width * state.zoom.value, 285),
        Math.max(200, r.width - 20),
      ),
      h = Math.min(
        Math.max(e.height * state.zoom.value, 265),
        Math.max(170, r.height - 24),
      );
    const rect = {
      width: w,
      height: h,
      left: Math.max(8, Math.min(xy.x - r.left, r.width - w - 8)),
      top: Math.max(8, Math.min(xy.y - r.top, r.height - h - 8)),
    };
    positionLive((old) =>
      old && Object.keys(rect).every((k) => old[k] === rect[k]) ? old : rect,
    );
  }
  function closeLive() {
    liveId.current = null;
    showLive(null);
    positionLive(null);
  }
  function smoothingEnd(tool) {
    const stroke = pointer.current;
    if (
      !stroke ||
      stroke.type !== "mouse" ||
      tool.type !== "freedraw" ||
      !prefs.smoothing
    )
      return;
    requestAnimationFrame(() => {
      if (!alive.current) return;
      const all = api.getSceneElements();
      const index = all.findLastIndex(
        (e) => e.type === "freedraw" && !stroke.ids.has(e.id),
      );
      if (index < 0) return;
      const e = all[index];
      if (e.points.length < 4) return;
      const radius = Number(prefs.smoothing);
      const points = e.points.map((p, i, arr) => {
        if (i === 0 || i === arr.length - 1) return p;
        let sx = 0,
          sy = 0,
          weight = 0;
        for (
          let j = Math.max(0, i - radius);
          j <= Math.min(arr.length - 1, i + radius);
          j++
        ) {
          const w = radius + 1 - Math.abs(i - j);
          sx += arr[j][0] * w;
          sy += arr[j][1] * w;
          weight += w;
        }
        return [sx / weight, sy / weight];
      });
      api.updateScene({
        elements: all.map((el, i) =>
          i === index ? newElementWith(el, { points }) : el,
        ),
        captureUpdate: CaptureUpdateAction.NEVER,
      });
    });
  }
  async function exit() {
    if (!api || pending.current) return;
    try {
      const elements = api.getSceneElements();
      snapshot(elements, api.getAppState(), api.getFiles());
      let cover;
      if (elements.length) {
        try {
          const blob = await exportToBlob({
            elements,
            files: api.getFiles(),
            appState: {
              ...api.getAppState(),
              exportBackground: true,
              exportWithDarkMode: false,
            },
            maxWidthOrHeight: 620,
            mimeType: "image/png",
          });
          cover = await readData(blob);
        } catch {}
      } else cover = null;
      await save(cover);
      leave();
    } catch {
      notify(
        "O quadro ainda não foi salvo. Exporte uma cópia pelo menu do editor.",
      );
    }
  }
  function drop(e) {
    const raw =
      e.dataTransfer
        .getData("text/uri-list")
        .split(/\r?\n/)
        .find((x) => x && !x.startsWith("#")) ||
      e.dataTransfer.getData("text/plain");
    if (api && parseLink(raw)) {
      e.preventDefault();
      e.stopPropagation();
      addReference(
        raw,
        viewportCoordsToSceneCoords(
          { clientX: e.clientX, clientY: e.clientY },
          api.getAppState(),
        ),
      );
    }
  }
  async function formSubmit(e) {
    e.preventDefault();
    const m = modal;
    try {
      if (m.type === "link") {
        if (!parseLink(m.url))
          throw Error("Cole um endereço http ou https válido.");
        dialog(null);
        await addReference(m.url);
        return;
      }
      if (m.type === "caption") {
        const el = api.getSceneElements().find((el) => el.id === m.id);
        if (el)
          append([
            {
              type: "text",
              x: el.x,
              y: el.y + el.height + 10,
              text: m.text.trim(),
              fontSize: 20,
            },
          ]);
      }
      if (m.type === "text") {
        const data = await lettering(m.spec);
        insertImage(data, center(), m.id);
      }
      dialog(null);
    } catch (err) {
      dialog({ ...m, error: err.message });
    }
  }
  function textDialog(el) {
    dialog({
      type: "text",
      id: el?.id,
      spec: { ...textDefaults, ...el?.customData?.lettering },
    });
  }
  function changeSpec(p) {
    dialog((m) => ({ ...m, spec: { ...m.spec, ...p } }));
  }
  if (problem)
    return (
      <div className="loading">
        <p>{problem}</p>
        <button className="secondary" onClick={leave}>
          Voltar aos quadros
        </button>
      </div>
    );
  return (
    <div className="editor-page">
      <header className="editor-top">
        <button
          className="icon"
          aria-label="Voltar aos quadros"
          disabled={busy > 0}
          onClick={exit}
        >
          <ArrowLeft size={18} />
        </button>
        <img src="/trama.svg" alt="Trama" />
        <div className="editor-name">
          <small>
            <Folder size={12} />
            {project?.name}
          </small>
          <b>{board.name}</b>
        </div>
        <span className="save-status" role="status">
          <Check size={14} />
          {busy ? "Carregando referência…" : status}
        </span>
        <div className="editor-buttons">
          <button
            className="secondary"
            aria-label="Ajustes"
            disabled={!api}
            onClick={() => dialog({ type: "settings" })}
          >
            <SlidersHorizontal size={16} />
            <span>Ajustes</span>
          </button>
          <button
            className="primary"
            disabled={!api}
            onClick={() => dialog({ type: "link", url: "" })}
          >
            <Link2 size={16} />
            <span>Inserir link</span>
          </button>
        </div>
      </header>
      <div
        className="drawing"
        ref={host}
        onDragOverCapture={(e) => {
          if (
            [...e.dataTransfer.types].some((t) =>
              ["text/plain", "text/uri-list"].includes(t),
            )
          )
            e.preventDefault();
        }}
        onDropCapture={drop}
        onPointerMoveCapture={(e) => {
          hover.current = { clientX: e.clientX, clientY: e.clientY };
        }}
        onPointerDownCapture={(e) => {
          if (api?.getAppState().activeTool.type === "freedraw")
            pointer.current = {
              type: e.pointerType,
              ids: new Set(api.getSceneElements().map((el) => el.id)),
            };
          else pointer.current = null;
        }}
      >
        {initial && (
          <Excalidraw
            excalidrawAPI={setApi}
            initialData={initial}
            langCode="pt-BR"
            name={board.name}
            onChange={onChange}
            onPointerUp={smoothingEnd}
            onLibraryChange={(items) =>
              setSetting("library", items).catch(() =>
                notify("Falha ao salvar a biblioteca."),
              )
            }
            onPaste={(data, event) => {
              const raw =
                event?.clipboardData?.getData("text/plain") || data.text;
              if (raw && parseLink(raw.trim()) && !/\s/.test(raw.trim())) {
                addReference(
                  raw.trim(),
                  hover.current
                    ? viewportCoordsToSceneCoords(
                        hover.current,
                        api.getAppState(),
                      )
                    : undefined,
                );
                return false;
              }
              return true;
            }}
          />
        )}
        {selected && !live && (
          <div className="reference-tools">
            {selected.customData.reference ? (
              <>
                <button onClick={() => openLive(selected)}>
                  <Play size={15} />
                  Abrir referência
                </button>
                <button
                  onClick={() =>
                    dialog({ type: "caption", id: selected.id, text: "" })
                  }
                >
                  <MessageSquareText size={15} />
                  Legenda
                </button>
              </>
            ) : (
              <button onClick={() => textDialog(selected)}>
                <Type size={15} />
                Editar texto
              </button>
            )}
          </div>
        )}
        {live && liveRect && (
          <section className="live-card" style={liveRect}>
            <header>
              <b>{live.source}</b>
              <a
                href={live.url}
                target="_blank"
                rel="noreferrer"
                aria-label="Abrir original"
              >
                <ExternalLink size={15} />
              </a>
              <button
                aria-label="Voltar a desenhar"
                title="Voltar a desenhar"
                onClick={closeLive}
              >
                <X size={17} />
              </button>
            </header>
            {live.frame ? (
              <iframe
                title={live.title}
                src={live.frame}
                allow="fullscreen; encrypted-media; picture-in-picture"
                allowFullScreen
                referrerPolicy="strict-origin-when-cross-origin"
              />
            ) : (
              <div className="reader">
                {live.image && /^https:\/\//i.test(live.image) && (
                  <img src={live.image} alt="" referrerPolicy="no-referrer" />
                )}
                <h3>{live.title}</h3>
                <small>{live.author || live.host}</small>
                <p>{live.description}</p>
                <a href={live.url} target="_blank" rel="noreferrer">
                  Ler no site original ↗
                </a>
              </div>
            )}
          </section>
        )}
      </div>
      {modal && (
        <Dialog
          title={
            {
              link: "Inserir referência",
              caption: "Adicionar legenda",
              settings: "Ajustes do quadro",
              text: "Texto com fonte personalizada",
            }[modal.type]
          }
          close={() => dialog(null)}
        >
          {modal.type === "settings" ? (
            <div className="fields">
              <label>
                Suavização do mouse ·{" "}
                {prefs.smoothing === 0 ? "Original" : prefs.smoothing + " / 8"}
                <input
                  aria-label="Suavização do mouse"
                  type="range"
                  min="0"
                  max="8"
                  value={prefs.smoothing}
                  onChange={(e) => {
                    const next = {
                      ...prefs,
                      smoothing: Number(e.target.value),
                    };
                    preferences(next);
                    setSetting("pen", next).catch(() =>
                      notify("Falha ao salvar o ajuste."),
                    );
                  }}
                />
              </label>
              <p>
                Valores maiores suavizam o tremor nos traços à mão livre ao
                soltar o mouse.
              </p>
              <button className="secondary" onClick={() => textDialog()}>
                <Type size={16} />
                Inserir texto com outra fonte
              </button>
            </div>
          ) : (
            <form onSubmit={formSubmit}>
              {modal.type === "link" && (
                <label>
                  URL da referência
                  <input
                    autoFocus
                    type="url"
                    required
                    placeholder="https://…"
                    value={modal.url}
                    onChange={(e) => dialog({ ...modal, url: e.target.value })}
                  />
                </label>
              )}
              {modal.type === "caption" && (
                <label>
                  Legenda
                  <textarea
                    autoFocus
                    required
                    value={modal.text}
                    onChange={(e) => dialog({ ...modal, text: e.target.value })}
                  />
                </label>
              )}
              {modal.type === "text" && (
                <>
                  <label>
                    Texto
                    <textarea
                      autoFocus
                      required
                      maxLength={6000}
                      value={modal.spec.text}
                      onChange={(e) => changeSpec({ text: e.target.value })}
                    />
                  </label>
                  <label>
                    Fonte instalada ou nome da família
                    <input
                      list="families"
                      value={modal.spec.family}
                      onChange={(e) =>
                        changeSpec({
                          family: e.target.value,
                          fontData: null,
                          fontId: null,
                        })
                      }
                    />
                    <datalist id="families">
                      {[
                        "Georgia",
                        "Arial",
                        "Verdana",
                        "Courier New",
                        "Trebuchet MS",
                        "Times New Roman",
                        "DM Sans Variable",
                        "Impact",
                        "Segoe UI",
                      ].map((f) => (
                        <option key={f}>{f}</option>
                      ))}
                    </datalist>
                  </label>
                  <label>
                    Ou carregue uma fonte (.woff2, .woff, .ttf, .otf)
                    <input
                      type="file"
                      accept=".woff2,.woff,.ttf,.otf"
                      onChange={async (e) => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        if (f.size > 4e6) {
                          dialog({
                            ...modal,
                            error: "Use um arquivo de fonte de até 4 MB.",
                          });
                          return;
                        }
                        changeSpec({
                          fontData: await readData(f),
                          fontId: crypto.randomUUID(),
                          family: f.name,
                        });
                      }}
                    />
                  </label>
                  <div className="text-options">
                    <label>
                      Tamanho
                      <input
                        type="number"
                        min="8"
                        max="240"
                        required
                        value={modal.spec.size}
                        onChange={(e) =>
                          changeSpec({ size: Number(e.target.value) })
                        }
                      />
                    </label>
                    <label>
                      Cor
                      <input
                        type="color"
                        value={modal.spec.color}
                        onChange={(e) => changeSpec({ color: e.target.value })}
                      />
                    </label>
                    <button
                      type="button"
                      aria-label="Negrito"
                      aria-pressed={modal.spec.bold}
                      onClick={() => changeSpec({ bold: !modal.spec.bold })}
                    >
                      <b>B</b>
                    </button>
                    <button
                      type="button"
                      aria-label="Itálico"
                      aria-pressed={modal.spec.italic}
                      onClick={() => changeSpec({ italic: !modal.spec.italic })}
                    >
                      <i>I</i>
                    </button>
                  </div>
                </>
              )}
              {modal.error && <p role="alert">{modal.error}</p>}
              <footer>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => dialog(null)}
                >
                  Cancelar
                </button>
                <button className="primary">
                  {modal.id && modal.type === "text"
                    ? "Salvar texto"
                    : "Inserir"}
                </button>
              </footer>
            </form>
          )}
        </Dialog>
      )}
    </div>
  );
}
