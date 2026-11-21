import React, { useEffect, useRef, useId } from "react";
import { X } from "lucide-react";
export function Dialog({ title, close, children }) {
  const ref = useRef(null);
  const heading = useId();
  useEffect(() => {
    const d = ref.current;
    d.showModal();
    return () => d.close();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={heading}
      className="dialog"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClick={(e) => {
        if (e.target === ref.current) {
          const r = ref.current.getBoundingClientRect();
          if (
            e.clientX < r.left ||
            e.clientX > r.right ||
            e.clientY < r.top ||
            e.clientY > r.bottom
          )
            close();
        }
      }}
    >
      <header>
        <h2 id={heading}>{title}</h2>
        <button aria-label="Fechar" className="icon" onClick={close}>
          <X size={19} />
        </button>
      </header>
      {children}
    </dialog>
  );
}
export function Brand() {
  return (
    <div className="brand">
      <img src="/trama.svg" alt="" />
      <strong>trama</strong>
    </div>
  );
}
