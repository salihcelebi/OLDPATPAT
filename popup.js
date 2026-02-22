const $ = (id) => document.getElementById(id);

const state = {
  busy: false
};

function setBusy(busy, text){
  state.busy = busy;
  $("btnScanHesap").disabled = busy;
  $("btnScanAnabayiniz").disabled = busy;
  $("btnScanCompetitors").disabled = busy;

  const pill = $("statusPill");
  pill.className = "pill";
  if (busy){
    pill.classList.add("warn");
    pill.textContent = "Çalışıyor";
  } else {
    pill.textContent = "Hazır";
  }
  if (text) $("statusText").textContent = text;
}

function setStatus(type, text){
  const pill = $("statusPill");
  pill.className = "pill";
  if (type === "ok") pill.classList.add("ok");
  if (type === "warn") pill.classList.add("warn");
  if (type === "bad") pill.classList.add("bad");
  pill.textContent = type === "ok" ? "OK" : type === "bad" ? "Hata" : type === "warn" ? "Uyarı" : "Hazır";
  $("statusText").textContent = text || "";
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

async function refreshLastResult(){
  const res = await bg({ type:"GET_LAST_RESULT" });
  const meta = $("lastResultMeta");
  const text = $("lastResultText");

  if (!res?.ok || !res.last_result){
    meta.textContent = "-";
    text.textContent = "Henüz tarama yok.";
    return;
  }
  const lr = res.last_result;
  meta.textContent = `${lr.scanType} • ${lr.rowCount} satır`;
  text.textContent = `${new Date(lr.time).toLocaleString()} tarihinde kaydedildi.`;
}

async function runScan(scanType){
  setBusy(true, "Worker tab'lerde tarama yapılıyor…");
  try {
    const res = await bg({ type:"RUN_SCAN", scanType });
    if (!res?.ok){
      setStatus("bad", res?.error || "Tarama başarısız.");
      return;
    }
    const note = res?.syncResult?.note ? ` (${res.syncResult.note})` : "";
    setStatus("ok", `Bitti. Toplam: ${res.rowCount} • Gönderilen: ${res.sentCount}${note}`);
    await refreshLastResult();
  } catch (e){
    setStatus("bad", String(e?.message || e));
  } finally {
    setBusy(false);
  }
}

function toggleMenu(){
  $("kebabMenu").classList.toggle("open");
}

async function openLogs(){
  $("logsModal").classList.add("open");
  await refreshLogs();
}

function closeLogs(){
  $("logsModal").classList.remove("open");
}

async function refreshLogs(){
  const res = await bg({ type:"GET_LOGS" });
  const pre = $("logsPre");
  if (!res?.ok){
    pre.textContent = res?.error || "Log okunamadı.";
    return;
  }
  const logs = res.logs || [];
  pre.textContent = logs.length ? JSON.stringify(logs.slice(-200), null, 2) : "Log yok.";
}

async function clearLogs(){
  await bg({ type:"CLEAR_LOGS" });
  await refreshLogs();
}

async function copyLast(){
  const res = await bg({ type:"GET_LAST_RESULT" });
  if (!res?.ok || !res.last_result){
    setStatus("warn", "Kopyalanacak veri yok.");
    return;
  }
  const txt = JSON.stringify(res.last_result, null, 2);
  await navigator.clipboard.writeText(txt);
  setStatus("ok", "Son sonuç panoya kopyalandı.");
}

async function exportAll(){
  const res = await bg({ type:"EXPORT_ALL" });
  if (!res?.ok){
    setStatus("bad", res?.error || "Dışa aktarma başarısız.");
    return;
  }
  downloadJson(`patpat_export_${Date.now()}.json`, res.export);
  setStatus("ok", "Export indirildi.");
}

async function openOptions(){
  await bg({ type:"OPEN_OPTIONS" });
}

async function openSidePanel(){
  await bg({ type:"OPEN_SIDEPANEL" });
  setStatus("ok", "Onay paneli açıldı.");
}

function init(){
  $("kebabBtn").addEventListener("click", toggleMenu);

  $("btnSettings").addEventListener("click", openOptions);
  $("btnExport").addEventListener("click", exportAll);
  $("btnCopy").addEventListener("click", copyLast);
  $("btnLogs").addEventListener("click", openLogs);

  $("btnScanHesap").addEventListener("click", () => runScan("hesap_orders"));
  $("btnScanAnabayiniz").addEventListener("click", () => runScan("anabayiniz_orders"));
  $("btnScanCompetitors").addEventListener("click", () => runScan("competitors"));
  $("btnOpenSidePanel").addEventListener("click", openSidePanel);

  $("closeLogs").addEventListener("click", closeLogs);
  $("btnRefreshLogs").addEventListener("click", refreshLogs);
  $("btnClearLogs").addEventListener("click", clearLogs);

  $("logsModal").addEventListener("click", (e) => {
    if (e.target === $("logsModal")) closeLogs();
  });

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === "SCAN_FINISHED"){
      // popup açıksa hızlı güncelle
      refreshLastResult().catch(()=>{});
    }
  });

  refreshLastResult().catch(()=>{});
}

document.addEventListener("DOMContentLoaded", init);
