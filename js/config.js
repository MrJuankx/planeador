window.APP_CONFIG = {
  googleClientId: "655297275077-kbc88ks1uhvsh7reefa12q8u0la2n31s.apps.googleusercontent.com",
  googleApiKey:   "AIzaSyB4DlFSv4Ome_B269g6foqqAY0BR1CUZvI",
  spreadsheetId:  "1TNLvDVaWmvr_zYeb5t_mvLgjchgAWPadaCKm1o2Zlck",

  allowedEmails: [
    "jccastano07@gmail.com",
    "contratoscatedrafnsp@udea.edu.co",
    "dchava77@gmail.com",
    "dulfary.chavarriaga@udea.edu.co",
    "talentohumano.fnsp@udea.edu.co",
  ],

  tabs: [
    { id: "periodicas",     name: "Actividades Periódicas",      color: "#E07A5F" },
    { id: "eventos",        name: "Programación Eventos",        color: "#81B29A" },
    { id: "talento",        name: "Actividades Talento Humano",  color: "#F2CC8F" },
    { id: "documentacion",  name: "Documentación Procesos",      color: "#6D8FB8" },
    { id: "otras",          name: "Otras Actividades",           color: "#9C89B8" },
  ],

  defaultColumns: [
    { key: "actividad",         name: "Actividad y tareas",   type: "longtext" },
    { key: "fecha_limite",      name: "Fecha Límite",         type: "date" },
    { key: "fecha_realizacion", name: "Fecha de Realización", type: "date" },
    { key: "estado",            name: "Estado",               type: "status" },
    { key: "responsable",       name: "Responsable",          type: "person" },
    { key: "seguimiento",       name: "Seguimiento",          type: "longtext" },
  ],

  statusOptions: [
    { value: "",           label: "—",           color: "#E5E7EB" },
    { value: "En espera",  label: "En espera",   color: "#FCD34D" },
    { value: "En proceso", label: "En proceso",  color: "#60A5FA" },
    { value: "Realizado",  label: "Realizado",   color: "#34D399" },
    { value: "Bloqueado",  label: "Bloqueado",   color: "#F87171" },
    { value: "Cancelado",  label: "Cancelado",   color: "#9CA3AF" },
  ],

  personSuggestions: [
    "Dulfary", "Catalina", "Juliana", "Yenifer",
    "David", "Vilma", "Juan Pablo", "Contratistas", "UdeA Sipe",
  ],

  calendar: {
    reminderMinutes: [20160, 10080, 2880, 1440],
    calendarId: "primary",
    eventTime: "09:00",
    eventDurationMinutes: 30,
  },
};
