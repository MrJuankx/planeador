# Planeador de Actividades — Talento Humano FNSP

Página privada para el equipo, con autenticación por cuenta Google, datos sincronizados a una hoja de cálculo de Google compartida, y creación automática de eventos con recordatorios en Google Calendar a partir de las fechas límite del planeador.

- 100% estático (sin servidor) → se despliega en **GitHub Pages**.
- Acceso restringido por allowlist de correos Gmail (configurable en `js/config.js`).
- Datos almacenados en un **Google Sheet** compartido con el equipo.
- Recordatorios en **Google Calendar** a **14 días, 7 días, 2 días y 1 día** antes de la fecha límite.

---

## 1. Crear el Google Sheet de datos

1. Abre [Google Sheets](https://sheets.google.com) y crea una hoja nueva, p. ej. `Planeador TH FNSP`.
2. Compártela con cada uno de los correos del equipo que deban tener acceso, dándoles permiso de **Editor**.
3. Copia el **ID de la hoja** desde la URL — es la parte entre `/d/` y `/edit`:
   ```
   https://docs.google.com/spreadsheets/d/AQUÍ-EL-ID/edit
   ```

No necesitas crear pestañas ni columnas manualmente. La aplicación crea su estructura inicial la primera vez que arranca.

---

## 2. Configurar Google Cloud (OAuth + APIs)

1. Entra a [Google Cloud Console](https://console.cloud.google.com/).
2. **Crea un proyecto** (p. ej. `planeador-th-fnsp`).
3. En **APIs y servicios → Biblioteca**, habilita:
   - **Google Sheets API**
   - **Google Calendar API**
4. En **APIs y servicios → Pantalla de consentimiento de OAuth**:
   - Tipo de usuario: **Externo**.
   - Llena nombre de la app, correo de soporte y correo del desarrollador.
   - En **Usuarios de prueba**, añade los correos del equipo (sólo necesario mientras el proyecto esté en modo "Pruebas"; mientras esté así, no requiere verificación de Google).
5. En **APIs y servicios → Credenciales**:
   - **Crear credenciales → ID de cliente de OAuth** → tipo **Aplicación web**.
   - **Orígenes de JavaScript autorizados**: añade la URL donde se hospedará la página (p. ej. `https://tu-usuario.github.io`).
   - Si vas a probar local: añade también `http://localhost:8000` (o el puerto que uses).
   - Guarda y **copia el Client ID** (termina en `.apps.googleusercontent.com`).
   - **Crear credenciales → Clave de API**:
     - Tras crearla, **restringela**: en "Restricciones de la aplicación" elige *Sitios web* y añade tu dominio; en "Restricciones de API" selecciona sólo *Google Sheets API* y *Google Calendar API*.
     - Copia la API Key.

---

## 3. Configurar la aplicación

Edita [`js/config.js`](js/config.js) y reemplaza:

```js
googleClientId: "PEGA-AQUI-TU-CLIENT-ID.apps.googleusercontent.com",
googleApiKey:   "PEGA-AQUI-TU-API-KEY",
spreadsheetId:  "PEGA-AQUI-EL-ID-DEL-SHEET",

allowedEmails: [
  "correo1@gmail.com",
  "correo2@gmail.com",
  // …
],
```

Opcional:
- Cambia los **tabs por defecto** (categorías y colores).
- Cambia los **estados disponibles** del dropdown.
- Cambia los **recordatorios** de Calendar (por defecto: 14d, 7d, 2d, 1d).

---

## 4. Desplegar en GitHub Pages

1. Sube el proyecto a un repositorio GitHub (público o privado).
2. En **Settings → Pages**, elige la rama (`main`) y la carpeta raíz (`/`).
3. Espera ~1 minuto. La URL será `https://<usuario>.github.io/<repo>/`.
4. **Importante:** la URL anterior debe estar entre los **orígenes JavaScript autorizados** del Client ID (paso 2.5). Si la cambias después, vuelve a Google Cloud Console y actualiza esa lista.

> 💡 Si el repositorio es **privado**, GitHub Pages igual sirve la página públicamente; la privacidad real la garantiza la allowlist en `config.js` y los permisos del Google Sheet.

---

## 5. Probar localmente (opcional)

Como es una página estática, basta con servirla por HTTP:

```powershell
# Desde la carpeta del proyecto:
python -m http.server 8000
# Abre http://localhost:8000 en el navegador
```

Asegúrate de haber añadido `http://localhost:8000` en los orígenes autorizados del Client ID.

---

## 6. Uso diario

- **Iniciar sesión** con una cuenta Google de la allowlist.
- Cada **tab** = categoría de actividad. Cambia entre ellas con la barra superior.
- **+ Actividad**: añade una nueva fila.
- **+ Columna**: añade una columna personalizada (texto, fecha, estado o responsable).
- **+ Categoría**: crea una nueva categoría/tab.
- Cuando una actividad tenga **Fecha Límite**, aparece el botón `+ Calendar`. Al pulsarlo se crea un evento en tu Google Calendar con los 4 recordatorios automáticos. El botón pasa a `✓ Recordatorio` para indicar que ya está vinculado.
- Si cambias la fecha más tarde, el evento se actualiza solo. Si borras la fecha, el evento se elimina.

---

## Estructura del repositorio

```
/
├── index.html
├── css/
│   └── styles.css
├── js/
│   ├── config.js     ← edita aquí Client ID, API Key, Sheet ID y allowlist
│   ├── utils.js
│   ├── auth.js
│   ├── sheets.js
│   ├── calendar.js
│   └── app.js
├── README.md
└── .nojekyll
```

---

## Notas técnicas

- La página no usa frameworks: HTML/CSS/JS vanilla. Carga dos scripts externos de Google (`gsi/client` y `apis.google.com/js/api.js`).
- Los datos del usuario nunca pasan por un servidor de terceros: la página habla directamente con Google APIs usando el token OAuth del usuario.
- En cada hoja del workbook hay dos columnas técnicas al final (`_calendar_event_id`, `_row_id`). Son visibles si abres el sheet en Google Sheets, pero no se muestran en la app. **No las renombres ni las borres manualmente.**
- Una pestaña oculta llamada `_meta` guarda los tipos de cada columna. Tampoco la edites a mano.
