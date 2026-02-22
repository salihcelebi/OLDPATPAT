const $ = (id) => document.getElementById(id);

function setStatus(kind, text){
  const pill = $("statusPill");
  pill.className = "pill";
  if (kind === "ok") pill.classList.add("ok");
  if (kind === "bad") pill.classList.add("bad");
  if (kind === "warn") pill.classList.add("warn");
  pill.textContent = text || "-";
}

async function bg(msg){
  return await chrome.runtime.sendMessage(msg);
}

function downloadJson(filename, data){
  const blob = new Blob([JSON.stringify(data, null, 2)], { type:"application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function clampInt(n, min, max){
  const x = Number(n);
  if (!Number.isFinite(x)) return min;
  return Math.max(min, Math.min(max, Math.trunc(x)));
}

async function load(){
  const res = await bg({ type:"GET_SETTINGS" });
  if (!res?.ok){
    setStatus("bad", res?.error || "Ayarlar okunamadı.");
    return;
  }
  const s = res.settings;

  $("sheetsId").value = s.sheetsId || "";
  $("webhookUrl").value = s.webhookUrl || "";
  $("writeMode").value = s.writeMode || "apps_script";
  $("maxPages").value = String(s.scraping?.maxPages ?? 5);
  $("debugEnabled").value = String(!!s.debug?.enabled);

  setStatus("ok", "Yüklendi");
}

async function save(){
  const writeMode = $("writeMode").value;
  const maxPages = clampInt($("maxPages").value, 1, 50);
  const debugEnabled = $("debugEnabled").value === "true";

  const partial = {
    writeMode,
    scraping: { maxPages },
    debug: { enabled: debugEnabled }
  };

  const res = await bg({ type:"SET_SETTINGS", partial });
  if (!res?.ok){
    setStatus("bad", res?.error || "Kaydetme başarısız.");
    return;
  }
  $("maxPages").value = String(res.settings?.scraping?.maxPages ?? maxPages);
  setStatus("ok", "Kaydedildi");
}

async function exportAll(){
  const res = await bg({ type:"EXPORT_ALL" });
  if (!res?.ok){
    setStatus("bad", res?.error || "Export başarısız.");
    return;
  }
  downloadJson(`patpat_export_${Date.now()}.json`, res.export);
  setStatus("ok", "Export indirildi");
}

async function importAllFromObject(obj){
  if (!obj || typeof obj !== "object") throw new Error("Geçersiz JSON.");
  const settings = obj.settings || {};
  const instruction = obj.instruction || {};

  // Settings: kilitli alanlar arka planda zorlanır.
  await bg({ type:"SET_SETTINGS", partial: settings });
  await bg({ type:"IMPORT_INSTRUCTION", instruction });
  await load();
}

function init(){
  $("btnSave").addEventListener("click", () => save().catch(e => setStatus("bad", String(e?.message||e))));
  $("btnExport").addEventListener("click", () => exportAll().catch(e => setStatus("bad", String(e?.message||e))));

  $("btnImport").addEventListener("click", () => $("importFile").click());
  $("importFile").addEventListener("change", async () => {
    const file = $("importFile").files?.[0];
    if (!file) return;
    try {
      const txt = await file.text();
      const obj = JSON.parse(txt);
      await importAllFromObject(obj);
      setStatus("ok", "Import tamamlandı");
    } catch (e){
      setStatus("bad", String(e?.message || e));
    } finally {
      $("importFile").value = "";
    }
  });

  load().catch(e => setStatus("bad", String(e?.message || e)));
}

document.addEventListener("DOMContentLoaded", init);
