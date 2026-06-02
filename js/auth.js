// =============================================================================
//  auth.js — Inicio de sesión con Google + verificación de allowlist
// =============================================================================

window.Auth = (function () {
  const cfg = window.APP_CONFIG;

  // Scopes requeridos por la app.
  const SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/calendar.events",
    "openid", "email", "profile",
  ].join(" ");

  const state = {
    user: null,         // { email, name, picture }
    accessToken: null,  // OAuth access token (para Sheets / Calendar)
    expiresAt: 0,       // epoch ms
    tokenClient: null,  // google.accounts.oauth2 TokenClient
    onReady: null,      // callback cuando termina el login exitosamente
  };

  // ----- Decodificación de JWT (ID token) sin librerías externas -----
  function decodeJwt(token) {
    try {
      const payload = token.split(".")[1];
      const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
      return JSON.parse(decodeURIComponent(escape(json)));
    } catch (e) {
      console.error("No se pudo decodificar el ID token", e);
      return null;
    }
  }

  // ----- Verifica si un email está autorizado -----
  function isEmailAllowed(email) {
    if (!email) return false;
    const list = (cfg.allowedEmails || []).map(e => e.trim().toLowerCase());
    return list.includes(email.toLowerCase());
  }

  // ----- Inicialización del botón de Google Sign-In (ID token) -----
  function initSignInButton(onReadyCallback) {
    state.onReady = onReadyCallback;

    // Esperar a que el script de GIS esté cargado.
    function ready() {
      return typeof google !== "undefined" && google.accounts && google.accounts.id;
    }
    if (!ready()) {
      setTimeout(() => initSignInButton(onReadyCallback), 120);
      return;
    }

    if (cfg.googleClientId.startsWith("PEGA-AQUI")) {
      showLoginError(
        "Configuración incompleta: edita js/config.js con tu Google Client ID."
      );
      return;
    }

    google.accounts.id.initialize({
      client_id: cfg.googleClientId,
      callback: handleCredentialResponse,
      auto_select: false,
      cancel_on_tap_outside: false,
    });

    google.accounts.id.renderButton(
      document.getElementById("google-signin-btn"),
      { theme: "outline", size: "large", text: "signin_with", shape: "pill", logo_alignment: "left" }
    );

    // Inicializa el cliente de tokens OAuth (para acceder a Sheets / Calendar).
    state.tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: cfg.googleClientId,
      scope: SCOPES,
      callback: handleTokenResponse,
      error_callback: (err) => {
        console.error("Token error:", err);
        Utils.toast("No se pudo obtener el permiso de Google.", "error");
      },
    });
  }

  // ----- Callback: cuando el usuario inicia sesión y obtenemos su ID token -----
  function handleCredentialResponse(response) {
    if (!response || !response.credential) {
      showLoginError("No se recibió respuesta de Google.");
      return;
    }
    const payload = decodeJwt(response.credential);
    if (!payload) {
      showLoginError("No se pudo verificar la identidad.");
      return;
    }
    if (!isEmailAllowed(payload.email)) {
      showLoginError(
        `La cuenta ${payload.email} no está autorizada para acceder a este planeador.`
      );
      // Cerrar sesión en GIS para evitar auto-select del mismo correo.
      try { google.accounts.id.disableAutoSelect(); } catch (e) {}
      return;
    }

    state.user = {
      email:   payload.email,
      name:    payload.name || payload.email,
      picture: payload.picture || "",
    };

    // Ahora pedimos el access token (Sheets + Calendar).
    state.tokenClient.requestAccessToken({ prompt: "" });
  }

  function handleTokenResponse(tokenResponse) {
    if (!tokenResponse || !tokenResponse.access_token) {
      showLoginError("No se obtuvo el token de acceso a Google APIs.");
      return;
    }
    state.accessToken = tokenResponse.access_token;
    state.expiresAt = Date.now() + (Number(tokenResponse.expires_in || 3600) - 60) * 1000;

    // Persistir mínimamente en sessionStorage (no el token, sólo el email para autoreintento).
    sessionStorage.setItem("planner_user_email", state.user.email);

    if (typeof state.onReady === "function") state.onReady(state.user);
  }

  function showLoginError(msg) {
    const el = document.getElementById("login-error");
    if (el) { el.textContent = msg; el.hidden = false; }
  }

  // ----- Refrescar el access token cuando expire -----
  function ensureFreshToken() {
    return new Promise((resolve, reject) => {
      if (state.accessToken && Date.now() < state.expiresAt) {
        resolve(state.accessToken);
        return;
      }
      if (!state.tokenClient) { reject(new Error("Token client no inicializado")); return; }
      // Reemplazar callback temporalmente.
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
    try { google.accounts.id.disableAutoSelect(); } catch (e) {}
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
