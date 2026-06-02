// =============================================================================
//  auth.js — Login con Google + verificación de allowlist
//
//  Estrategia: un único popup. El TokenClient de Google Identity Services
//  pide login (si hace falta) y consentimiento de scopes en una sola ventana.
//  El email del usuario se obtiene luego con el access token desde el endpoint
//  userinfo, evitando el doble-popup que rompía la app en GitHub Pages.
// =============================================================================

window.Auth = (function () {
  const cfg = window.APP_CONFIG;

  const SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/calendar.events",
    "openid", "email", "profile",
  ].join(" ");

  const state = {
    user: null,         // { email, name, picture }
    accessToken: null,
    expiresAt: 0,
    tokenClient: null,
    onReady: null,
  };

  // ============================== Init ==============================

  function initSignInButton(onReadyCallback) {
    state.onReady = onReadyCallback;

    if (!window.google?.accounts?.oauth2) {
      // GIS aún no cargó: reintentar
      setTimeout(() => initSignInButton(onReadyCallback), 120);
      return;
    }

    if (cfg.googleClientId.startsWith("PEGA-AQUI")) {
      showLoginError(
        "Configuración incompleta: edita js/config.js con tu Google Client ID."
      );
      return;
    }

    state.tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: cfg.googleClientId,
      scope: SCOPES,
      callback: handleTokenResponse,
      error_callback: (err) => {
        console.error("Token error:", err);
        if (err.type === "popup_closed") {
          showLoginError("Cerraste la ventana antes de completar el inicio de sesión.");
        } else if (err.type === "popup_failed_to_open") {
          showLoginError("El navegador bloqueó la ventana de Google. Permite popups para este sitio.");
        } else {
          showLoginError("No se pudo completar el inicio de sesión: " + (err.message || err.type || "error desconocido"));
        }
      },
    });

    renderCustomButton();
  }

  // Botón custom con branding Google (un único clic dispara todo el flujo).
  function renderCustomButton() {
    const container = document.getElementById("google-signin-btn");
    container.innerHTML = "";
    const btn = document.createElement("button");
    btn.className = "gsi-btn";
    btn.type = "button";
    btn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
        <path fill="#4285F4" d="M17.64 9.2c0-.63-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92a8.78 8.78 0 0 0 2.68-6.62z"/>
        <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.32A9 9 0 0 0 9 18z"/>
        <path fill="#FBBC05" d="M3.97 10.72A5.41 5.41 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.96H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.04l3.01-2.32z"/>
        <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 9 0 9 9 0 0 0 .96 4.96l3.01 2.32C4.68 5.16 6.66 3.58 9 3.58z"/>
      </svg>
      <span>Iniciar sesión con Google</span>
    `;
    btn.addEventListener("click", () => {
      hideLoginError();
      state.tokenClient.requestAccessToken({ prompt: "" });
    });
    container.appendChild(btn);
  }

  // ============================== Token callback ==============================

  async function handleTokenResponse(tokenResponse) {
    if (!tokenResponse?.access_token) {
      showLoginError("No se obtuvo el token de acceso de Google.");
      return;
    }
    state.accessToken = tokenResponse.access_token;
    state.expiresAt = Date.now() + (Number(tokenResponse.expires_in || 3600) - 60) * 1000;

    try {
      const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: { Authorization: `Bearer ${state.accessToken}` },
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const info = await res.json();

      if (!isEmailAllowed(info.email)) {
        showLoginError(
          `La cuenta ${info.email} no está autorizada para acceder a este planeador.`
        );
        // Revocar el token para limpiar la sesión.
        try { google.accounts.oauth2.revoke(state.accessToken, () => {}); } catch (e) {}
        state.accessToken = null;
        state.expiresAt = 0;
        return;
      }

      state.user = {
        email:   info.email,
        name:    info.name || info.email,
        picture: info.picture || "",
      };
      sessionStorage.setItem("planner_user_email", state.user.email);

      if (typeof state.onReady === "function") state.onReady(state.user);
    } catch (e) {
      console.error("userinfo error", e);
      showLoginError("No se pudo verificar la identidad del usuario.");
    }
  }

  // ============================== Helpers ==============================

  function isEmailAllowed(email) {
    if (!email) return false;
    const list = (cfg.allowedEmails || []).map(e => e.trim().toLowerCase());
    return list.includes(email.toLowerCase());
  }

  function showLoginError(msg) {
    const el = document.getElementById("login-error");
    if (el) { el.textContent = msg; el.hidden = false; }
  }
  function hideLoginError() {
    const el = document.getElementById("login-error");
    if (el) { el.hidden = true; el.textContent = ""; }
  }

  // Refrescar token cuando esté por expirar (silencioso si la cookie de Google sigue válida).
  function ensureFreshToken() {
    return new Promise((resolve, reject) => {
      if (state.accessToken && Date.now() < state.expiresAt) {
        resolve(state.accessToken);
        return;
      }
      if (!state.tokenClient) { reject(new Error("Token client no inicializado")); return; }
      const prev = state.tokenClient.callback;
      state.tokenClient.callback = (resp) => {
        state.tokenClient.callback = prev;
        if (!resp || !resp.access_token) { reject(new Error("No se pudo refrescar el token")); return; }
        state.accessToken = resp.access_token;
        state.expiresAt = Date.now() + (Number(resp.expires_in || 3600) - 60) * 1000;
        resolve(state.accessToken);
      };
      state.tokenClient.requestAccessToken({ prompt: "" });
    });
  }

  function getToken() { return state.accessToken; }
  function getUser()  { return state.user; }

  function signOut() {
    try {
      if (state.accessToken) google.accounts.oauth2.revoke(state.accessToken, () => {});
    } catch (e) {}
    state.user = null;
    state.accessToken = null;
    state.expiresAt = 0;
    sessionStorage.removeItem("planner_user_email");
    location.reload();
  }

  return { initSignInButton, ensureFreshToken, getToken, getUser, signOut };
})();
