import React, { useId, useState } from "react";
import { Cloud, Eye, EyeOff, Lock, Mail, User } from "lucide-react";
import { Brand } from "./ui.jsx";
import { ThemePicker } from "./theme.jsx";
import { loginAccount, registerAccount } from "./cloud.js";

export default function Auth({ appearance, localBoardsCount = 0, onSuccess }) {
  const passId = useId();
  const [mode, setMode] = useState("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (mode === "register") {
        const { user } = await registerAccount({
          name: name.trim(),
          email: email.trim(),
          password,
          skipStarters: localBoardsCount > 0,
        });
        await onSuccess(user, true);
      } else {
        const { user } = await loginAccount({
          email: email.trim(),
          password,
        });
        await onSuccess(user, false);
      }
    } catch (err) {
      setError(err.message || "Não foi possível continuar. Tente novamente.");
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-top">
        <ThemePicker appearance={appearance} />
      </div>
      <main className="auth-shell">
        <div className="auth-card">
          <div className="auth-head">
            <Brand />
            <h1>
              {mode === "login"
                ? "Acesse seus quadros"
                : "Crie sua conta"}
            </h1>
            <p>
              Sincronize projetos, referências e anotações entre computador,
              celular e tablet.
            </p>
          </div>
          <div className="auth-tabs" role="tablist" aria-label="Autenticação">
            <button
              type="button"
              role="tab"
              aria-selected={mode === "login"}
              className={mode === "login" ? "active" : ""}
              onClick={() => {
                setMode("login");
                setError("");
              }}
            >
              Entrar
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "register"}
              className={mode === "register" ? "active" : ""}
              onClick={() => {
                setMode("register");
                setError("");
              }}
            >
              Criar conta
            </button>
          </div>
          {localBoardsCount > 0 && (
            <div className="auth-notice" role="status">
              <Cloud size={16} />
              <span>
                Encontramos {localBoardsCount}{" "}
                {localBoardsCount === 1
                  ? "quadro salvo"
                  : "quadros salvos"}{" "}
                neste navegador. Eles serão enviados para sua conta ao entrar.
              </span>
            </div>
          )}
          <form className="auth-form" onSubmit={submit}>
            {mode === "register" && (
              <label>
                Nome
                <span className="auth-input">
                  <User size={16} />
                  <input
                    type="text"
                    name="name"
                    autoComplete="name"
                    maxLength={90}
                    placeholder="Como prefere ser chamado"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </span>
              </label>
            )}
            <label>
              E-mail
              <span className="auth-input">
                <Mail size={16} />
                <input
                  type="email"
                  name="email"
                  autoComplete="email"
                  required
                  maxLength={254}
                  placeholder="voce@exemplo.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </span>
            </label>
            <div className="auth-field">
              <label htmlFor={passId}>Senha</label>
              <div className="auth-input">
                <Lock size={16} />
                <input
                  id={passId}
                  type={showPass ? "text" : "password"}
                  name="password"
                  autoComplete={
                    mode === "register" ? "new-password" : "current-password"
                  }
                  required
                  minLength={6}
                  maxLength={128}
                  placeholder={
                    mode === "register" ? "Mínimo de 6 caracteres" : "Sua senha"
                  }
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  className="icon auth-eye"
                  aria-label={showPass ? "Ocultar senha" : "Mostrar senha"}
                  onClick={() => setShowPass((v) => !v)}
                >
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            {error && (
              <p className="auth-error" role="alert">
                {error}
              </p>
            )}
            <button className="primary auth-submit" disabled={busy}>
              {busy
                ? mode === "login"
                  ? "Entrando…"
                  : "Criando conta…"
                : mode === "login"
                  ? "Entrar"
                  : "Criar conta e entrar"}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
