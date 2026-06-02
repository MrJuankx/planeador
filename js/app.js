// =============================================================================
//  app.js — Lógica principal de la UI
// =============================================================================

(function () {
  const cfg = window.APP_CONFIG;
  const { $, $$, el, debounce, toISODate, toast, setSync, uid } = Utils;

  const state = {
    currentTabTitle: null,   // Hoja activa en el UI (== sheet title)
    rowsBuffer: {},          // Cambios pendientes por debounce: { rowId: { col: val } }
  };

  // ============================== Init ==============================

  function start() {
    // Mostrar login y conectar callback de éxito.
    Auth.initSignInButton(onLoginSuccess);

    // Botones globales
    $("#logout-btn").addEventListener("click", () => Auth.signOut());
    $("#add-tab-btn").addEventListener("click", openAddTab);
    $("#add-column-btn").addEventListener("click", openAddColumn);
    $("#add-row-btn").addEventListener("click", onAddRow);
  }

  async function onLoginSuccess(user) {
    // Mostrar info de usuario
    $("#user-name").textContent = user.name;
    if (user.picture) $("#user-avatar").src = user.picture;
    $("#login-screen").hidden = true;
    $("#app-screen").hidden = false;

    setSync("syncing");
    try {
      await Sheets.bootstrap();
      renderTabs();
      // Seleccionar primer tab disponible
      const first = pickInitialTab();
      if (first) await selectTab(first);
      setSync("idle");
    } catch (e) {
      console.error(e);
      setSync("error");
      toast("Error al cargar el planeador: " + e.message, "error");
    }
  }

  function pickInitialTab() {
    // Preferir el orden definido en config; si no hay, la primera con schema.
    const titles = Object.keys(Sheets.cache.sheetsByTitle).filter(
      t => !t.startsWith("_") && Sheets.getSchema(t).length > 0
    );
    for (const tab of cfg.tabs) if (titles.includes(tab.name)) return tab.name;
    return titles[0];
  }

  // ============================== Tabs ==============================

  function tabColor(title) {
    const sheet = Sheets.cache.sheetsByTitle[title];
    if (sheet?.tabColorHex) return sheet.tabColorHex;
    const t = cfg.tabs.find(t => t.name === title);
    return t ? t.color : "#6D8FB8";
  }

  function renderTabs() {
    const bar = $("#tabs");
    bar.innerHTML = "";
    // Sólo mostramos hojas no técnicas Y que tengan schema registrado en _meta
    // (descarta hojas residuales como la "Sheet1" creada por defecto al crear el workbook).
    const titles = Object.keys(Sheets.cache.sheetsByTitle).filter(t => {
      if (t.startsWith("_")) return false;
      return Sheets.getSchema(t).length > 0;
    });
    // Ordenar: primero los del config, luego los nuevos por orden de creación.
    const ordered = [];
    for (const t of cfg.tabs) if (titles.includes(t.name)) ordered.push(t.name);
    for (const t of titles) if (!ordered.includes(t)) ordered.push(t);

    for (const title of ordered) {
      const btn = el("button", {
        class: "tab" + (title === state.currentTabTitle ? " active" : ""),
        style: { "--tab-color": tabColor(title) },
        onClick: () => selectTab(title),
      }, [
        el("span", { class: "tab-color-dot" }),
        title,
      ]);
      bar.appendChild(btn);
    }
  }

  async function selectTab(title) {
    state.currentTabTitle = title;
    $("#current-tab-title").textContent = title;
    renderTabs();
    setSync("syncing");
    try {
      await Sheets.loadRows(title);
      renderTable();
      setSync("idle");
    } catch (e) {
      console.error(e);
      setSync("error");
      toast("Error al cargar la categoría: " + e.message, "error");
    }
  }

  // ============================== Tabla ==============================

  function renderTable() {
    const title = state.currentTabTitle;
    const columns = Sheets.getVisibleColumns(title);
    const rows = Sheets.cache.rows[title] || [];
    const head = $("#planner-head");
    const body = $("#planner-body");
    head.innerHTML = "";
    body.innerHTML = "";

    // Encabezados
    for (const col of columns) {
      head.appendChild(el("th", {}, [
        col.name,
        el("button", {
          class: "col-menu-btn",
          title: "Eliminar columna",
          onClick: () => onDeleteColumn(col.key, col.name),
        }, ["×"]),
      ]));
    }
    // Columna de acciones (Calendar + borrar fila)
    head.appendChild(el("th", { style: { width: "180px", textAlign: "right" } }, ["Acciones"]));

    // Filas
    if (!rows.length) {
      $("#empty-state").hidden = false;
      $("#planner-table").hidden = true;
      return;
    }
    $("#empty-state").hidden = true;
    $("#planner-table").hidden = false;

    for (const row of rows) {
      body.appendChild(renderRow(row, columns));
    }
  }

  function renderRow(row, columns) {
    const tr = el("tr", { dataset: { rowId: row._row_id, rowNumber: row._rowNumber } });
    for (const col of columns) {
      tr.appendChild(renderCell(row, col));
    }
    // Acciones
    tr.appendChild(el("td", {}, [
      el("div", { class: "row-actions" }, [
        renderCalendarButton(row),
        el("button", {
          class: "row-action-btn danger",
          title: "Eliminar actividad",
          onClick: () => onDeleteRow(row),
        }, ["🗑"]),
      ]),
    ]));
    return tr;
  }

  function renderCell(row, col) {
    const td = el("td");
    const onChange = debounce((value) => saveCell(row, col, value), 600);

    let inputEl;
    switch (col.type) {
      case "date":
        inputEl = el("input", {
          type: "date",
          class: "cell-date",
          value: toISODate(row[col.key]),
          onInput: e => onChange(e.target.value),
          onChange: e => onDateChanged(row, col, e.target.value),
        });
        break;

      case "status":
        inputEl = el("select", {
          class: "cell-select",
          onChange: e => onChange(e.target.value),
        });
        for (const opt of cfg.statusOptions) {
          inputEl.appendChild(el("option", {
            value: opt.value, selected: row[col.key] === opt.value,
          }, [opt.label]));
        }
        const current = cfg.statusOptions.find(o => o.value === row[col.key]);
        if (current && current.value) inputEl.style.background = current.color + "33";
        break;

      case "person":
        inputEl = el("input", {
          type: "text",
          class: "cell-input",
          list: "person-suggestions",
          value: row[col.key] || "",
          placeholder: "—",
          onInput: e => onChange(e.target.value),
        });
        break;

      case "longtext":
        inputEl = el("textarea", {
          class: "cell-textarea",
          rows: 2,
          placeholder: "—",
          onInput: e => { autoGrow(e.target); onChange(e.target.value); },
        });
        inputEl.value = row[col.key] || "";
        setTimeout(() => autoGrow(inputEl), 0);
        break;

      default: // text
        inputEl = el("input", {
          type: "text",
          class: "cell-input",
          value: row[col.key] || "",
          placeholder: "—",
          onInput: e => onChange(e.target.value),
        });
    }
    td.appendChild(inputEl);
    return td;
  }

  function autoGrow(t) {
    t.style.height = "auto";
    t.style.height = (t.scrollHeight + 2) + "px";
  }

  // Mantener un datalist con sugerencias de responsables.
  function ensurePersonDatalist() {
    if (document.getElementById("person-suggestions")) return;
    const dl = el("datalist", { id: "person-suggestions" });
    for (const p of cfg.personSuggestions || []) dl.appendChild(el("option", { value: p }));
    document.body.appendChild(dl);
  }

  // ============================== Calendar button ==============================

  function renderCalendarButton(row) {
    const hasDate = !!toISODate(row.fecha_limite);
    const linked  = !!row._calendar_event_id;
    if (!hasDate && !linked) {
      return el("span", { style: { fontSize: "11px", color: "#9CA3AF", padding: "0 6px" } }, []);
    }
    const label = linked ? "✓ Recordatorio" : "+ Calendar";
    return el("button", {
      class: "cal-btn" + (linked ? " linked" : ""),
      title: linked ? "Actualizar evento en Google Calendar" : "Crear evento en Google Calendar",
      onClick: () => onCalendarClick(row),
    }, [label]);
  }

  async function onCalendarClick(row) {
    const iso = toISODate(row.fecha_limite);
    if (!iso) { toast("Esta actividad no tiene Fecha Límite.", "error"); return; }

    setSync("syncing");
    try {
      const eventId = await Calendar.createOrUpdate({
        eventId: row._calendar_event_id || null,
        title: (row.actividad || "Actividad sin título") + " — Talento Humano FNSP",
        description: buildEventDescription(row),
        isoDate: iso,
      });
      if (eventId && eventId !== row._calendar_event_id) {
        row._calendar_event_id = eventId;
        await Sheets.updateCell(state.currentTabTitle, row._rowNumber, "_calendar_event_id", eventId);
      }
      toast(row._calendar_event_id ? "Recordatorio actualizado en Calendar." : "Evento creado en Calendar.", "success");
      renderTable();
      setSync("idle");
    } catch (e) {
      console.error(e);
      setSync("error");
      toast("Error con Google Calendar: " + e.message, "error");
    }
  }

  function buildEventDescription(row) {
    const lines = [];
    if (row.responsable) lines.push("Responsable: " + row.responsable);
    if (row.estado)      lines.push("Estado: " + row.estado);
    if (row.seguimiento) lines.push("\nSeguimiento:\n" + row.seguimiento);
    lines.push("\n— Recordatorios automáticos: 14d, 7d, 2d, 1d antes —");
    return lines.join("\n");
  }

  // Cuando cambia la Fecha Límite: si ya había evento, lo actualizamos automáticamente.
  async function onDateChanged(row, col, value) {
    if (col.key !== "fecha_limite") return;
    if (!row._calendar_event_id) return;  // sin evento, no hacemos nada hasta que el usuario lo pida
    const iso = toISODate(value);
    if (!iso) {
      // Borrar evento si se quita la fecha
      try {
        await Calendar.deleteEvent(row._calendar_event_id);
        row._calendar_event_id = "";
        await Sheets.updateCell(state.currentTabTitle, row._rowNumber, "_calendar_event_id", "");
        toast("Recordatorio eliminado de Calendar.", "success");
        renderTable();
      } catch (e) { console.error(e); }
      return;
    }
    try {
      await Calendar.createOrUpdate({
        eventId: row._calendar_event_id,
        title: (row.actividad || "Actividad sin título") + " — Talento Humano FNSP",
        description: buildEventDescription(row),
        isoDate: iso,
      });
      toast("Recordatorio sincronizado con la nueva fecha.", "success");
    } catch (e) {
      console.error(e);
      toast("No se pudo actualizar el evento en Calendar.", "error");
    }
  }

  // ============================== Save cell ==============================

  async function saveCell(row, col, value) {
    if (row[col.key] === value) return;
    row[col.key] = value;
    setSync("syncing");
    try {
      await Sheets.updateCell(state.currentTabTitle, row._rowNumber, col.key, value);
      setSync("idle");
      // Si la celda de Estado cambia, refrescar color
      if (col.type === "status") renderTable();
    } catch (e) {
      console.error(e);
      setSync("error");
      toast("Error al guardar: " + e.message, "error");
    }
  }

  // ============================== Add row / column / tab ==============================

  async function onAddRow() {
    setSync("syncing");
    try {
      await Sheets.addRow(state.currentTabTitle);
      renderTable();
      setSync("idle");
      // Focus en la primera celda visible
      const tbody = $("#planner-body");
      const lastRow = tbody.lastElementChild;
      if (lastRow) {
        const firstInput = lastRow.querySelector("input, textarea, select");
        if (firstInput) firstInput.focus();
      }
    } catch (e) {
      console.error(e);
      setSync("error");
      toast("Error al añadir actividad: " + e.message, "error");
    }
  }

  function openAddColumn() {
    const modal = $("#column-modal");
    $("#col-name").value = "";
    $("#col-type").value = "text";
    modal.showModal();
    modal.addEventListener("close", onAddColumnClose, { once: true });
  }

  async function onAddColumnClose() {
    const modal = $("#column-modal");
    if (modal.returnValue !== "ok") return;
    const name = $("#col-name").value.trim();
    const type = $("#col-type").value;
    if (!name) return;
    setSync("syncing");
    try {
      await Sheets.addColumn(state.currentTabTitle, name, type);
      renderTable();
      setSync("idle");
      toast("Columna creada.", "success");
    } catch (e) {
      console.error(e);
      setSync("error");
      toast("Error al crear columna: " + e.message, "error");
    }
  }

  async function onDeleteColumn(columnKey, columnName) {
    if (!confirm(`¿Eliminar la columna "${columnName}"? Esta acción borrará todos sus datos en esta categoría.`)) return;
    setSync("syncing");
    try {
      await Sheets.deleteColumn(state.currentTabTitle, columnKey);
      renderTable();
      setSync("idle");
      toast("Columna eliminada.", "success");
    } catch (e) {
      console.error(e);
      setSync("error");
      toast("Error al borrar columna: " + e.message, "error");
    }
  }

  async function onDeleteRow(row) {
    if (!confirm("¿Eliminar esta actividad? Esta acción no se puede deshacer.")) return;
    setSync("syncing");
    try {
      // Si tiene evento de Calendar, lo borramos también
      if (row._calendar_event_id) {
        try { await Calendar.deleteEvent(row._calendar_event_id); } catch (e) { console.warn(e); }
      }
      await Sheets.deleteRow(state.currentTabTitle, row._rowNumber);
      renderTable();
      setSync("idle");
      toast("Actividad eliminada.", "success");
    } catch (e) {
      console.error(e);
      setSync("error");
      toast("Error al eliminar: " + e.message, "error");
    }
  }

  function openAddTab() {
    const modal = $("#tab-modal");
    $("#tab-name").value = "";
    $("#tab-color").value = "#6D8FB8";
    modal.showModal();
    modal.addEventListener("close", onAddTabClose, { once: true });
  }

  async function onAddTabClose() {
    const modal = $("#tab-modal");
    if (modal.returnValue !== "ok") return;
    const name = $("#tab-name").value.trim();
    const color = $("#tab-color").value;
    if (!name) return;
    setSync("syncing");
    try {
      await Sheets.addTab(name, color);
      // Añadir a config en memoria para que tabColor() la encuentre
      cfg.tabs.push({ id: uid(), name, color });
      renderTabs();
      await selectTab(name);
      setSync("idle");
      toast("Categoría creada.", "success");
    } catch (e) {
      console.error(e);
      setSync("error");
      toast("Error al crear categoría: " + e.message, "error");
    }
  }

  // ============================== Boot ==============================

  document.addEventListener("DOMContentLoaded", () => {
    ensurePersonDatalist();
    start();
  });
})();
