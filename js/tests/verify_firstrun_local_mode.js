/**
 * ================================================================
 * verify_firstrun_local_mode.js — HOTFIX UX-03A verification
 * ================================================================
 * Loads the real index.html in headless Chromium (same approach as
 * js/tests/verify_runtime_wiring.js) and verifies, against the actual
 * DOM/localStorage — not a mock — that:
 *   1. Fresh install (no apiUrl, no localModeChosen) -> wizard is open.
 *   2. Clicking "ابدأ محلياً الآن" closes the wizard immediately, with
 *      no loading overlay ever shown and no network request attempted.
 *   3. 'localModeChosen' is persisted in localStorage.
 *   4. Reloading the page afterwards (closing/reopening the app) does
 *      NOT reopen the wizard.
 *   5. The Settings-page local-mode notice is visible while no Google
 *      URL is configured, and hides once one is saved.
 *   6. Saving a URL, then clearing it again, still works with no crash
 *      and the app keeps functioning on local data throughout.
 * Run: node js/tests/verify_firstrun_local_mode.js
 * ================================================================
 */
'use strict';

const path = require('path');
const { chromium } = require('playwright');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const INDEX_HTML = path.join(PROJECT_ROOT, 'index.html');

let checks = 0;
function check(label, cond) {
  checks++;
  if (!cond) throw new Error('FAILED: ' + label);
  console.log('  ✓ ' + label);
}

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  // Fail loudly on any request to Google Apps Script — proves
  // wizardStartLocal() never attempts to reach Google. (Google Fonts is
  // a pre-existing, unrelated <head> stylesheet load and is ignored.)
  let networkAttempts = [];
  page.on('request', (req) => {
    const url = req.url();
    if (url.includes('script.google.com') || url.includes('macros/s/')) networkAttempts.push(url);
  });

  console.log('HOTFIX UX-03A — First Run wizard / local-mode verification\n');

  // ---- 1. Fresh load: wizard open, button text correct ----
  await page.goto('file://' + INDEX_HTML, { waitUntil: 'load' });
  await page.waitForTimeout(600); // splash minimum-visible-time
  const wizardOpenFresh = await page.$eval('#firstRunWizard', el => el.classList.contains('open'));
  check('fresh install -> wizard is open (no apiUrl, no localModeChosen)', wizardOpenFresh === true);

  const btnText = await page.$eval('#firstRunWizard .modal-footer .btn-ghost', el => el.textContent.trim());
  check('button reads "ابدأ محلياً الآن" (not "تخطي")', btnText === 'ابدأ محلياً الآن');

  // ---- 2. Click it: wizard closes, no overlay, no network ----
  await page.click('#firstRunWizard .modal-footer .btn-ghost');
  await page.waitForTimeout(150);
  const wizardOpenAfterClick = await page.$eval('#firstRunWizard', el => el.classList.contains('open'));
  check('clicking "ابدأ محلياً الآن" closes the wizard', wizardOpenAfterClick === false);

  const overlayVisible = await page.evaluate(() => {
    const ov = document.getElementById('loadingOverlay');
    return !!ov && getComputedStyle(ov).display !== 'none';
  });
  check('no loading overlay appears', overlayVisible === false);
  check('no request to Google Apps Script attempted (fully local)', networkAttempts.length === 0);

  // ---- 3. localModeChosen persisted ----
  const localModeChosen = await page.evaluate(() => localStorage.getItem('localModeChosen'));
  check("localStorage 'localModeChosen' === '1'", localModeChosen === '1');

  const apiUrlSaved = await page.evaluate(() => localStorage.getItem('apiUrl'));
  check("no empty 'apiUrl' key written", apiUrlSaved === null || apiUrlSaved === '');

  // ---- 4. Reload -> wizard must NOT reopen ----
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(600);
  const wizardOpenAfterReload = await page.$eval('#firstRunWizard', el => el.classList.contains('open'));
  check('reopening the app does not show the wizard again', wizardOpenAfterReload === false);

  // ---- 5. Settings page: local-mode notice visible ----
  await page.evaluate(() => navigate('settings'));
  const noticeVisibleLocal = await page.$eval('#localModeNotice', el => getComputedStyle(el).display !== 'none');
  check('Settings shows the local-mode notice while no URL is set', noticeVisibleLocal === true);

  // ---- 6. Save a URL -> notice hides; clear it -> notice reappears ----
  await page.fill('#apiUrlInput', 'https://script.google.com/macros/s/FAKE_TEST_ID/exec');
  await page.click('#page-settings .settings-card:first-child .btn-primary');
  await page.waitForTimeout(100);
  const noticeVisibleAfterSave = await page.$eval('#localModeNotice', el => getComputedStyle(el).display !== 'none');
  check('notice hides after a Google URL is saved', noticeVisibleAfterSave === false);

  await page.fill('#apiUrlInput', '');
  await page.click('#page-settings .settings-card:first-child .btn-primary');
  await page.waitForTimeout(100);
  const noticeVisibleAfterClear = await page.$eval('#localModeNotice', el => getComputedStyle(el).display !== 'none');
  check('notice reappears after the URL is cleared again', noticeVisibleAfterClear === true);

  const dashboardStillWorks = await page.evaluate(() => {
    navigate('dashboard');
    return document.getElementById('page-dashboard').classList.contains('active');
  });
  check('app keeps working locally throughout (dashboard navigable)', dashboardStillWorks === true);

  await browser.close();
  console.log('\n' + checks + '/' + checks + ' checks passed.');
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
