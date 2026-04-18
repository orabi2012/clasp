// ============================================================
// 01_Setup.gs
// Configuration constants & one-time setup
// ============================================================

// ── Drive Folder IDs ──────────────────────────────────────────
const TEMPLATE_FOLDER_ID  = '1kvgxJN72BwUPuo3Pz0Zd92tYLjP9YsqA';
const CLIENTS_FOLDER_ID   = '1xxNaC69sPg6ByM370ETpzdDgiEqUCxgC';
const EMPLOYEES_FOLDER_ID = '1gXaQQUCpEYq3fjFtUYy2jp5YlEVFpcnn';

// ── Folder Names ──────────────────────────────────────────────
const FOLDER_UPLOADS = 'uploads';
const FOLDER_RESULTS = 'results';
const FOLDER_STAGE   = 'stage';

// ── Sheet Names ───────────────────────────────────────────────
const CUSTOMERS_SHEET_NAME = 'customers';
const EMPLOYEES_SHEET_NAME = 'employees';

// ── Column Indices (1-based) ──────────────────────────────────
const COL_EMP_FOLDER_URL = 6;  // F — employee folder URL
const COL_NAME           = 3;  // C — client name
const COL_EMAIL          = 2;  // B — client email
const COL_EMPLOYEE       = 11; // K — assigned employee
const COL_FOLDER_URL     = 12; // L — client folder URL
const COL_FOLDER_ID      = 13; // M — client folder ID
const COL_PREV_EMPLOYEE  = 14; // N — previously assigned employee
const COL_DATE_ZAKAT     = 9;  // I — next zakat declaration date
const COL_DATE_TAX       = 10; // J — next tax declaration date

// ── Branding ──────────────────────────────────────────────────
const COMPANY_NAME     = 'Statix';
const COMPANY_URL      = 'https://statix-sa.com/ar';
const COMPANY_LOGO_URL = 'https://api.statix-sa.com/storage/logos/01KGES5RKAA6SVXNWR1QSDAC1M.png';

// ── Calendar ──────────────────────────────────────────────────
const CALENDAR_REMINDER_DAYS = 7;

// ── Upload Monitoring ─────────────────────────────────────────
const UPLOAD_CHECK_MINUTES = 5;

// ── Month Names for Folder Structure ─────────────────────────
const MONTH_NAMES = [
  '01-January', '02-February', '03-March',
  '04-April',   '05-May',      '06-June',
  '07-July',    '08-August',   '09-September',
  '10-October', '11-November', '12-December'
];

// ─────────────────────────────────────────────────────────────

function setupAll() {
  setupHeaders();
  setupTriggers();
  Logger.log('All setup completed');
}

function setupHeaders() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet()
    .getSheetByName(CUSTOMERS_SHEET_NAME);

  sheet.getRange(1, COL_FOLDER_URL).setValue('folder_url');
  sheet.getRange(1, COL_FOLDER_ID).setValue('folder_id');
  sheet.getRange(1, COL_PREV_EMPLOYEE).setValue('prev_employee');

  Logger.log('Headers updated');
}

function setupTriggers() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    ScriptApp.deleteTrigger(t);
  });

  ScriptApp.newTrigger('onEmployeeAssigned')
    .forSpreadsheet(SpreadsheetApp.getActiveSpreadsheet())
    .onEdit()
    .create();

  ScriptApp.newTrigger('onDateChanged')
    .forSpreadsheet(SpreadsheetApp.getActiveSpreadsheet())
    .onEdit()
    .create();

  ScriptApp.newTrigger('checkUploadsForNewFiles')
    .timeBased()
    .everyMinutes(UPLOAD_CHECK_MINUTES)
    .create();

  Logger.log('Triggers ready');
}

function resetUploadCheckTimestamp() {
  PropertiesService.getScriptProperties().deleteProperty('lastUploadCheck');
  Logger.log('Upload check timestamp reset — next run will set a new baseline');
}

function setupTemplateYear(year) {
  const templateFolder = DriveApp.getFolderById(TEMPLATE_FOLDER_ID);

  getOrCreateSubfolder_(templateFolder, FOLDER_UPLOADS);
  getOrCreateSubfolder_(templateFolder, FOLDER_RESULTS);
  const stageFolder = getOrCreateSubfolder_(templateFolder, FOLDER_STAGE);
  const yearFolder  = getOrCreateSubfolder_(stageFolder, String(year));

  for (let m = 0; m < MONTH_NAMES.length; m++) {
    const monthFolder = getOrCreateSubfolder_(yearFolder, MONTH_NAMES[m]);
    const daysInMonth = new Date(year, m + 1, 0).getDate();

    for (let day = 1; day <= daysInMonth; day++) {
      getOrCreateSubfolder_(monthFolder, String(day).padStart(2, '0'));
    }

    Utilities.sleep(200);
  }

  Logger.log('Year ' + year + ' done');
}

function setupPreviousYear() { setupTemplateYear(new Date().getFullYear() - 1); }
function setupCurrentYear()  { setupTemplateYear(new Date().getFullYear()); }
function setupNextYear()     { setupTemplateYear(new Date().getFullYear() + 1); }

function fillExistingEmployeeFolderUrls() {
  const ss        = SpreadsheetApp.getActiveSpreadsheet();
  const empSheet  = ss.getSheetByName(EMPLOYEES_SHEET_NAME);
  const empFolder = DriveApp.getFolderById(EMPLOYEES_FOLDER_ID);
  const data      = empSheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    const name = data[i][0];
    if (!name) continue;

    const folderName = name.replace(/\s+/g, '_');
    const iter       = empFolder.getFoldersByName(folderName);

    if (iter.hasNext()) {
      empSheet.getRange(i + 1, COL_EMP_FOLDER_URL).setValue(iter.next().getUrl());
      Logger.log('Found: ' + name);
    } else {
      Logger.log('Missing folder: ' + name);
    }
  }
}

// ── Web App ───────────────────────────────────────────────────

function doGet(e) {
  // Email duplicate check: ?action=check&email=xxx
  if (e && e.parameter && e.parameter.action === 'check') {
    var email = (e.parameter.email || '').toLowerCase().trim();
    var ss    = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(CUSTOMERS_SHEET_NAME);
    var exists = false;
    if (sheet && sheet.getLastRow() > 1) {
      var emails = sheet.getRange(2, 2, sheet.getLastRow() - 1, 1).getValues(); // column B
      exists = emails.some(function(row) { return (row[0] || '').toLowerCase().trim() === email; });
    }
    return ContentService.createTextOutput(JSON.stringify({ exists: exists }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  return ContentService.createTextOutput(JSON.stringify({ error: 'Use the Netlify form.' }))
    .setMimeType(ContentService.MimeType.JSON);
}

function submitClient(data) {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CUSTOMERS_SHEET_NAME);
  if (!sheet) throw new Error('Sheet not found: ' + CUSTOMERS_SHEET_NAME);
  sheet.appendRow([
    new Date(),     // A - Timestamp
    data.email,     // B - Email Address
    data.name,      // C - الاسم
    data.phone,     // D - رقم الهاتف
    data.taxNumber, // E - الرقم الضريبي
    data.crNumber,  // F - الرقم المميز
    data.date1,     // G - تاريخ اول اقرار ضريبي
    data.date2,     // H - تاريخ السجل التجاري
    data.date3,     // I - تاريخ تقديم الاقرار الضريبي القادم
    data.date4      // J - تاريخ تقديم الاقرار الزكوي القادم
  ]);
}

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    submitClient(data);
    return ContentService.createTextOutput(JSON.stringify({ status: 'ok' }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}