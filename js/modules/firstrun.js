// ==================================================================
// FIRST RUN MODULE — js/modules/firstrun.js
// Added in PHASE UX-01 (First Run Experience + Branding + Onboarding)
// ==================================================================
// SCOPE: UI only. Does not read/write Repository, DatabaseService,
// StorageAdapter, LocalStorageAdapter, UndoManager, or any Cache/Sync
// internals. Only touches:
//   - localStorage keys 'apiUrl' (already an existing, pre-existing key
//     written by saveApiUrl()/testConnection() in settings.js — this
//     file writes the exact same key, nothing new)
//   - the global API_URL variable (declared in index.html's inline
//     bootstrap script)
//   - DOM elements added in index.html for the splash screen and the
//     first-run wizard (#splashScreen, #firstRunWizard, and children)
//
// LOAD ORDER REQUIREMENT: must load after the main inline <script>
// block in index.html (needs API_URL, toast(), data) and after
// settings.js (calls its updateConnectionStatus()/loadFromSheets() if
// present, both guarded with typeof checks so this file degrades
// gracefully even if settings.js were ever reordered).
// ==================================================================

// Record the moment this file was parsed — used as the splash's
// "start" timestamp so the minimum-visible-time calculation below is
// accurate even though DOMContentLoaded fires slightly later.
window.__splashStart = window.__splashStart || Date.now();

// Hard safety cap: the splash must never stay up longer than 1.5s,
// even in an edge case where DOMContentLoaded is delayed. This never
// waits on Google Sheets/API sync — loadFromSheets() already runs
// fully in the background (Promise.all + per-request timeout, see
// settings.js) and is never awaited here.
setTimeout(function () {
  hideSplashAndCheckFirstRun();
}, 1500);

window.addEventListener('DOMContentLoaded', function () {
  // The inline bootstrap script's own DOMContentLoaded listener (which
  // renders local data: updateBadges()/renderDashboard()) is
  // registered before this one (it is declared earlier in the
  // document), so by the time this listener runs, local data is
  // already on screen. We only add a small minimum-visible-time so the
  // splash reads as an intentional brand moment rather than a flicker,
  // capped well under the 1.5s ceiling above.
  var MIN_VISIBLE_MS = 450;
  var elapsed = Date.now() - window.__splashStart;
  var remaining = Math.max(0, MIN_VISIBLE_MS - elapsed);
  setTimeout(function () {
    hideSplashAndCheckFirstRun();
  }, remaining);
});

function hideSplashAndCheckFirstRun() {
  var splash = document.getElementById('splashScreen');
  if (splash && !splash.classList.contains('splash-hide')) {
    splash.classList.add('splash-hide');
  }
  checkFirstRunWizard();
}

// Shows the wizard whenever no Google Apps Script URL is saved yet —
// including if the user (or Settings page "مسح البيانات") removes it
// later and the app is reloaded, per the phase brief.
function checkFirstRunWizard() {
  var wiz = document.getElementById('firstRunWizard');
  if (!wiz) return;
  if (!API_URL) {
    wiz.classList.add('open');
  } else {
    wiz.classList.remove('open');
  }
}

async function wizardTestConnection() {
  var input = document.getElementById('wizardApiUrlInput');
  var url = input ? input.value.trim() : '';
  var res = document.getElementById('firstRunResult');
  if (!url) {
    if (res) res.innerHTML = '<span style="color:var(--danger)">أدخل الرابط أولاً</span>';
    return;
  }
  if (res) res.innerHTML = '<span style="color:var(--muted)">&#9203; جارٍ الاتصال...</span>';
  try {
    var r = await fetch(url + '?action=setup', { signal: AbortSignal.timeout(30000) });
    var d = await r.json();
    if (d && d.status === 'ok') {
      if (res) res.innerHTML = '<span style="color:var(--success)">&#10003; تم الاتصال بنجاح.</span>';
    } else {
      if (res) res.innerHTML = '<span style="color:var(--danger)">&#10007; تعذر الاتصال. راجع الرابط ثم حاول مرة أخرى.</span>';
    }
  } catch (e) {
    if (res) res.innerHTML = '<span style="color:var(--danger)">&#10007; تعذر الاتصال. راجع الرابط ثم حاول مرة أخرى.</span>';
  }
}

// Saves the URL (if any) and starts the app immediately in place —
// no page reload. The dashboard underneath is already fully rendered
// from local data, so closing the wizard is all that's needed.
function wizardSaveAndStart() {
  var input = document.getElementById('wizardApiUrlInput');
  var url = input ? input.value.trim() : '';
  if (url) {
    API_URL = url;
    localStorage.setItem('apiUrl', url);
    if (typeof updateConnectionStatus === 'function') updateConnectionStatus();
    // Let the wizard close first, then sync quietly in the background
    // — same non-blocking pattern loadFromSheets() already uses.
    setTimeout(function () {
      if (typeof loadFromSheets === 'function') loadFromSheets();
    }, 500);
  }
  closeFirstRunWizard();
  if (typeof toast === 'function') {
    toast(url ? 'تم الحفظ — جارٍ بدء البرنامج' : 'تم بدء البرنامج', 'success');
  }
}

// Not part of the literal phase brief, but included so an offline-only
// user (a scenario the wizard's own privacy text describes as fully
// supported) is never blocked from the app on first run. Session-only:
// since no 'apiUrl' is written, the wizard will correctly reappear on
// the next load per checkFirstRunWizard() above — flagged in
// docs/UX_First_Run_Report.md for explicit approval.
function wizardSkip() {
  closeFirstRunWizard();
  if (typeof toast === 'function') {
    toast('يمكنك ربط Google Sheets لاحقاً من صفحة الإعدادات', 'info');
  }
}

function closeFirstRunWizard() {
  var wiz = document.getElementById('firstRunWizard');
  if (wiz) wiz.classList.remove('open');
}
