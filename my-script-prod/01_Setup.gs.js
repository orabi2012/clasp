// ============================================================
// 01_Setup.gs
// Configuration constants & one-time setup
// ============================================================

// ── Drive Folder IDs ──────────────────────────────────────────
const TEMPLATE_FOLDER_ID  = '1gGI4KXlKPEYWA6ks8MdT_Hft51YvHtB3';
const CLIENTS_FOLDER_ID   = '1a5RXhBBS_jwQonPAjKeX1oKekR_EtebJ';
const EMPLOYEES_FOLDER_ID = '1BMi2VbEsx6yFl3Bw5u0ZqoqCkvyk6fSa';

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
const COL_LANG           = 11; // K — client language (ar/en)
const COL_EMPLOYEE       = 12; // L — assigned employee
const COL_FOLDER_URL     = 13; // M — client folder URL
const COL_FOLDER_ID      = 14; // N — client folder ID
const COL_PREV_EMPLOYEE  = 15; // O — previously assigned employee
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
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CUSTOMERS_SHEET_NAME);

  const NUM_COLS = 15;
  const headerRow = sheet.getRange(1, 1, 1, NUM_COLS);

  // ── Write header labels ───────────────────────────────────
  headerRow.setValues([[
    'Timestamp',         // A
    'Email Address',     // B
    'الاسم',            // C
    'رقم الهاتف',       // D
    'الرقم الضريبي',    // E
    'الرقم المميز',     // F
    'تاريخ اول اقرار ضريبي',              // G
    'تاريخ السجل التجاري',                // H
    'تاريخ تقديم الاقرار الضريبي القادم', // I
    'تاريخ تقديم الاقرار الزكوي القادم',  // J
    'lang',              // K - COL_LANG
    'assined_employee',  // L - COL_EMPLOYEE
    'folder_url',        // M - COL_FOLDER_URL
    'folder_id',         // N - COL_FOLDER_ID
    'prev_employee'      // O - COL_PREV_EMPLOYEE
  ]]);

  // ── Header row styling ────────────────────────────────────
  headerRow
    .setBackground('#1a73e8')       // Google-blue header
    .setFontColor('#ffffff')
    .setFontWeight('bold')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');
  sheet.setRowHeight(1, 32);

  // ── Alternating row colours for data rows ─────────────────
  const totalRows = sheet.getMaxRows();
  for (var r = 2; r <= totalRows; r++) {
    sheet.getRange(r, 1, 1, NUM_COLS)
      .setBackground(r % 2 === 0 ? '#e8f0fe' : '#ffffff');
  }

  // ── Borders on full table ──────────────────────────────────
  sheet.getRange(1, 1, totalRows, NUM_COLS)
    .setBorder(true, true, true, true, true, true,
               '#c0c0c0', SpreadsheetApp.BorderStyle.SOLID);

  // ── Freeze header row ─────────────────────────────────────
  sheet.setFrozenRows(1);

  // ── Auto-resize all columns ───────────────────────────────
  for (var c = 1; c <= NUM_COLS; c++) {
    sheet.autoResizeColumn(c);
  }

  // ── Data validations ─────────────────────────────────────
  const lastRow = totalRows - 1;

  // lang column (K) → ar / en
  var langRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['ar', 'en'], true)
    .setAllowInvalid(false)
    .build();
  sheet.getRange(2, COL_LANG, lastRow, 1).setDataValidation(langRule);

  // assined_employee column (L) → names from employees sheet col A
  var empSheet   = ss.getSheetByName(EMPLOYEES_SHEET_NAME);
  var empLastRow = empSheet.getLastRow();
  if (empLastRow > 1) {
    var empRule = SpreadsheetApp.newDataValidation()
      .requireValueInRange(empSheet.getRange('A2:A' + empLastRow), true)
      .setAllowInvalid(false)
      .build();
    sheet.getRange(2, COL_EMPLOYEE, lastRow, 1).setDataValidation(empRule);
  }

  // ── Chip-style for folder_url column (M) ─────────────────
  sheet.getRange(2, COL_FOLDER_URL, lastRow, 1)
    .setBackground('#e8f0fe')
    .setFontColor('#1967d2')
    .setHorizontalAlignment('center')
    .setFontSize(10);

  Logger.log('Headers updated');
}

/**
 * Writes a folder URL into column M as a clickable '📁 Open Folder' chip.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {number} row   1-based row index
 * @param {string} url   The folder URL
 */
function setFolderUrlChip_(sheet, row, url) {
  var label = '📁 Open Folder';
  var rv = SpreadsheetApp.newRichTextValue()
    .setText(label)
    .setLinkUrl(0, label.length, url)
    .build();
  sheet.getRange(row, COL_FOLDER_URL).setRichTextValue(rv);
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
  var lang = data.lang || 'ar';
  sheet.appendRow([
    new Date(),          // A - Timestamp
    data.email,          // B - Email Address
    data.name,           // C - الاسم
    data.phone,          // D - رقم الهاتف
    data.taxNumber,      // E - الرقم الضريبي
    data.crNumber,       // F - الرقم المميز
    data.date1,          // G - تاريخ اول اقرار ضريبي
    data.date2,          // H - تاريخ السجل التجاري
    data.date3,          // I - تاريخ تقديم الاقرار الضريبي القادم
    data.date4,          // J - تاريخ تقديم الاقرار الزكوي القادم
    lang                 // K - Client language (ar/en)
  ]);

  // Style the new row's lang cell
  var newRow = sheet.getLastRow();
  var langCell = sheet.getRange(newRow, COL_LANG);
  langCell
    .setBackground(lang === 'ar' ? '#e8f0fe' : '#fce8e6')
    .setFontColor(lang === 'ar' ? '#1967d2' : '#c5221f')
    .setFontWeight('bold')
    .setHorizontalAlignment('center');

  // Alternating row background for the rest of the row
  var bg = newRow % 2 === 0 ? '#e8f0fe' : '#ffffff';
  sheet.getRange(newRow, 1, 1, 15).setBackground(bg);
  // Re-apply lang cell styling on top
  langCell
    .setBackground(lang === 'ar' ? '#e8f0fe' : '#fce8e6')
    .setFontColor(lang === 'ar' ? '#1967d2' : '#c5221f')
    .setFontWeight('bold')
    .setHorizontalAlignment('center');
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