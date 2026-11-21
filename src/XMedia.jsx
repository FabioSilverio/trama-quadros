import React, { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getReference } from "./media.js";

export default function PostMedia({ reference, theme }) {
  const [items, setItems] = useState(reference.media || []);
  const [loading, setLoading] = useState(!reference.media?.length);
  const [index, choose] = useState(0);
  const [failed, fail] = useState(false);
  const [showEmbed, setShowEmbed] = useState(false);

  useEffect(() => {
    const initial = reference.media || [];
    setItems(initial);
    setLoading(!initial.length);
    choose(0);
    fail(false);
    setShowEmbed(false);
    if (initial.length) return;
    let active = true;
    getReference(reference.url, reference.title || "")
      .then((ref) => {
        if (active) {
          setItems(ref.media || []);
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) {
          setItems([]);
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [reference.url, reference.title, reference.media]);

  const item = items[index];

  if (loading) {
    return (
      <p className="media-loading" role="status">
        Carregando mídia…
      </p>
    );
  }

  if (showEmbed || !item || failed) {
    return (
      <>
        {failed && (
          <p className="media-fallback" role="status">
            A mídia não carregou. Abrindo o post original.
          </p>
        )}
        {reference.frame ? (
          <>
            <iframe
              title={reference.title}
              src={
                reference.kind === "x"
                  ? reference.frame + "&theme=" + theme
                  : reference.frame
              }
              allow="fullscreen; encrypted-media; picture-in-picture"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
            />
            {showEmbed && item && !failed && (
              <div className="media-pages">
                <button type="button" onClick={() => setShowEmbed(false)}>
                  Voltar à mídia
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="reader">
            <p>Não foi possível reproduzir esta mídia diretamente aqui.</p>
            <a href={reference.url} target="_blank" rel="noreferrer">
              Abrir mídia original ↗
            </a>
          </div>
        )}
      </>
    );
  }

  return (
    <>
      <div className="media-stage">
        {item.type === "video" ? (
          <video
            key={item.url}
            src={item.url}
            poster={item.poster}
            autoPlay
            playsInline
            controls
            preload="metadata"
            onError={() => fail(true)}
            aria-label="Vídeo do post"
          />
        ) : (
          <img
            key={item.url}
            src={item.url}
            alt={item.alt || "Foto do post"}
            referrerPolicy="no-referrer"
            onError={() => fail(true)}
          />
        )}
      </div>
      {(items.length > 1 || reference.frame) && (
        <nav className="media-pages" aria-label="Mídias do post">
          {items.length > 1 && (
            <>
              <button
                type="button"
                disabled={!index}
                aria-label="Mídia anterior"
                onClick={() => {
                  fail(false);
                  choose(index - 1);
                }}
              >
                <ChevronLeft size={18} />
              </button>
              <span>
                {index + 1} de {items.length}
              </span>
              <button
                type="button"
                disabled={index === items.length - 1}
                aria-label="Próxima mídia"
                onClick={() => {
                  fail(false);
                  choose(index + 1);
                }}
              >
                <ChevronRight size={18} />
              </button>
            </>
          )}
          {reference.frame && (
            <button
              type="button"
              className="media-embed-toggle"
              onClick={() => setShowEmbed(true)}
            >
              Ver post
            </button>
          )}
        </nav>
      )}
    </>
  );
}
