// ============================================================
// 01_Setup.gs
// Configuration constants & one-time setup
// ============================================================
//08:27pm 2026-04-19
// ── Drive Folder IDs ──────────────────────────────────────────
const TEMPLATE_FOLDER_ID  = '1kvgxJN72BwUPuo3Pz0Zd92tYLjP9YsqA';
const CLIENTS_FOLDER_ID   = '1xxNaC69sPg6ByM370ETpzdDgiEqUCxgC';
const EMPLOYEES_FOLDER_ID   = '1gXaQQUCpEYq3fjFtUYy2jp5YlEVFpcnn';
const SUPERVISORS_FOLDER_ID = '1B3XQAZC4Ho6b7Ey4zsdW7hvxVrQg0fRO'; // ← create parent folder in Drive and fill in per environment

// ── Folder Names ──────────────────────────────────────────────
const FOLDER_UPLOADS    = 'uploads';
const FOLDER_RESULTS    = 'results';
const FOLDER_STAGE      = 'stage';
const FOLDER_GUIDELINES = 'help';

// ── Sheet Names ───────────────────────────────────────────────
const CUSTOMERS_SHEET_NAME      = 'customers';
const EMPLOYEES_SHEET_NAME      = 'employees';
const SUPERVISORS_SHEET_NAME    = 'supervisors';
const WORKFLOW_SHEET_NAME       = 'workflow';
const WORKFLOW_AUDIT_SHEET_NAME = 'workflow_audit';

// ── Column Indices (1-based) ──────────────────────────────────
// Customers sheet
const COL_NAME           = 3;  // C — client name
const COL_EMAIL          = 2;  // B — client email
const COL_LANG           = 11; // K — client language (ar/en)
const COL_EMPLOYEE       = 12; // L — assigned employee
const COL_FOLDER_URL     = 13; // M — client folder URL
const COL_FOLDER_ID      = 14; // N — client folder ID
const COL_PREV_EMPLOYEE  = 15; // O — previously assigned employee
const COL_DATE_TAX       = 9;  // I — next tax declaration date
const COL_DATE_ZAKAT     = 10; // J — next zakat declaration date

// Employees sheet
const COL_EMP_NAME            = 1; // A — name
const COL_EMP_JOB             = 2; // B — job title
const COL_EMP_EMAIL           = 3; // C — email
const COL_EMP_PHONE           = 4; // D — phone
const COL_EMP_SUPERVISOR      = 5; // E — assigned supervisor (dropdown from supervisors sheet)
const COL_EMP_FOLDER_URL      = 6; // F — employee Drive folder URL
const COL_EMP_PREV_SUPERVISOR = 7; // G — previous supervisor name (for shortcut move)

// Supervisors sheet
const COL_SUP_NAME       = 1; // A — name
const COL_SUP_JOB        = 2; // B — job title
const COL_SUP_EMAIL      = 3; // C — email
const COL_SUP_PHONE      = 4; // D — phone
const COL_SUP_FOLDER_URL = 5; // E — supervisor Drive folder URL

// ── Branding ──────────────────────────────────────────────────
const COMPANY_NAME     = 'Statix';
const COMPANY_URL      = 'https://statix-sa.com/ar';
const COMPANY_LOGO_URL = 'https://api.statix-sa.com/storage/logos/01KGES5RKAA6SVXNWR1QSDAC1M.png';

// ── Calendar ──────────────────────────────────────────────────
const CALENDAR_REMINDER_DAYS = 7;

// ── Upload Monitoring ─────────────────────────────────────────
const UPLOAD_CHECK_MINUTES    = 5;

// ── Supervisor Notification Batch ─────────────────────────────
const SUPERVISOR_NOTIFY_HOURS = 4; // hours between pending-submission digest emails to supervisors

// ── Workflow Sheet ────────────────────────────────────────────
// workflow columns (1-based)
const WF_COL_ID              = 1;  // A — uuid
const WF_COL_CLIENT_FID      = 2;  // B — clientFolderId
const WF_COL_CLIENT_NAME     = 3;  // C
const WF_COL_CLIENT_EMAIL    = 4;  // D
const WF_COL_CLIENT_LANG     = 5;  // E
const WF_COL_EMP_NAME        = 6;  // F
const WF_COL_EMP_EMAIL       = 7;  // G
const WF_COL_SUP_NAME_WF     = 8;  // H
const WF_COL_SUP_EMAIL_WF    = 9;  // I
const WF_COL_YEAR            = 10; // J
const WF_COL_MONTH           = 11; // K
const WF_COL_DAY             = 12; // L
const WF_COL_FILE_NAME       = 13; // M
const WF_COL_FILE_URL        = 14; // N
const WF_COL_UPLOADED_AT     = 15; // O
const WF_COL_FINISHED        = 16; // P
const WF_COL_NOTE            = 17; // Q
const WF_COL_STATUS          = 18; // R — new|in_progress|submitted|approved_sent|returned
const WF_COL_SUBMITTED_AT    = 19; // S
const WF_COL_SENT_AT         = 20; // T
const WF_COL_RETURN_COUNT    = 21; // U
const WF_COL_LAST_RETURN_NOTE= 22; // V
const WF_COL_LAST_UPDATED    = 23; // W
const WF_NUM_COLS            = 23;

// workflow_audit columns (1-based)
const WFA_COL_TIMESTAMP   = 1; // A
const WFA_COL_ACTOR       = 2; // B
const WFA_COL_ACTION      = 3; // C
const WFA_COL_WF_ID       = 4; // D
const WFA_COL_CLIENT_NAME = 5; // E
const WFA_COL_FILE_NAME   = 6; // F
const WFA_COL_DETAILS     = 7; // G

// ── Month Names for Folder Structure ─────────────────────────
const MONTH_NAMES = [
  '01-January', '02-February', '03-March',
  '04-April',   '05-May',      '06-June',
  '07-July',    '08-August',   '09-September',
  '10-October', '11-November', '12-December'
];

// ── Required subfolders in every client/template folder ──────
const REQUIRED_SUBFOLDERS = [
  FOLDER_UPLOADS,
  FOLDER_RESULTS,
  FOLDER_STAGE,
  FOLDER_GUIDELINES,
];

// ─────────────────────────────────────────────────────────────

/**
 * Ensures all required subfolders exist inside the template folder.
 * Run once manually from the Apps Script editor when needed.
 */
function ensureTemplateFolders() {
  const templateFolder = DriveApp.getFolderById(TEMPLATE_FOLDER_ID);
  ensureFolders_(templateFolder);
  Logger.log('Template folder check complete.');
}

/**
 * Creates any missing required subfolders inside the given folder.
 * @param {GoogleAppsScript.Drive.Folder} parentFolder
 */
function ensureFolders_(parentFolder) {
  for (var i = 0; i < REQUIRED_SUBFOLDERS.length; i++) {
    var name = REQUIRED_SUBFOLDERS[i];
    var iter = parentFolder.getFoldersByName(name);
    if (!iter.hasNext()) {
      parentFolder.createFolder(name);
      Logger.log('Created subfolder: ' + name);
    } else {
      Logger.log('Already exists: ' + name);
    }
  }
}

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

  // Save main spreadsheet ID for cross-spreadsheet lookups (tracker menu)
  PropertiesService.getScriptProperties()
    .setProperty('MAIN_SS_ID', SpreadsheetApp.getActiveSpreadsheet().getId());

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

  ScriptApp.newTrigger('checkUpcomingDates')
    .timeBased()
    .everyDays(1)
    .atHour(11)   // 11 UTC = 08:00 Asia/Riyadh (UTC+3)
    .create();

  ScriptApp.newTrigger('notifyPendingSupervisors')
    .timeBased()
    .everyHours(SUPERVISOR_NOTIFY_HOURS)
    .create();

  // ── Auto-create supervisors sheet ────────────────────────
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let supSheet = ss.getSheetByName(SUPERVISORS_SHEET_NAME);
  if (!supSheet) {
    supSheet = ss.insertSheet(SUPERVISORS_SHEET_NAME);
    const supHeaders = ['الاسم', 'الوظيفة', 'البريد الإلكتروني', 'الهاتف', 'مجلد المشرف'];
    supSheet.getRange(1, 1, 1, supHeaders.length)
      .setValues([supHeaders])
      .setBackground('#0d6b6e')
      .setFontColor('#ffffff')
      .setFontWeight('bold')
      .setHorizontalAlignment('center')
      .setVerticalAlignment('middle');
    supSheet.setFrozenRows(1);
    supSheet.setRowHeight(1, 32);
    for (let c = 1; c <= supHeaders.length; c++) supSheet.autoResizeColumn(c);
    Logger.log('Supervisors sheet created');
  }

  // ── Ensure employees sheet has supervisor columns E & G ───
  const empSheet = ss.getSheetByName(EMPLOYEES_SHEET_NAME);
  if (empSheet) {
    while (empSheet.getMaxColumns() < COL_EMP_PREV_SUPERVISOR) {
      empSheet.insertColumnAfter(empSheet.getMaxColumns());
    }
    const hdrStyle = function(cell) {
      cell.setBackground('#1a73e8').setFontColor('#ffffff').setFontWeight('bold').setHorizontalAlignment('center');
    };
    hdrStyle(empSheet.getRange(1, COL_EMP_SUPERVISOR));
    empSheet.getRange(1, COL_EMP_SUPERVISOR).setValue('المشرف');
    hdrStyle(empSheet.getRange(1, COL_EMP_PREV_SUPERVISOR));
    empSheet.getRange(1, COL_EMP_PREV_SUPERVISOR).setValue('prev_supervisor');

    // Dropdown for col E: sourced from supervisors sheet col A
    // Apply only to rows that already have data — new rows get it via onEdit.
    const supLastRow  = supSheet.getLastRow();
    const empLastRow  = empSheet.getLastRow(); // actual last row with data
    if (supLastRow > 1 && empLastRow > 1) {
      const supRule = SpreadsheetApp.newDataValidation()
        .requireValueInRange(supSheet.getRange(2, COL_SUP_NAME, supLastRow - 1, 1), true)
        .setAllowInvalid(false)
        .build();
      empSheet.getRange(2, COL_EMP_SUPERVISOR, empLastRow - 1, 1).setDataValidation(supRule);
    }
    Logger.log('Employees sheet supervisor column ready');
  }

  // ── Ensure workflow + workflow_audit sheets exist ────────────
  ensureWorkflowSheets_(ss);

  Logger.log('Triggers ready');
}

function ensureWorkflowSheets_(ss) {
  // workflow sheet
  let wfSheet = ss.getSheetByName(WORKFLOW_SHEET_NAME);
  if (!wfSheet) {
    wfSheet = ss.insertSheet(WORKFLOW_SHEET_NAME);
    const wfHeaders = [
      'id', 'clientFolderId', 'clientName', 'clientEmail', 'clientLang',
      'empName', 'empEmail', 'supName', 'supEmail',
      'year', 'month', 'day', 'fileName', 'fileUrl', 'uploadedAt',
      'finished', 'note', 'status',
      'submittedAt', 'sentAt', 'returnCount', 'lastReturnNote', 'lastUpdated'
    ];
    wfSheet.getRange(1, 1, 1, wfHeaders.length).setValues([wfHeaders])
      .setBackground('#0d6b6e').setFontColor('#ffffff').setFontWeight('bold')
      .setHorizontalAlignment('center').setVerticalAlignment('middle');
    wfSheet.setFrozenRows(1);
    wfSheet.setRowHeight(1, 32);
    wfSheet.autoResizeColumns(1, wfHeaders.length);
    Logger.log('workflow sheet created');
  }

  // workflow_audit sheet
  let auditSheet = ss.getSheetByName(WORKFLOW_AUDIT_SHEET_NAME);
  if (!auditSheet) {
    auditSheet = ss.insertSheet(WORKFLOW_AUDIT_SHEET_NAME);
    const auditHeaders = ['timestamp', 'actorEmail', 'action', 'workflowId', 'clientName', 'fileName', 'detailsJson'];
    auditSheet.getRange(1, 1, 1, auditHeaders.length).setValues([auditHeaders])
      .setBackground('#555').setFontColor('#ffffff').setFontWeight('bold')
      .setHorizontalAlignment('center').setVerticalAlignment('middle');
    auditSheet.setFrozenRows(1);
    auditSheet.setRowHeight(1, 32);
    auditSheet.autoResizeColumns(1, auditHeaders.length);
    Logger.log('workflow_audit sheet created');
  }
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

// ── Web App ──────────────────────────────────────────────────
// doGet / doPost are defined in 10_Portal_Api.gs.js