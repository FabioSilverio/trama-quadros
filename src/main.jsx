import React, { lazy, Suspense, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Layers3,
  LayoutGrid,
  Star,
  Plus,
  Folder,
  ChevronRight,
  PanelLeft,
  Search,
  Grid2X2,
  List,
  ArrowDownWideNarrow,
  Link2,
  Ellipsis,
  HelpCircle,
  ArrowUpRight,
  SquarePen,
  Trash2,
  Copy,
  Clock3,
  X,
  Check,
  Menu,
} from "lucide-react";
import "@fontsource-variable/dm-sans/wght.css";
import "./style.css";
import {
  initialize,
  list,
  put,
  patchBoard,
  deleteBoard,
  getScene,
  saveScene,
  palette,
} from "./storage.js";
import { Art, coverColors } from "./art.jsx";
import { Dialog, Brand } from "./ui.jsx";
import { parseLink } from "./links.js";
const Editor = lazy(() => import("./Editor.jsx"));
const boardHash = () =>
  location.hash.startsWith("#quadro/")
    ? decodeURIComponent(location.hash.slice(8))
    : "";
function App() {
  const [projects, setProjects] = useState([]),
    [boards, setBoards] = useState([]),
    [ready, setReady] = useState(false),
    [error, setError] = useState(""),
    [open, setOpen] = useState(boardHash),
    [filter, filterBy] = useState("all"),
    [query, search] = useState(""),
    [grid, setGrid] = useState(true),
    [sort, setSort] = useState("recent"),
    [modal, dialog] = useState(null),
    [mobile, drawer] = useState(false),
    [menu, actions] = useState("");
  const find = useRef(null);
  async function refresh() {
    const [p, b] = await list();
    setProjects(p);
    setBoards(b);
  }
  useEffect(() => {
    initialize()
      .then(refresh)
      .then(() => setReady(true))
      .catch(() =>
        setError("Não foi possível abrir o armazenamento deste navegador."),
      );
    const change = () => {
      setOpen(boardHash());
      refresh().catch(() => setError("Falha ao ler os quadros."));
    };
    window.addEventListener("hashchange", change);
    window.addEventListener("focus", change);
    return () => {
      window.removeEventListener("hashchange", change);
      window.removeEventListener("focus", change);
    };
  }, []);
  useEffect(() => {
    function key(e) {
      if (e.key === "Escape") {
        actions("");
        drawer(false);
      }
      if (
        e.key === "/" &&
        !open &&
        !modal &&
        !["INPUT", "TEXTAREA"].includes(e.target.tagName)
      ) {
        e.preventDefault();
        find.current?.focus();
      }
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [open, modal]);
  const activeProject = projects.find((p) => p.id === filter),
    selected = boards.find((b) => b.id === open);
  function nav(v) {
    filterBy(v);
    search("");
    actions("");
    drawer(false);
  }
  function go(id) {
    location.hash = "quadro/" + encodeURIComponent(id);
  }
  function start(link = "", requireLink = false) {
    dialog({
      type: "board",
      name: "",
      project: activeProject?.id || projects[0]?.id || "",
      link,
      requireLink,
    });
    drawer(false);
  }
  async function submit(e) {
    e.preventDefault();
    const m = modal;
    const name = m.name?.trim();
    if (m.link?.trim() && !parseLink(m.link)) {
      dialog({
        ...m,
        error: "Cole um endereço completo começando com https://.",
      });
      return;
    }
    try {
      if (m.type === "project") {
        const id = crypto.randomUUID();
        await put("projects", { id, name, color: m.color });
        await refresh();
        nav(id);
        dialog(null);
        return;
      }
      if (m.type === "rename") {
        await patchBoard(m.id, { name, project: m.project });
        await refresh();
        dialog(null);
        return;
      }
      if (m.type === "delete") {
        await deleteBoard(m.id);
        await refresh();
        dialog(null);
        return;
      }
      const id = crypto.randomUUID();
      await put("boards", {
        id,
        name: name || "Quadro sem título",
        project: m.project,
        cover: null,
        updated: Date.now(),
        favorite: false,
        initialLink: m.link?.trim() || null,
      });
      await refresh();
      dialog(null);
      go(id);
    } catch {
      dialog({
        ...m,
        error: "Falha ao salvar. Confira o espaço disponível no navegador.",
      });
    }
  }
  async function duplicate(b) {
    const id = crypto.randomUUID();
    await put("boards", {
      ...b,
      id,
      name: b.name + " (cópia)",
      updated: Date.now(),
    });
    const scene = await getScene(b.id);
    if (scene) await saveScene(id, scene);
    await refresh();
    actions("");
  }
  const filtered = boards
    .filter(
      (b) =>
        (filter === "all" ||
          (filter === "fav" && b.favorite) ||
          filter === b.project) &&
        b.name
          .toLocaleLowerCase("pt-BR")
          .includes(query.toLocaleLowerCase("pt-BR")),
    )
    .sort((a, b) =>
      sort === "name"
        ? a.name.localeCompare(b.name, "pt-BR")
        : b.updated - a.updated,
    );
  if (error)
    return (
      <p role="alert" className="loading">
        {error}
      </p>
    );
  if (!ready)
    return (
      <div className="loading">
        <Brand />
        Abrindo sua área de trabalho…
      </div>
    );
  if (selected)
    return (
      <Suspense
        fallback={
          <div className="loading">
            <Brand />
            Abrindo o editor…
          </div>
        }
      >
        <Editor
          key={selected.id}
          board={selected}
          project={projects.find((p) => p.id === selected.project)}
          leave={() => {
            location.hash = "";
            refresh();
          }}
        />
      </Suspense>
    );
  return (
    <div
      className="workspace"
      onPaste={(e) => {
        if (modal || ["INPUT", "TEXTAREA"].includes(e.target.tagName)) return;
        const raw = e.clipboardData.getData("text/plain").trim();
        if (parseLink(raw)) {
          e.preventDefault();
          start(raw, true);
        }
      }}
      onClick={() => {
        if (menu) actions("");
      }}
    >
      {mobile && (
        <button
          className="scrim"
          aria-label="Fechar navegação"
          onClick={() => drawer(false)}
        />
      )}
      <aside className={"sidebar " + (mobile ? "visible" : "")}>
        <Brand />
        <div className="side-main">
          <div className="side-label">Biblioteca</div>
          <button
            className={"nav " + (filter === "all" ? "active" : "")}
            onClick={() => nav("all")}
          >
            <LayoutGrid />
            Todos os quadros<span>{boards.length}</span>
          </button>
          <button
            className={"nav " + (filter === "fav" ? "active" : "")}
            onClick={() => nav("fav")}
          >
            <Star />
            Favoritos
          </button>
          <div className="side-label project-label">
            Projetos
            <button
              className="icon"
              aria-label="Novo projeto"
              onClick={() =>
                dialog({
                  type: "project",
                  name: "",
                  color: palette[projects.length % palette.length],
                })
              }
            >
              <Plus size={16} />
            </button>
          </div>
          {projects.map((p) => (
            <button
              key={p.id}
              className={"nav " + (filter === p.id ? "active" : "")}
              onClick={() => nav(p.id)}
            >
              <Folder style={{ color: p.color }} />
              {p.name}
            </button>
          ))}
        </div>
        <div className="side-foot">
          <div className="profile">
            <Layers3 size={21} />
          </div>
          <div>
            <b>Espaço pessoal</b>
            <small>Neste navegador</small>
          </div>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <button
            className="icon hamburger"
            aria-label="Abrir navegação"
            onClick={() => drawer(true)}
          >
            <Menu />
          </button>
          <span className="crumb">
            <PanelLeft size={16} /> Workspace
          </span>
          <ChevronRight size={14} />
          <b>
            {activeProject?.name ||
              (filter === "fav" ? "Favoritos" : "Visão geral")}
          </b>
          <button
            className="icon help"
            title="Como usar"
            aria-label="Como usar"
            onClick={() => dialog({ type: "help" })}
          >
            <HelpCircle size={19} />
          </button>
        </header>
        <main
          className="dashboard"
          onDragOver={(e) => {
            if (
              [...e.dataTransfer.types].some((t) =>
                ["text/uri-list", "text/plain"].includes(t),
              )
            )
              e.preventDefault();
          }}
          onDrop={(e) => {
            const u =
              e.dataTransfer
                .getData("text/uri-list")
                .split(/\r?\n/)
                .find((v) => v && !v.startsWith("#")) ||
              e.dataTransfer.getData("text/plain");
            if (parseLink(u)) {
              e.preventDefault();
              start(u, true);
            }
          }}
        >
          <section className="hero">
            <div className="hero-copy">
              <div className="eyebrow">
                <span className="statusdot" />{" "}
                {activeProject ? "PROJETO" : projects.length + " PROJETOS"}
              </div>
              <h1>
                {activeProject?.name ||
                  (filter === "fav" ? "Favoritos" : "Área de trabalho")}
              </h1>
              <p>
                {activeProject
                  ? "Os quadros e as referências deste projeto."
                  : filter === "fav"
                    ? "Os quadros que você marcou para voltar depois."
                    : "Um espaço livre para desenhar, reunir referências e conectar ideias."}
              </p>
              <div className="hero-actions">
                <button className="primary" onClick={() => start()}>
                  <Plus size={17} />
                  Novo quadro
                </button>
                <button className="secondary" onClick={() => start("", true)}>
                  <Link2 size={16} />
                  Inserir link
                </button>
              </div>
            </div>
            <Art type="hero" />
          </section>
          <section className="collection">
            <div className="section-heading">
              <div className="section-title">
                <h2>
                  {activeProject
                    ? "Quadros do projeto"
                    : filter === "fav"
                      ? "Quadros favoritos"
                      : "Meus quadros"}
                </h2>
                <span className="count">{filtered.length}</span>
              </div>
              <div className="tools">
                <label className="search">
                  <Search size={16} />
                  <input
                    ref={find}
                    aria-label="Buscar quadros"
                    value={query}
                    onChange={(e) => search(e.target.value)}
                    placeholder="Buscar quadros…"
                  />
                  {query ? (
                    <button
                      className="icon"
                      aria-label="Limpar busca"
                      onClick={() => search("")}
                    >
                      <X size={13} />
                    </button>
                  ) : (
                    <kbd>/</kbd>
                  )}
                </label>
                <label className="sort" title="Ordenar quadros">
                  <ArrowDownWideNarrow size={17} />
                  <select
                    aria-label="Ordenar quadros"
                    value={sort}
                    onChange={(e) => setSort(e.target.value)}
                  >
                    <option value="recent">Recentes</option>
                    <option value="name">Nome</option>
                  </select>
                </label>
                <div className="view">
                  <button
                    aria-label="Grade"
                    aria-pressed={grid}
                    className={grid ? "current" : ""}
                    onClick={() => setGrid(true)}
                  >
                    <Grid2X2 />
                  </button>
                  <button
                    aria-label="Lista"
                    aria-pressed={!grid}
                    className={!grid ? "current" : ""}
                    onClick={() => setGrid(false)}
                  >
                    <List />
                  </button>
                </div>
              </div>
            </div>
            <div className={"cards " + (grid ? "" : "list")}>
              {filtered.map((b) => {
                const p = projects.find((p) => p.id === b.project);
                return (
                  <article className="card" key={b.id}>
                    <button
                      className="open-card"
                      onClick={() => go(b.id)}
                      aria-label={"Abrir " + b.name}
                    >
                      <div
                        className="cover"
                        style={{
                          backgroundColor:
                            coverColors[b.cover] || coverColors.blank,
                        }}
                      >
                        {b.preview ? (
                          <img src={b.preview} alt="" />
                        ) : b.cover ? (
                          <Art type={b.cover} />
                        ) : (
                          <Layers3 size={34} strokeWidth={1.3} />
                        )}
                      </div>
                      <div className="card-info">
                        <small>
                          <i style={{ background: p?.color }} />
                          {p?.name || "Sem projeto"}
                        </small>
                        <h3>{b.name}</h3>
                        <span className="date">
                          <Clock3 size={13} />
                          {new Date(b.updated).toDateString() ===
                          new Date().toDateString()
                            ? "Editado hoje"
                            : "Editado em " +
                              new Date(b.updated).toLocaleDateString("pt-BR")}
                        </span>
                      </div>
                    </button>
                    <button
                      className={"star " + (b.favorite ? "marked" : "")}
                      aria-label={
                        (b.favorite ? "Desfavoritar " : "Favoritar ") + b.name
                      }
                      onClick={async () => {
                        await patchBoard(b.id, { favorite: !b.favorite });
                        await refresh();
                      }}
                    >
                      <Star
                        size={16}
                        fill={b.favorite ? "currentColor" : "none"}
                      />
                    </button>
                    <button
                      className="more icon"
                      aria-label={"Opções de " + b.name}
                      onClick={(e) => {
                        e.stopPropagation();
                        actions(menu === b.id ? "" : b.id);
                      }}
                    >
                      <Ellipsis size={18} />
                    </button>
                    {menu === b.id && (
                      <div className="context">
                        <button
                          onClick={() => dialog({ type: "rename", ...b })}
                        >
                          <SquarePen />
                          Editar detalhes
                        </button>
                        <button onClick={() => duplicate(b)}>
                          <Copy />
                          Duplicar
                        </button>
                        <button
                          onClick={() =>
                            dialog({ type: "delete", id: b.id, name: b.name })
                          }
                        >
                          <Trash2 />
                          Excluir
                        </button>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
            {!filtered.length && (
              <div className="empty">
                <LayoutGrid />
                <h3>
                  {query
                    ? "Nenhum quadro encontrado"
                    : "Nenhum quadro por aqui"}
                </h3>
                <p>
                  {query
                    ? "Tente buscar por outro nome."
                    : filter === "fav"
                      ? "Marque a estrela de um quadro para encontrá-lo aqui."
                      : "Crie um quadro para começar este projeto."}
                </p>
              </div>
            )}
          </section>
          <div className="tip">
            <span className="tip-icon">
              <Link2 size={20} />
            </span>
            <div>
              <b>Comece com uma referência</b>
              <p>Arraste um link para cá ou cole direto em um quadro.</p>
            </div>
            <button className="text-btn" onClick={() => start("", true)}>
              Inserir link <ArrowUpRight size={16} />
            </button>
          </div>
        </main>
      </div>
      {modal && (
        <Dialog
          title={
            {
              project: "Novo projeto",
              board: modal.requireLink
                ? "Criar quadro com link"
                : "Novo quadro",
              rename: "Editar quadro",
              delete: "Excluir quadro?",
              help: "Como usar a Trama",
            }[modal.type]
          }
          close={() => dialog(null)}
        >
          {modal.type === "help" ? (
            <div className="guide">
              <p>
                Crie um projeto no menu lateral e abra um quadro. Cole ou solte
                um link para criar uma referência que você pode mover, anotar e
                conectar com setas.
              </p>
              <p>
                Selecione uma referência para abrir a mídia ou adicionar uma
                legenda. Em <b>Ajustes</b>, escolha a suavização do mouse e
                insira texto com fontes próprias.
              </p>
              <p>
                Seus quadros ficam neste navegador. Use o menu do editor para
                exportar uma cópia em .excalidraw e abrir em outro dispositivo.
              </p>
            </div>
          ) : (
            <form onSubmit={submit}>
              {modal.type === "delete" ? (
                <p>
                  Excluir “{modal.name}” deste navegador? Essa ação é
                  permanente.
                </p>
              ) : (
                <>
                  <label>
                    Nome {modal.type === "project" ? "do projeto" : "do quadro"}
                    <input
                      autoFocus
                      maxLength={90}
                      required={modal.type !== "board"}
                      placeholder={
                        modal.type === "project"
                          ? "Ex.: Pesquisa de campo"
                          : "Ex.: Referências para o vídeo"
                      }
                      value={modal.name}
                      onChange={(e) =>
                        dialog({ ...modal, name: e.target.value })
                      }
                    />
                  </label>
                  {modal.type === "project" ? (
                    <fieldset>
                      <legend>Cor da pasta</legend>
                      <div className="swatches">
                        {palette.map((c) => (
                          <button
                            type="button"
                            key={c}
                            aria-label={"Cor " + c}
                            aria-pressed={modal.color === c}
                            style={{ background: c }}
                            onClick={() => dialog({ ...modal, color: c })}
                          >
                            {modal.color === c && <Check size={16} />}
                          </button>
                        ))}
                      </div>
                    </fieldset>
                  ) : (
                    <label>
                      Projeto
                      <select
                        value={modal.project}
                        onChange={(e) =>
                          dialog({ ...modal, project: e.target.value })
                        }
                      >
                        {projects.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {modal.type === "board" && (
                    <label>
                      Link {modal.requireLink ? "" : "(opcional)"}
                      <input
                        type="url"
                        placeholder="https://…"
                        value={modal.link}
                        required={modal.requireLink}
                        onChange={(e) =>
                          dialog({ ...modal, link: e.target.value })
                        }
                      />
                    </label>
                  )}
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
                  {
                    {
                      project: "Criar projeto",
                      board: "Criar quadro",
                      rename: "Salvar",
                      delete: "Excluir quadro",
                    }[modal.type]
                  }
                </button>
              </footer>
            </form>
          )}
        </Dialog>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")).render(<App />);
