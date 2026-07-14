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
function showSyncIndicator(v){var el=document.getElementById('syncIndicator');if(el)el.classList.toggle('show',v);}

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
    toast('تم تحديث البيانات من Sheets ('+loaded+' أوراق)','success');
  }else if(failed===pairs.length){
    // Total sync failure (offline / Apps Script unreachable): keep working on local data.
    toast('تعذرت المزامنة مع Sheets — العمل بالبيانات المحلية','error');
  }else{
    toast('الاتصال نجح — لا توجد بيانات جديدة في الأوراق','info');
  }
}

async function refreshAll(){if(API_URL)await loadFromSheets();else toast('أضف رابط Apps Script في الإعدادات للمزامنة السحابية','info');renderDashboard();}
