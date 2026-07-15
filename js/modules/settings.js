// ==================================================================
// SETTINGS MODULE — js/modules/settings.js
// Extracted from index.html — Phase 12A (Extraction Only)
// ==================================================================
// LOAD ORDER REQUIREMENT:
// This file depends on globals defined in the main inline <script> block
// of index.html (API_URL, DRIVE_URL, data, toast(), saveLocal(),
// updateBadges(), renderDashboard(), loadFromSheets()).
// It must be loaded AFTER that inline script block, in the same position
// as the other already-extracted modules (tasks.js, documents.js,
// sessions.js, clients.js, fees.js, library.js, templates.js).
// This file is NOT yet wired into index.html (no <script> tag added) —
// integration is deferred to a later phase per instructions.
// ==================================================================

// SETTINGS
function saveApiUrl(){API_URL=document.getElementById('apiUrlInput').value.trim();localStorage.setItem('apiUrl',API_URL);toast('تم حفظ الرابط','success');updateConnectionStatus();}
function saveDriveUrl(){DRIVE_URL=document.getElementById('driveUrlInput').value.trim();localStorage.setItem('driveUrl',DRIVE_URL);var b=document.getElementById('driveOpenBtn');if(DRIVE_URL){b.href=DRIVE_URL;b.style.display='';}else b.style.display='none';toast('تم حفظ رابط Drive','success');}

async function testConnection(){
  var url=document.getElementById('apiUrlInput').value.trim();
  if(!url){toast('أدخل الرابط أولاً','error');return;}
  var res=document.getElementById('connectionResult');
  res.innerHTML='<span style="color:var(--muted)">⏳ جارٍ الاتصال وإعداد جدول البيانات...</span>';
  try{
    // Step 1: setup (creates spreadsheet if needed)
    var r=await fetch(url+'?action=setup',{signal:AbortSignal.timeout(30000)});
    var d=await r.json();
    if(d.status==='ok'){
      API_URL=url;
      localStorage.setItem('apiUrl',url);
      updateConnectionStatus();
      // Step 2: ping to get sheet URL
      try{
        var r2=await fetch(url+'?action=ping',{signal:AbortSignal.timeout(10000)});
        var d2=await r2.json();
        var sheetUrl = d2.spreadsheet_url || d.spreadsheet_url || '';
        if(sheetUrl){
          displaySheetUrl(sheetUrl);
          res.innerHTML='<span style="color:var(--success)">✅ الاتصال ناجح! جدول البيانات جاهز — جارٍ تحميل البيانات...</span>';
        } else {
          res.innerHTML='<span style="color:var(--success)">✅ الاتصال ناجح! جارٍ تحميل البيانات...</span>';
        }
      }catch(pe){
        res.innerHTML='<span style="color:var(--success)">✅ الاتصال ناجح! جارٍ تحميل البيانات...</span>';
      }
      setTimeout(loadFromSheets,800);
    } else {
      res.innerHTML='<span style="color:var(--danger)">✗ خطأ: '+(d.error||'غير معروف')+'</span>';
    }
  }catch(e){
    res.innerHTML='<span style="color:var(--danger)">✗ فشل الاتصال — تحقق من الرابط وإعدادات النشر<br><small>'+e.message+'</small></span>';
  }
}

function displaySheetUrl(url){
  if(!url) return;
  var box=document.getElementById('sheetUrlBox');
  var inp=document.getElementById('sheetUrlDisplay');
  var btn=document.getElementById('sheetOpenBtn');
  if(box) box.style.display='block';
  if(inp) inp.value=url;
  if(btn){ btn.href=url; }
  localStorage.setItem('sheetUrl', url);
}

function copySheetUrl(){
  var inp=document.getElementById('sheetUrlDisplay');
  if(!inp||!inp.value) return;
  navigator.clipboard.writeText(inp.value).then(function(){ toast('تم نسخ رابط الشيت','success'); });
}

function updateConnectionStatus(){
  var dot=document.getElementById('statusDot'),tx=document.getElementById('statusText');
  if(API_URL){dot.classList.add('connected');dot.classList.remove('error');tx.textContent='متصل بـ Google Sheets';}
  else{dot.classList.remove('connected','error');tx.textContent='غير متصل بـ Sheets';}
  // PHASE UX-03A: small non-blocking notice in Settings ("أنت تعمل حالياً
  // بالوضع المحلي...") — visible only while no Google URL is configured.
  // Reuses this same function (already the single place connection-state
  // changes flow through) instead of adding a new call site.
  var notice=document.getElementById('localModeNotice');
  if(notice)notice.style.display=API_URL?'none':'flex';
  if(typeof updateTopbarSyncMeta==='function')updateTopbarSyncMeta();
}
async function pingConnection(){
  if(!API_URL)return;
  try{
    var r=await fetch(API_URL+'?action=ping',{signal:AbortSignal.timeout(8000)});
    var d=await r.json();
    var dot=document.getElementById('statusDot'),tx=document.getElementById('statusText');
    if(d.status==='ok'){
      dot.classList.add('connected');dot.classList.remove('error');
      tx.textContent='متصل ✓ v'+(d.version||'');
      if(d.spreadsheet_url) displaySheetUrl(d.spreadsheet_url);
    } else {
      dot.classList.remove('connected');dot.classList.add('error');tx.textContent='خطأ في الاتصال';
    }
  }catch(e){
    var dot=document.getElementById('statusDot'),tx=document.getElementById('statusText');
    dot.classList.remove('connected');dot.classList.add('error');tx.textContent='تعذر الاتصال';
  }
  if(typeof updateTopbarSyncMeta==='function')updateTopbarSyncMeta();
}

function exportData(){var b=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});var a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='lawyer_backup_'+new Date().toISOString().slice(0,10)+'.json';a.click();toast('تم التصدير','success');}
function importData(){document.getElementById('importFile').click();}
function handleImport(evt){var f=evt.target.files[0];if(!f)return;var r=new FileReader();r.onload=function(e){try{var im=JSON.parse(e.target.result);if(typeof im!=='object'||Array.isArray(im)){toast('الملف غير صالح — يجب أن يكون ملف JSON صادراً من هذا النظام','error');return;}var imported=0;Object.keys(data).forEach(function(k){if(im[k]&&Array.isArray(im[k])){data[k]=im[k];imported++;}});if(!imported){toast('لم يُعثر على بيانات صالحة في الملف','error');return;}saveLocal();updateBadges();renderDashboard();toast('تم الاستيراد بنجاح ('+imported+' مجموعات بيانات)','success');}catch(err){toast('خطأ في قراءة الملف — تأكد أنه ملف JSON صحيح','error');}};r.readAsText(f);}
function clearAllData(){if(!confirm('مسح كل البيانات المحلية؟ لا يمكن التراجع!'))return;data={cases:[],sessions:[],clients:[],children:[],documents:[],tasks:[],fees:[],library:[],templates:[]};saveLocal();updateBadges();renderDashboard();toast('تم المسح','info');}

// ---- Extracted below: functions copied byte-identical from index.html ----
// (saveDriveFromModal, syncToSheets, syncDeleteToSheets, loadFromSheets, refreshAll)
// Source: index.html inline <script> block (Settings/Sync section).
// Per SETTINGS_INTEGRATION_AUDIT_REPORT.md Section 1 / Required Changes #2.

function saveDriveFromModal(){DRIVE_URL=document.getElementById('fDriveUrl').value.trim();localStorage.setItem('driveUrl',DRIVE_URL);closeModal('modalDrive');toast('تم ربط Google Drive','success');}

// SYNC — إصلاح CORS: نرسل text/plain
async function syncToSheets(sheet,rowData,rowIndex){
  if(!API_URL)return;
  try{var action=rowIndex>=0?'update':'add';var body={action:action,sheet:sheet,data:rowData};if(action==='update')body.rowIndex=rowIndex+1;await fetch(API_URL,{method:'POST',body:JSON.stringify(body),headers:{'Content-Type':'text/plain'}});}catch(e){console.warn('Sync:',e);}
}
async function syncDeleteToSheets(sheet,rowIndex){
  if(!API_URL)return;
  try{await fetch(API_URL,{method:'POST',body:JSON.stringify({action:'delete',sheet:sheet,rowIndex:rowIndex+1}),headers:{'Content-Type':'text/plain'}});}catch(e){console.warn('Delete:',e);}
}

// Non-blocking background sync indicator — never covers the UI (unlike showLoading/#loadingOverlay).
// PHASE UX-02: extended to a small state machine instead of a plain show/hide toggle:
//   showSyncIndicator(true)      -> "جارٍ المزامنة…" (syncing, pulsing dot)
//   showSyncIndicator('success') -> "تمت المزامنة" (green, auto-hides after 2.5s)
//   showSyncIndicator('error')   -> "العمل بالبيانات المحلية" (red, auto-hides after 4s)
//   showSyncIndicator(false)     -> hidden immediately (unchanged legacy behavior)
// The app remains fully usable in every state; this only touches a small pill in
// the topbar, never a screen-covering overlay.
var _syncIndicatorHideTimer=null;
function showSyncIndicator(v){
  // PHASE UX-03: this stays the single entry point for every sync-state
  // transition in the app. It still drives the transient floating pill
  // (#syncIndicator, unchanged behavior below) AND now also drives the
  // persistent topbar status (#topbarLastSync) via _topbarSyncState +
  // updateTopbarSyncMeta() — so the two widgets can never say different
  // things, and no sync event needs to be handled in more than one place.
  var el=document.getElementById('syncIndicator');
  var textEl=el?document.getElementById('syncIndicatorText'):null;
  if(_syncIndicatorHideTimer){clearTimeout(_syncIndicatorHideTimer);_syncIndicatorHideTimer=null;}
  if(_topbarSyncSuccessTimer){clearTimeout(_topbarSyncSuccessTimer);_topbarSyncSuccessTimer=null;}
  if(el)el.classList.remove('success','error');
  if(v===true){
    if(textEl)textEl.textContent='جارٍ المزامنة…';
    if(el)el.classList.add('show');
    _topbarSyncState='syncing';
    if(typeof updateTopbarSyncMeta==='function')updateTopbarSyncMeta();
  }else if(v==='success'){
    if(textEl)textEl.textContent='تمت المزامنة';
    if(el)el.classList.add('show','success');
    _syncIndicatorHideTimer=setTimeout(function(){if(el)el.classList.remove('show','success');},2500);
    // Persistent widget: show the ✅ confirmation for 3s (per spec), then
    // fall back to idle — which recomputes the relative time from the
    // lastSyncAt timestamp the caller already saved (typically "منذ لحظات").
    _topbarSyncState='success';
    if(typeof updateTopbarSyncMeta==='function')updateTopbarSyncMeta();
    _topbarSyncSuccessTimer=setTimeout(function(){
      _topbarSyncState=null;
      if(typeof updateTopbarSyncMeta==='function')updateTopbarSyncMeta();
    },3000);
  }else if(v==='error'){
    if(textEl)textEl.textContent='العمل بالبيانات المحلية';
    if(el)el.classList.add('show','error');
    _syncIndicatorHideTimer=setTimeout(function(){if(el)el.classList.remove('show','error');},4000);
    // Persistent widget: stays on the ⚠️ error state (does not auto-hide,
    // does not get overwritten by the 60s interval) until the next sync
    // attempt calls showSyncIndicator(true) or ('success') again.
    _topbarSyncState='error';
    if(typeof updateTopbarSyncMeta==='function')updateTopbarSyncMeta();
  }else{
    if(el)el.classList.remove('show');
    // v===false: clears only the transient pill (legacy behavior,
    // unchanged). The persistent widget is intentionally left alone —
    // it is about to receive its real state a moment later (success/
    // error) from the same loadFromSheets() call that triggered this.
  }
}

// ==================================================================
// PHASE UX-03 HOTFIX — Professional Last-Sync Status (Top Bar)
// ==================================================================
// Design in one paragraph: #topbarLastSync becomes a small persistent
// status area (Notion/Drive/Dropbox-style) driven by a single state
// variable (_topbarSyncState) and rendered by a single function
// (updateTopbarSyncMeta, below). Every sync event already funnels
// through showSyncIndicator() (PHASE UX-02) — that remains the ONLY
// call site that changes sync state, so the logic is not duplicated
// anywhere else. A single setInterval (60s, text-only, no fetch) keeps
// the relative time ("منذ دقيقة"/"منذ ساعة"/...) fresh while idle.
// Does not touch Repository/Database/Cache/Undo/Boot/Apps Script.
// ==================================================================

// The ONLY function that turns a timestamp into "منذ ..." text. Used by
// updateTopbarSyncMeta() and nowhere else, so phrasing can never drift.
function formatLastSyncRelative(iso){
  if(!iso)return null;
  var then=new Date(iso).getTime();
  if(isNaN(then))return null;
  var diffSec=Math.max(0,Math.floor((Date.now()-then)/1000));
  if(diffSec<60)return'منذ لحظات';
  var m=Math.floor(diffSec/60);
  if(m<60){
    if(m===1)return'منذ دقيقة';
    if(m===2)return'منذ دقيقتين';
    if(m<=10)return'منذ '+m+' دقائق';
    return'منذ '+m+' دقيقة';
  }
  var h=Math.floor(diffSec/3600);
  if(h<24){
    if(h===1)return'منذ ساعة';
    if(h===2)return'منذ ساعتين';
    if(h<=10)return'منذ '+h+' ساعات';
    return'منذ '+h+' ساعة';
  }
  var d=Math.floor(diffSec/86400);
  if(d===1)return'منذ يوم';
  if(d===2)return'منذ يومين';
  if(d<=10)return'منذ '+d+' أيام';
  return'منذ '+d+' يوم';
}

// 'syncing' | 'success' | 'error' | null(=idle, show relative time / local-data fallback)
var _topbarSyncState=null;
var _topbarSyncSuccessTimer=null;
var _topbarSyncIntervalStarted=false;

// PHASE 12.6B §14/§15 — Adaptive TopBar sync status (never hidden).
// Previously #topbarLastSync lived inside .topbar-meta, which mobile's
// `display:none` rule hid ENTIRELY (see css/responsive.css) — the exact
// bug this phase closes. The fix is NOT to keep forcing it visible with
// one long string; it's to render THREE ready-made text variants (full /
// compact / chip) into three sibling spans every time state changes, and
// let CSS (see .tls-full/.tls-compact/.tls-chip media queries in
// css/components.css) pick exactly one per breakpoint. No resize
// listener, no layout thrash — plain CSS `display` toggling.
// This is the ONLY function that writes to #topbarLastSync's children.
function updateTopbarSyncMeta(){
  var dot=document.getElementById('topbarConnDot'),tx=document.getElementById('topbarConnText');
  if(dot&&tx){
    if(API_URL){dot.classList.add('connected');dot.classList.remove('error');tx.textContent='متصل بـ Sheets';}
    else{dot.classList.remove('connected','error');tx.textContent='محلي فقط';}
  }
  var fullEl=document.getElementById('tlsFull');
  var compactEl=document.getElementById('tlsCompact');
  var chipDotEl=document.getElementById('tlsChipDot');
  var chipTextEl=document.getElementById('tlsChipText');
  var lsEl=document.getElementById('topbarLastSync');
  if(lsEl&&fullEl&&compactEl&&chipDotEl&&chipTextEl){
    lsEl.classList.remove('is-syncing','is-success','is-error','is-idle','is-neversynced');
    var state=_topbarSyncState;
    var full,compact,chipText,chipClass,stateClass;
    if(state==='syncing'){
      full='🟡 جارٍ المزامنة...';compact='🟡 جارٍ...';chipText='جارٍ...';chipClass='tls-dot-syncing';stateClass='is-syncing';
    }else if(state==='success'){
      full='✅ تمت المزامنة';compact='✓ تمت المزامنة';chipText='الآن';chipClass='tls-dot-success';stateClass='is-success';
    }else if(state==='error'){
      full='⚠️ تعذر الاتصال — العمل بالبيانات المحلية';compact='🔴 محلي';chipText='محلي';chipClass='tls-dot-error';stateClass='is-error';
    }else{
      var ts=localStorage.getItem('lastSyncAt');
      var rel=formatLastSyncRelative(ts);
      if(rel){
        full='🕒 آخر مزامنة '+rel;compact='✓ '+rel;chipText=rel;chipClass='tls-dot-success';stateClass='is-idle';
      }else{
        full='📂 آخر مزامنة — من البيانات المحلية';compact='⚪ لم تتم';chipText='لم تتم';chipClass='tls-dot-neversynced';stateClass='is-neversynced';
      }
    }
    fullEl.textContent=full;
    compactEl.textContent=compact;
    chipTextEl.textContent=chipText;
    chipDotEl.className='tls-chip-dot '+chipClass;
    lsEl.classList.add(stateClass);
  }
  var nameEl=document.getElementById('topbarUserName');
  if(nameEl){
    var uname=localStorage.getItem('userName');
    if(uname){nameEl.textContent=uname;nameEl.style.display='';}
    else nameEl.style.display='none';
  }
  // Single interval, started once, browser-only: re-renders the relative
  // text every 60s while idle. No fetch, no request, no state mutation —
  // just calls this same function again.
  if(!_topbarSyncIntervalStarted&&typeof window!=='undefined'&&typeof window.setInterval==='function'){
    _topbarSyncIntervalStarted=true;
    window.setInterval(function(){
      if(_topbarSyncState===null)updateTopbarSyncMeta();
    },60000);
  }
}

// PHASE 12.4B — INSTANT STARTUP HOTFIX
// Local data is already rendered before this runs (see DOMContentLoaded in index.html).
// This function must NEVER block the UI: no full-screen overlay, requests run in parallel
// (not sequentially), each with a timeout, and failures never clear local data or freeze startup.
async function loadFromSheets(){
  if(!API_URL)return;
  showSyncIndicator(true);
  var pairs=[['القضايا','cases'],['الجلسات','sessions'],['الموكلين','clients'],['الأطفال','children'],['المستندات','documents'],['المهام','tasks'],['الأتعاب','fees']];
  var results=await Promise.all(pairs.map(async function(pair){
    var sh=pair[0],k=pair[1];
    try{
      var r=await fetch(API_URL+'?sheet='+encodeURIComponent(sh),{signal:AbortSignal.timeout(8000)});
      var arr=await r.json();
      if(Array.isArray(arr)&&arr.length>0){
        if(sh==='الجلسات'){arr=arr.map(function(row){if(row['الوقت'])row['الوقت']=sanitizeTime(row['الوقت']);return row;});}
        data[k]=arr;
        localStorage.setItem(k,JSON.stringify(arr));
        return 'loaded';
      }
      return 'empty';
    }catch(e){
      console.warn('Load '+sh+':',e);
      return 'failed';
    }
  }));
  showSyncIndicator(false);
  var loaded=results.filter(function(r){return r==='loaded';}).length;
  var failed=results.filter(function(r){return r==='failed';}).length;
  if(loaded>0){
    updateBadges();renderDashboard();
    localStorage.setItem('lastSyncAt',new Date().toISOString());
    if(typeof updateTopbarSyncMeta==='function')updateTopbarSyncMeta();
    showSyncIndicator('success');
    toast('تم تحديث البيانات من Sheets ('+loaded+' أوراق)','success');
  }else if(failed===pairs.length){
    // Total sync failure (offline / Apps Script unreachable): keep working on local data.
    showSyncIndicator('error');
    toast('تعذرت المزامنة مع Sheets — العمل بالبيانات المحلية','error');
  }else{
    localStorage.setItem('lastSyncAt',new Date().toISOString());
    if(typeof updateTopbarSyncMeta==='function')updateTopbarSyncMeta();
    showSyncIndicator('success');
    toast('الاتصال نجح — لا توجد بيانات جديدة في الأوراق','info');
  }
}

async function refreshAll(){if(API_URL)await loadFromSheets();else toast('أضف رابط Apps Script في الإعدادات للمزامنة السحابية','info');renderDashboard();}

// ==================================================================
// Node/test export (browser: `module` is undefined, this is a no-op —
// every function above remains a plain global exactly as before).
// PHASE UX-03: exposes formatLastSyncRelative for the pure-function
// test harness (js/tests/verify_topbar_sync_status.js).
// ==================================================================
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    formatLastSyncRelative: formatLastSyncRelative
  };
}
