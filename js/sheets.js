// =============================================================================
//  sheets.js — Lectura y escritura del Google Sheet que actúa de base de datos
// =============================================================================
//
//  Estructura del workbook:
//   - Una hoja por tab (categoría). Fila 1 = encabezados visibles. Fila 2+ = datos.
//   - Las dos últimas columnas de cada hoja son técnicas:
//       _row_id              → UUID estable para identificar la fila
//       _calendar_event_id   → ID del evento de Google Calendar vinculado (si existe)
//   - Una hoja oculta llamada "_meta" almacena los tipos de cada columna:
//       sheet_title | column_index | column_name | column_key | type
// =============================================================================

window.Sheets = (function () {
  const cfg = window.APP_CONFIG;
  const BASE = "https://sheets.googleapis.com/v4/spreadsheets";
  const META_SHEET = "_meta";
  const SYSTEM_COLUMNS = ["_row_id", "_calendar_event_id"];

  // Cache local de las hojas/columnas para acelerar la UI.
  const cache = {
    sheetsByTitle: {},   // title -> { sheetId, index }
    schema:       {},    // sheet_title -> [{key, name, type, colIndex}]
    rows:         {},    // sheet_title -> [{ _row_id, _calendar_event_id, ...data, _rowNumber }]
  };

  // ============================== HTTP helpers ==============================

  async function api(path, options = {}) {
    const token = await Auth.ensureFreshToken();
    const url = path.startsWith("http") ? path : `${BASE}/${cfg.spreadsheetId}${path}`;
    const headers = Object.assign(
      { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
      options.headers || {}
    );
    const res = await fetch(url, Object.assign({}, options, { headers }));
    if (!res.ok) {
      let detail = "";
      try { detail = (await res.json()).error?.message || ""; } catch (e) {}
      throw new Error(`Sheets API ${res.status}: ${detail || res.statusText}`);
    }
    if (res.status === 204) return null;
    return res.json();
  }

  // A1: convierte índice de columna (0-based) a letra (A, B, ..., AA, AB, ...)
  function colLetter(idx) {
    let n = idx, s = "";
    do { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; } while (n >= 0);
    return s;
  }
  function rangeA1(sheetTitle, r1, c1, r2, c2) {
    const a = `${colLetter(c1)}${r1}`;
    const b = (r2 != null && c2 != null) ? `:${colLetter(c2)}${r2}` : "";
    return `'${sheetTitle.replace(/'/g, "''")}'!${a}${b}`;
  }

  // ============================== Spreadsheet metadata ==============================

  async function getWorkbook() {
    const data = await api("?fields=sheets(properties(sheetId,title,index,hidden,tabColor,tabColorStyle))");
    cache.sheetsByTitle = {};
    for (const s of data.sheets) {
      const p = s.properties;
      cache.sheetsByTitle[p.title] = {
        sheetId: p.sheetId,
        index: p.index,
        hidden: !!p.hidden,
        tabColorHex: extractTabColor(p),
      };
    }
    return cache.sheetsByTitle;
  }

  function extractTabColor(props) {
    const c = props.tabColorStyle?.rgbColor || props.tabColor;
    if (!c) return null;
    const r = Math.round((c.red   || 0) * 255);
    const g = Math.round((c.green || 0) * 255);
    const b = Math.round((c.blue  || 0) * 255);
    return "#" + [r,g,b].map(n => n.toString(16).padStart(2,"0")).join("");
  }

  async function addSheet(title, color) {
    const props = { title };
    if (color) {
      const rgb = hexToRgb(color);
      if (rgb) props.tabColor = { red: rgb.r/255, green: rgb.g/255, blue: rgb.b/255 };
    }
    const res = await api(":batchUpdate", {
      method: "POST",
      body: JSON.stringify({ requests: [{ addSheet: { properties: props } }] }),
    });
    const sheetId = res.replies[0].addSheet.properties.sheetId;
    cache.sheetsByTitle[title] = {
      sheetId,
      index: res.replies[0].addSheet.properties.index,
      hidden: false,
      tabColorHex: color || null,
    };
    return sheetId;
  }

  async function setSheetHidden(title, hidden) {
    const meta = cache.sheetsByTitle[title];
    if (!meta) return;
    await api(":batchUpdate", {
      method: "POST",
      body: JSON.stringify({
        requests: [{
          updateSheetProperties: {
            properties: { sheetId: meta.sheetId, hidden: !!hidden },
            fields: "hidden",
          }
        }]
      }),
    });
    meta.hidden = !!hidden;
  }

  function hexToRgb(hex) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!m) return null;
    return { r: parseInt(m[1],16), g: parseInt(m[2],16), b: parseInt(m[3],16) };
  }

  // ============================== Bootstrap ==============================
  //
  // Garantiza que el workbook tenga:
  //   - Hoja "_meta" (oculta)
  //   - Una hoja por cada tab en config.js, con columnas por defecto
  //
  async function bootstrap() {
    await getWorkbook();

    // 1) Crear _meta si no existe
    if (!cache.sheetsByTitle[META_SHEET]) {
      await addSheet(META_SHEET);
      await writeRange(META_SHEET, 1, 0, [
        ["sheet_title", "column_index", "column_name", "column_key", "type"]
      ]);
      await setSheetHidden(META_SHEET, true);
    }

    // 2) Crear hojas faltantes según config
    for (const tab of cfg.tabs) {
      if (!cache.sheetsByTitle[tab.name]) {
        await addSheet(tab.name, tab.color);
        await initSheetWithDefaults(tab.name);
      }
    }

    await loadAllSchemas();
  }

  async function initSheetWithDefaults(sheetTitle) {
    // Crear encabezados con columnas por defecto + columnas técnicas al final.
    const cols = [
      ...cfg.defaultColumns,
      { key: "_calendar_event_id", name: "_calendar_event_id", type: "system" },
      { key: "_row_id",            name: "_row_id",            type: "system" },
    ];
    const headerRow = cols.map(c => c.name);
    await writeRange(sheetTitle, 1, 0, [headerRow]);

    // Registrar metadata en _meta.
    const metaRows = cols.map((c, i) => [sheetTitle, i, c.name, c.key, c.type]);
    await appendRows(META_SHEET, metaRows);
  }

  // ============================== Schema ==============================

  async function loadAllSchemas() {
    // Leer _meta completa
    const metaData = await readRange(META_SHEET, "A2:E");
    const byTitle = {};
    for (const row of (metaData || [])) {
      const [title, idx, name, key, type] = row;
      if (!title) continue;
      (byTitle[title] = byTitle[title] || []).push({
        key, name, type,
        colIndex: Number(idx),
      });
    }
    // Ordenar por colIndex
    for (const t in byTitle) byTitle[t].sort((a,b) => a.colIndex - b.colIndex);
    cache.schema = byTitle;
    return byTitle;
  }

  function getSchema(sheetTitle) {
    return cache.schema[sheetTitle] || [];
  }

  function getVisibleColumns(sheetTitle) {
    return getSchema(sheetTitle).filter(c => c.type !== "system");
  }

  // ============================== Read / write ranges ==============================

  async function readRange(sheetTitle, a1Suffix) {
    const range = `'${sheetTitle.replace(/'/g, "''")}'!${a1Suffix}`;
    const data = await api(`/values/${encodeURIComponent(range)}`);
    return data.values || [];
  }

  async function writeRange(sheetTitle, row1based, col0based, values2d) {
    const r2 = row1based + values2d.length - 1;
    const c2 = col0based + (values2d[0]?.length || 1) - 1;
    const range = rangeA1(sheetTitle, row1based, col0based, r2, c2);
    return api(`/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`, {
      method: "PUT",
      body: JSON.stringify({ values: values2d }),
    });
  }

  async function appendRows(sheetTitle, rows2d) {
    const range = `'${sheetTitle.replace(/'/g, "''")}'!A1`;
    return api(`/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, {
      method: "POST",
      body: JSON.stringify({ values: rows2d }),
    });
  }

  // ============================== Rows (data) ==============================

  async function loadRows(sheetTitle) {
    const schema = getSchema(sheetTitle);
    if (!schema.length) return [];
    const lastCol = colLetter(schema.length - 1);
    const data = await readRange(sheetTitle, `A2:${lastCol}`);
    const rows = (data || []).map((arr, idx) => {
      const obj = { _rowNumber: idx + 2 };  // número de fila real en la hoja
      for (const col of schema) obj[col.key] = arr[col.colIndex] ?? "";
      // Asegurar row_id
      if (!obj._row_id) obj._row_id = Utils.uid();
      return obj;
    });
    cache.rows[sheetTitle] = rows;
    return rows;
  }

  async function updateCell(sheetTitle, rowNumber, columnKey, value) {
    const col = getSchema(sheetTitle).find(c => c.key === columnKey);
    if (!col) throw new Error(`Columna desconocida: ${columnKey}`);
    await writeRange(sheetTitle, rowNumber, col.colIndex, [[value ?? ""]]);
  }

  async function addRow(sheetTitle) {
    const schema = getSchema(sheetTitle);
    const newRow = {};
    const arr = schema.map(c => {
      if (c.key === "_row_id") { newRow._row_id = Utils.uid(); return newRow._row_id; }
      newRow[c.key] = "";
      return "";
    });
    await appendRows(sheetTitle, [arr]);
    // Recalcular números de fila releyendo
    await loadRows(sheetTitle);
    return cache.rows[sheetTitle].find(r => r._row_id === newRow._row_id);
  }

  async function deleteRow(sheetTitle, rowNumber) {
    const sheetId = cache.sheetsByTitle[sheetTitle]?.sheetId;
    if (sheetId == null) throw new Error("Sheet no encontrada");
    await api(":batchUpdate", {
      method: "POST",
      body: JSON.stringify({
        requests: [{
          deleteDimension: {
            range: { sheetId, dimension: "ROWS", startIndex: rowNumber - 1, endIndex: rowNumber },
          }
        }]
      }),
    });
    await loadRows(sheetTitle);
  }

  // ============================== Add new column ==============================
  //
  // Inserta una columna ANTES de las columnas técnicas para mantenerlas al final.
  //
  async function addColumn(sheetTitle, columnName, columnType) {
    const schema = getSchema(sheetTitle).slice();
    // posición donde insertar: justo antes de la primera columna técnica
    const firstSystemIdx = schema.findIndex(c => SYSTEM_COLUMNS.includes(c.key));
    const insertIdx = firstSystemIdx >= 0 ? firstSystemIdx : schema.length;
    const sheetId = cache.sheetsByTitle[sheetTitle].sheetId;

    // 1) Insertar columna en la hoja
    await api(":batchUpdate", {
      method: "POST",
      body: JSON.stringify({
        requests: [{
          insertDimension: {
            range: { sheetId, dimension: "COLUMNS", startIndex: insertIdx, endIndex: insertIdx + 1 },
            inheritFromBefore: insertIdx > 0,
          }
        }]
      }),
    });

    // 2) Escribir encabezado
    await writeRange(sheetTitle, 1, insertIdx, [[columnName]]);

    // 3) Recalcular metadata: subir los colIndex >= insertIdx en _meta, luego añadir la nueva.
    const colKey = "col_" + Utils.uid();
    await rebuildMetaForSheet(sheetTitle, schema, insertIdx, { key: colKey, name: columnName, type: columnType });

    // 4) Refrescar caches
    await loadAllSchemas();
    await loadRows(sheetTitle);
    return colKey;
  }

  async function rebuildMetaForSheet(sheetTitle, oldSchema, insertIdx, newCol) {
    // Estrategia: reescribir _meta para esta hoja completa.
    // Primero leer _meta entera, filtrar filas de esta hoja, reconstruirlas.
    const meta = await readRange(META_SHEET, "A2:E");
    const others = (meta || []).filter(r => r[0] !== sheetTitle);
    const newSchema = [];
    for (let i = 0; i < oldSchema.length; i++) {
      const adj = i >= insertIdx ? i + 1 : i;
      newSchema.push({ ...oldSchema[i], colIndex: adj });
    }
    newSchema.push({ ...newCol, colIndex: insertIdx });
    newSchema.sort((a,b) => a.colIndex - b.colIndex);
    const allRows = [...others, ...newSchema.map(c => [sheetTitle, c.colIndex, c.name, c.key, c.type])];

    // Limpiar y reescribir _meta entera (A2 en adelante)
    const sheetId = cache.sheetsByTitle[META_SHEET].sheetId;
    await api(":batchUpdate", {
      method: "POST",
      body: JSON.stringify({
        requests: [{
          updateCells: {
            range: { sheetId, startRowIndex: 1 },  // borra desde fila 2
            fields: "userEnteredValue",
          }
        }]
      }),
    });
    if (allRows.length) await writeRange(META_SHEET, 2, 0, allRows);
  }

  async function deleteColumn(sheetTitle, columnKey) {
    const col = getSchema(sheetTitle).find(c => c.key === columnKey);
    if (!col) return;
    if (col.type === "system") throw new Error("No se puede borrar una columna del sistema");
    const sheetId = cache.sheetsByTitle[sheetTitle].sheetId;
    await api(":batchUpdate", {
      method: "POST",
      body: JSON.stringify({
        requests: [{
          deleteDimension: {
            range: { sheetId, dimension: "COLUMNS", startIndex: col.colIndex, endIndex: col.colIndex + 1 },
          }
        }]
      }),
    });
    // Reconstruir _meta para esta hoja: quitar la columna y bajar índices.
    const remaining = getSchema(sheetTitle).filter(c => c.key !== columnKey);
    remaining.forEach((c, i) => c.colIndex = i);
    const meta = await readRange(META_SHEET, "A2:E");
    const others = (meta || []).filter(r => r[0] !== sheetTitle);
    const rebuilt = remaining.map(c => [sheetTitle, c.colIndex, c.name, c.key, c.type]);
    const sheetIdMeta = cache.sheetsByTitle[META_SHEET].sheetId;
    await api(":batchUpdate", {
      method: "POST",
      body: JSON.stringify({
        requests: [{
          updateCells: { range: { sheetId: sheetIdMeta, startRowIndex: 1 }, fields: "userEnteredValue" }
        }]
      }),
    });
    if (others.length || rebuilt.length) {
      await writeRange(META_SHEET, 2, 0, [...others, ...rebuilt]);
    }
    await loadAllSchemas();
    await loadRows(sheetTitle);
  }

  // ============================== New tab ==============================

  async function addTab(name, color) {
    if (cache.sheetsByTitle[name]) throw new Error("Ya existe una categoría con ese nombre");
    await addSheet(name, color);
    await initSheetWithDefaults(name);
    await loadAllSchemas();
  }

  // ============================== Public API ==============================

  return {
    bootstrap,
    getWorkbook,
    getSchema,
    getVisibleColumns,
    loadRows,
    addRow,
    updateCell,
    deleteRow,
    addColumn,
    deleteColumn,
    addTab,
    // cache (lectura)
    cache,
  };
})();
