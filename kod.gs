/**
 * Patpat Agent - Google Apps Script (kod.gs)
 *
 * Web App endpoint: .../exec  (NOT: /dev)
 * Görev: Gelen JSON payload ile Google Sheets UPSERT (Primary Key ile UPDATE/INSERT).
 *
 * Beklenen payload (örnek):
 * {
 *   "action": "upsert_orders",
 *   "sheetName": "01_SİPARİŞLER",
 *   "primaryKey": "smmId",
 *   "timestamp": "2026-02-21T00:00:00.000Z",
 *   "rows": [ { "smmId":"123", ... } ]
 * }
 */

const LOCKED_SHEETS_ID = "1XNDD1psw5sS-GMCS17w4xa8W2rCgRXqVWDvac6LpOGM";

function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function getServiceUrl_() {
  try {
    return ScriptApp.getService().getUrl(); // deployed web app url
  } catch (e) {
    return "";
  }
}

function normalizeRows_(rows) {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter(r => r && typeof r === "object")
    .map(r => JSON.parse(JSON.stringify(r))); // remove undefined/functions
}

function getOrCreateSheet_(ss, name) {
  const sh = ss.getSheetByName(name);
  if (sh) return sh;
  return ss.insertSheet(name);
}

function ensureHeaders_(sh, rows, primaryKey) {
  // Header row in row 1
  const lastCol = sh.getLastColumn();
  const headerValues = lastCol ? sh.getRange(1, 1, 1, lastCol).getValues()[0] : [];
  const headers = headerValues.map(h => String(h || "").trim()).filter(Boolean);

  const keySet = new Set(headers);
  keySet.add(String(primaryKey || "").trim());

  // Union keys from rows
  for (const r of rows) {
    for (const k of Object.keys(r)) keySet.add(k);
  }

  const nextHeaders = Array.from(keySet).filter(Boolean);
  // Keep existing order first
  nextHeaders.sort((a,b) => {
    const ia = headers.indexOf(a);
    const ib = headers.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });

  if (nextHeaders.length === 0) return [];

  // Write header row if empty or needs expansion
  if (headers.length !== nextHeaders.length || headers.join("|") !== nextHeaders.join("|")) {
    sh.getRange(1, 1, 1, nextHeaders.length).setValues([nextHeaders]);
  }

  return nextHeaders;
}

function buildIndexByPrimaryKey_(sh, headers, primaryKey) {
  const pk = String(primaryKey || "").trim();
  const pkCol = headers.indexOf(pk) + 1;
  if (pkCol <= 0) throw new Error("primaryKey header bulunamadı: " + pk);

  const lastRow = sh.getLastRow();
  if (lastRow < 2) return { pkCol, index: {} };

  const values = sh.getRange(2, pkCol, lastRow - 1, 1).getValues();
  const index = {};
  for (let i = 0; i < values.length; i++) {
    const v = String(values[i][0] || "").trim();
    if (v) index[v] = i + 2; // sheet row number
  }
  return { pkCol, index };
}

function rowToSheetArray_(rowObj, headers) {
  return headers.map(h => {
    const v = rowObj[h];
    if (v === null || v === undefined) return "";
    if (typeof v === "object") return JSON.stringify(v);
    return String(v);
  });
}

function upsert_(sheetName, primaryKey, rows) {
  const ss = SpreadsheetApp.openById(LOCKED_SHEETS_ID);
  const sh = getOrCreateSheet_(ss, sheetName);

  const normRows = normalizeRows_(rows);
  if (normRows.length === 0) return { inserted: 0, updated: 0, total: 0 };

  const headers = ensureHeaders_(sh, normRows, primaryKey);
  const { index } = buildIndexByPrimaryKey_(sh, headers, primaryKey);

  let inserted = 0;
  let updated = 0;

  for (const r of normRows) {
    const pkVal = String(r[primaryKey] || "").trim();
    if (!pkVal) continue;

    const arr = rowToSheetArray_(r, headers);
    const existingRow = index[pkVal];

    if (existingRow) {
      // UPDATE
      sh.getRange(existingRow, 1, 1, headers.length).setValues([arr]);
      updated++;
    } else {
      // INSERT
      sh.appendRow(arr);
      inserted++;
      index[pkVal] = sh.getLastRow();
    }
  }

  return { inserted, updated, total: inserted + updated };
}

function doPost(e) {
  try {
    const serviceUrl = getServiceUrl_();
    if (serviceUrl && !serviceUrl.endsWith("/exec")) {
      return jsonOut({ ok: false, error: "Webhook URL /exec olmalıdır (deploy edilen URL /exec değil)." });
    }

    const body = e?.postData?.contents || "";
    if (!body) return jsonOut({ ok:false, error:"Boş body." });

    let payload;
    try { payload = JSON.parse(body); } catch (err) {
      return jsonOut({ ok:false, error:"JSON parse hatası.", detail:String(err) });
    }

    const sheetName = String(payload.sheetName || "").trim();
    const primaryKey = String(payload.primaryKey || "").trim();
    const rows = payload.rows;

    if (!sheetName) return jsonOut({ ok:false, error:"sheetName zorunlu." });
    if (!primaryKey) return jsonOut({ ok:false, error:"primaryKey zorunlu." });

    const result = upsert_(sheetName, primaryKey, rows);

    return jsonOut({
      ok: true,
      action: String(payload.action || ""),
      sheetName,
      primaryKey,
      receivedRows: Array.isArray(rows) ? rows.length : 0,
      result,
      ts: new Date().toISOString()
    });

  } catch (err) {
    return jsonOut({ ok:false, error:"Server error", detail:String(err?.message || err) });
  }
}

function doGet() {
  return jsonOut({
    ok: true,
    message: "Patpat Agent Webhook aktif.",
    url: getServiceUrl_(),
    ts: new Date().toISOString()
  });
}
