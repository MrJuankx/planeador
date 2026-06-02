// =============================================================================
//  calendar.js — Crear/actualizar/eliminar eventos en Google Calendar
//                con recordatorios automáticos (14d, 7d, 2d, 1d antes).
// =============================================================================

window.Calendar = (function () {
  const cfg = window.APP_CONFIG;
  const BASE = "https://www.googleapis.com/calendar/v3";

  async function api(path, options = {}) {
    const token = await Auth.ensureFreshToken();
    const url = path.startsWith("http") ? path : `${BASE}${path}`;
    const headers = Object.assign(
      { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
      options.headers || {}
    );
    const res = await fetch(url, Object.assign({}, options, { headers }));
    if (!res.ok) {
      let detail = "";
      try { detail = (await res.json()).error?.message || ""; } catch (e) {}
      throw new Error(`Calendar API ${res.status}: ${detail || res.statusText}`);
    }
    if (res.status === 204) return null;
    return res.json();
  }

  // Construye start/end (con hora local) a partir de una fecha ISO (YYYY-MM-DD).
  function buildDateTimes(isoDate) {
    const [h, m] = (cfg.calendar.eventTime || "09:00").split(":").map(Number);
    const start = new Date(isoDate + "T00:00:00");
    start.setHours(h, m, 0, 0);
    const end = new Date(start.getTime() + (cfg.calendar.eventDurationMinutes || 30) * 60 * 1000);
    // Devolvemos como ISO con timezone offset del navegador.
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return {
      start: { dateTime: toLocalISO(start), timeZone: tz },
      end:   { dateTime: toLocalISO(end),   timeZone: tz },
    };
  }

  function toLocalISO(d) {
    const pad = n => String(n).padStart(2, "0");
    const off = -d.getTimezoneOffset();
    const sign = off >= 0 ? "+" : "-";
    const abs = Math.abs(off);
    return (
      `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}` +
      `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` +
      `${sign}${pad(Math.floor(abs/60))}:${pad(abs%60)}`
    );
  }

  function buildEventBody({ title, description, isoDate }) {
    const dt = buildDateTimes(isoDate);
    return {
      summary: title,
      description: description || "",
      start: dt.start,
      end: dt.end,
      reminders: {
        useDefault: false,
        overrides: (cfg.calendar.reminderMinutes || []).map(m => ({ method: "popup", minutes: m })),
      },
    };
  }

  // Crea un evento. Devuelve el ID del evento creado.
  async function createEvent({ title, description, isoDate }) {
    const calId = encodeURIComponent(cfg.calendar.calendarId || "primary");
    const body = buildEventBody({ title, description, isoDate });
    const res = await api(`/calendars/${calId}/events`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    return res.id;
  }

  async function updateEvent(eventId, { title, description, isoDate }) {
    const calId = encodeURIComponent(cfg.calendar.calendarId || "primary");
    const body = buildEventBody({ title, description, isoDate });
    const res = await api(`/calendars/${calId}/events/${encodeURIComponent(eventId)}`, {
      method: "PUT",
      body: JSON.stringify(body),
    });
    return res.id;
  }

  async function deleteEvent(eventId) {
    if (!eventId) return;
    const calId = encodeURIComponent(cfg.calendar.calendarId || "primary");
    try {
      await api(`/calendars/${calId}/events/${encodeURIComponent(eventId)}`, { method: "DELETE" });
    } catch (e) {
      // Si el evento ya no existe en Calendar, ignoramos el error.
      if (!String(e.message).includes("410") && !String(e.message).includes("404")) throw e;
    }
  }

  // Helper de alto nivel: crea o actualiza según haya o no eventId.
  async function createOrUpdate({ eventId, title, description, isoDate }) {
    if (!isoDate) {
      // Si se borra la fecha pero hay evento previo, lo eliminamos.
      if (eventId) await deleteEvent(eventId);
      return null;
    }
    if (eventId) {
      try { return await updateEvent(eventId, { title, description, isoDate }); }
      catch (e) {
        // Si el evento se borró desde Calendar, creamos uno nuevo.
        console.warn("updateEvent falló, creando uno nuevo:", e.message);
      }
    }
    return createEvent({ title, description, isoDate });
  }

  return { createEvent, updateEvent, deleteEvent, createOrUpdate };
})();
