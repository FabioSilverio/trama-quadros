import React, { useEffect, useRef, useState } from "react";
import {
  Excalidraw,
  convertToExcalidrawElements as convert,
  viewportCoordsToSceneCoords,
  sceneCoordsToViewportCoords,
  newElementWith,
  CaptureUpdateAction,
  exportToBlob,
  serializeAsJSON,
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
  RefreshCw,
  X,
} from "lucide-react";
import {
  getScene,
  saveScene,
  getSetting,
  setSetting,
  isCloudMode,
} from "./storage.js";
import { sceneSpecs } from "./art.jsx";
import { Dialog } from "./ui.jsx";
import { ThemePicker } from "./theme.jsx";
import { parseLink } from "./links.js";
import { linkCard, lettering, textDefaults, readData } from "./media.js";
import PostMedia from "./XMedia.jsx";
import "./editor.css";
import { journalScene, recoverJournal, forgetJournal } from "./recovery.js";

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
export default function Editor({
  board,
  project,
  leave,
  appearance,
  onUnauthorized,
}) {
  const [initial, init] = useState(null),
    [canvasKey, setCanvasKey] = useState(0),
    [api, setApi] = useState(null),
    [problem, fail] = useState(""),
    [status, setStatus] = useState("Salvo"),
    [conflict, setConflict] = useState(false),
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
    revision = useRef(0),
    writer = useRef(null),
    sequence = useRef(0),
    lastError = useRef(null),
    savingExit = useRef(false),
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
  async function reloadFromServer() {
    clearTimeout(timer.current);
    timer.current = null;
    forgetJournal(board.id);
    setStatus("Carregando…");
    try {
      const [committed, library] = await Promise.all([
        getScene(board.id),
        getSetting("library"),
      ]);
      if (!alive.current) return;
      revision.current = committed?.revision || 0;
      written.current = committed;
      latest.current = committed;
      lastError.current = null;
      base.current = null;
      setConflict(false);
      setStatus("Salvo");
      select(null);
      closeLive();
      init(
        committed
          ? { ...committed, libraryItems: library || [] }
          : {
              elements: convert(sceneSpecs(board.cover)),
              appState: { viewBackgroundColor: "#ffffff" },
              scrollToContent: true,
              libraryItems: library || [],
            },
      );
      setCanvasKey((n) => n + 1);
    } catch (err) {
      if (!alive.current) return;
      if (err?.code === "UNAUTHORIZED") {
        onUnauthorized?.();
        return;
      }
      setStatus("Erro ao salvar");
      notify(err?.message || "Não foi possível recarregar o quadro.");
    }
  }
  function save(cover) {
    clearTimeout(timer.current);
    timer.current = null;
    const snap = latest.current;
    if (!snap || (cover === undefined && snap === written.current))
      return queue.current;
    const op = queue.current
      .catch(() => {})
      .then(() => saveScene(board.id, snap, cover, revision.current))
      .then((savedRevision) => {
        revision.current = savedRevision;
        lastError.current = null;
        written.current = snap;
        if (alive.current && latest.current === snap) {
          setConflict(false);
          setStatus("Salvo");
        }
      })
      .catch((err) => {
        lastError.current = err;
        if (alive.current) {
          setConflict(err.code === "CONFLICT");
          setStatus(err.code === "CONFLICT" ? "Conflito" : "Erro ao salvar");
          notify(
            err.name === "QuotaExceededError"
              ? "Armazenamento cheio. Exporte uma cópia pelo menu do editor."
              : err.message || "Falha ao salvar o quadro.",
          );
          if (err.code === "UNAUTHORIZED") onUnauthorized?.();
        }
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
      const [committed, settings, library] = await Promise.all([
        getScene(board.id),
        getSetting("pen"),
        getSetting("library"),
      ]);
      if (!alive.current) return;
      const recovered = recoverJournal(board.id, committed);
      let scene = committed;
      revision.current = committed?.revision || 0;
      written.current = committed;
      if (recovered) {
        scene = recovered;
        try {
          revision.current = await saveScene(
            board.id,
            recovered,
            undefined,
            revision.current,
          );
          written.current = recovered;
          forgetJournal(board.id);
        } catch (err) {
          lastError.current = err;
          setStatus("Erro ao salvar");
        }
      } else {
        forgetJournal(board.id);
      }
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
    lock.catch((err) => {
      if (err?.code === "UNAUTHORIZED") {
        onUnauthorized?.();
        return;
      }
      fail(
        err?.message || "Não foi possível abrir o quadro neste navegador.",
      );
    });
    const hide = () => {
      if (document.visibilityState === "hidden") save().catch(() => {});
    };
    const journal = () => {
      const activeApi = apiRef.current;
      if (activeApi && base.current && !activeApi.getAppState().isLoading)
        snapshot(
          activeApi.getSceneElements(),
          activeApi.getAppState(),
          activeApi.getFiles(),
        );
      return journalScene(
        board.id,
        latest.current,
        written.current,
        revision.current,
      );
    };
    const unload = () => {
      journal();
      save().catch(() => {});
    };
    const protect = (event) => {
      if (!journal() || lastError.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", protect);
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("pagehide", unload);
    return () => {
      alive.current = false;
      clearTimeout(timer.current);
      if (lastError.current?.code !== "CONFLICT") save().catch(() => {});
      release();
      document.removeEventListener("visibilitychange", hide);
      window.removeEventListener("pagehide", unload);
      window.removeEventListener("beforeunload", protect);
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
      // The first durable scene containing this reference clears the queued URL atomically.
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
        mimeType: data.mimeType || "image/png",
        created: now,
        lastRetrieved: now,
      },
    ]);
    const old = oldId && api.getSceneElements().find((e) => e.id === oldId);
    if (old) {
      const nextWidth = old.customData?.reference ? old.width : data.width;
      const nextHeight = old.customData?.reference
        ? Math.round((old.width * data.height) / data.width)
        : data.height;
      api.updateScene({
        elements: api.getSceneElements().map((e) =>
          e === old
            ? newElementWith(e, {
                fileId,
                width: nextWidth,
                height: nextHeight,
                customData: {
                  ...e.customData,
                  ...data.customData,
                },
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
  async function refreshReference(el) {
    const ref = el?.customData?.reference;
    if (!ref?.url) return;
    pending.current++;
    setBusy(pending.current);
    try {
      const data = await linkCard(ref.url, ref.title || "");
      if (!alive.current) return;
      insertImage(data, center(), el.id);
    } catch (e) {
      if (alive.current) notify(e.message || "Falha ao atualizar o cartão.");
    } finally {
      pending.current--;
      if (alive.current) setBusy(pending.current);
    }
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
    writer.current ||= crypto.randomUUID();
    latest.current = {
      writer: writer.current,
      sequence: ++sequence.current,
      elements: active,
      appState: sceneState(state),
      files: Object.fromEntries(
        Object.entries(files).filter(([id]) => used.has(id)),
      ),
    };
  }
  function onChange(elements, state, files) {
    if (state.isLoading || !alive.current) return;
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
    if (!timer.current)
      timer.current = setTimeout(
        () => save().catch(() => {}),
        isCloudMode() ? 800 : 250,
      );
  }
  function openLive(el) {
    const ref = parseLink(el.customData.reference.url);
    if (!ref) return;
    liveId.current = el.id;
    showLive({
      ...ref,
      ...el.customData.reference,
      kind: ref.kind,
      frame: ref.frame,
      url: ref.url,
      media: el.customData.reference.media?.length
        ? el.customData.reference.media
        : ref.media,
    });
    livePosition(el, api.getAppState());
  }
  function livePosition(e, state) {
    const xy = sceneCoordsToViewportCoords({ sceneX: e.x, sceneY: e.y }, state);
    const r = host.current.getBoundingClientRect();
    const w = Math.min(
        Math.max(e.width * state.zoom.value, 320),
        Math.max(200, r.width - 20),
      ),
      h = Math.min(
        Math.max(e.height * state.zoom.value, 285),
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
    if (!api) {
      leave();
      return;
    }
    if (pending.current || savingExit.current) return;
    savingExit.current = true;
    try {
      const elements = api.getSceneElements();
      snapshot(elements, api.getAppState(), api.getFiles());
      let cover;
      if (elements.length) {
        try {
          const render = exportToBlob({
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
          // Keep leaving a large board responsive if thumbnail rendering stalls.
          cover = await Promise.race([
            render.then(readData),
            new Promise((resolve) =>
              setTimeout(() => resolve(undefined), 1200),
            ),
          ]);
        } catch {}
      } else cover = null;
      await save(cover);
      leave();
    } catch {
      savingExit.current = false;
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
        if (!m.text.trim()) throw Error("Digite a legenda antes de inserir.");
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
  function exportFile() {
    try {
      const json = serializeAsJSON(
        api.getSceneElements(),
        api.getAppState(),
        api.getFiles(),
        "local",
      );
      const url = URL.createObjectURL(
        new Blob([json], { type: "application/json" }),
      );
      const anchor = document.createElement("a");
      anchor.download =
        (board.name.replace(/[<>:"/\\|?*]/g, "-").slice(0, 90) || "Quadro") +
        ".excalidraw";
      anchor.href = url;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      notify("Falha ao gerar o arquivo. Tente novamente pelo menu do editor.");
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
          <b title={board.name}>{board.name}</b>
        </div>
        <span className="save-status" role="status">
          <Check size={14} />
          {busy ? "Carregando referência…" : status}
        </span>
        {(status === "Erro ao salvar" || conflict) && (
          <button
            className="secondary retry-save"
            onClick={() => {
              if (conflict) {
                reloadFromServer();
              } else {
                save().catch(() => {});
              }
            }}
          >
            {conflict ? "Recarregar versão" : "Tentar salvar"}
          </button>
        )}
        <div className="editor-buttons">
          <ThemePicker appearance={appearance} />
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
            key={canvasKey}
            excalidrawAPI={setApi}
            initialData={initial}
            theme={appearance.theme}
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
                <button
                  disabled={busy > 0}
                  onClick={() => refreshReference(selected)}
                >
                  <RefreshCw size={15} />
                  Atualizar cartão
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
          <section
            className="live-card"
            style={liveRect}
            aria-label="Referência interativa"
          >
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
            {live.kind === "x" || live.kind === "media" || live.media?.length ? (
              <PostMedia
                key={liveId.current || live.url}
                reference={live}
                theme={appearance.theme}
              />
            ) : live.frame ? (
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
              <button className="secondary" onClick={exportFile}>
                Baixar cópia .excalidraw
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
