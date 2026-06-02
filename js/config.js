// =============================================================================
//  config.js — Edita este archivo con los valores de tu proyecto.
//  No requiere build. Tras editarlo, basta con refrescar la página.
// =============================================================================

window.APP_CONFIG = {
  // --- Google Cloud / OAuth ---
  // OAuth 2.0 Client ID (tipo "Web application") creado en Google Cloud Console.
  // Debe tener registrado el origen donde se hospeda esta app (ej. la URL de GitHub Pages).
  googleClientId: "655297275077-kbc88ks1uhvsh7reefa12q8u0la2n31s.apps.googleusercontent.com",

  // API Key del mismo proyecto en Google Cloud (restringida a Sheets API + Calendar API).
  googleApiKey: "AIzaSyB4DlFSv4Ome_B269g6foqqAY0BR1CUZvI",

  // ID del Google Sheet que actúa como base de datos.
  // En la URL https://docs.google.com/spreadsheets/d/AAAAA/edit  →  AAAAA es el ID.
  spreadsheetId: "1TNLvDVaWmvr_zYeb5t_mvLgjchgAWPadaCKm1o2Zlck",

  // --- Acceso ---
  // Lista de correos Gmail (o de Google Workspace) autorizados.
  // Si un usuario inicia sesión con un correo fuera de esta lista, se le niega el acceso.
  allowedEmails: [
    "jccastano07@gmail.com",
    "contratoscatedrafnsp@udea.edu.co",
    "dchava77@gmail.com",
    "dulfary.chavarriaga@udea.edu.co",
    "talentohumano.fnsp@udea.edu.co"
  ],

  // --- Estructura inicial del planeador ---
  // Cada tab corresponde a una hoja (sheet) dentro del Spreadsheet.
  // Si la hoja no existe, la app la crea automáticamente al primer arranque.
  tabs: [
    { id: "periodicas",     name: "Actividades Periódicas",      color: "#E07A5F" },
    { id: "eventos",        name: "Programación Eventos",        color: "#81B29A" },
    { id: "talento",        name: "Actividades Talento Humano",  color: "#F2CC8F" },
    { id: "documentacion",  name: "Documentación Procesos",      color: "#6D8FB8" },
    { id: "otras",          name: "Otras Actividades",           color: "#9C89B8" },
  ],

  // Columnas por defecto (cuando se crea una hoja nueva).
  // Tipos soportados: text, longtext, date, status, person.
  defaultColumns: [
    { key: "actividad",        name: "Actividad y tareas",  type: "longtext" },
    { key: "fecha_limite",     name: "Fecha Límite",        type: "date" },
    { key: "fecha_realizacion",name: "Fecha de Realización",type: "date" },
    { key: "estado",           name: "Estado",              type: "status" },
    { key: "responsable",      name: "Responsable",         type: "person" },
    { key: "seguimiento",      name: "Seguimiento",         type: "longtext" },
  ],

  // Opciones del dropdown "Estado".
  statusOptions: [
    { value: "",            label: "—",            color: "#E5E7EB" },
    { value: "En espera",   label: "En espera",    color: "#FCD34D" },
    { value: "En proceso",  label: "En proceso",   color: "#60A5FA" },
    { value: "Realizado",   label: "Realizado",    color: "#34D399" },
    { value: "Bloqueado",   label: "Bloqueado",    color: "#F87171" },
    { value: "Cancelado",   label: "Cancelado",    color: "#9CA3AF" },
  ],

  // Sugerencias de personas para autocompletar el campo "Responsable".
  // (No es una restricción — el campo acepta texto libre.)
  personSuggestions: [
    "Dulfary", "Catalina", "Juliana", "Yenifer",
    "David", "Vilma", "Juan Pablo", "Contratistas", "UdeA Sipe",
  ],

  // --- Google Calendar ---
  calendar: {
    // Recordatorios (en minutos antes del evento) que se crearán automáticamente
    // cuando una actividad tenga "Fecha Límite".
    // 14 días = 20160, 7 días = 10080, 2 días = 2880, 1 día = 1440.
    reminderMinutes: [20160, 10080, 2880, 1440],
    // Calendario destino: "primary" = calendario principal del usuario que inicia sesión.
    calendarId: "primary",
    // Hora del evento (formato HH:MM, 24h). El planeador usa fechas sin hora,
    // así que se crea el evento a esta hora local como recordatorio.
    eventTime: "09:00",
    // Duración del evento en minutos (sólo para que ocupe un slot visible).
    eventDurationMinutes: 30,
  },
};
