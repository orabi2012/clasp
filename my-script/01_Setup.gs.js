// ============================================================
// 01_Setup.gs
// Config + one-time setup
// ============================================================

const TEMPLATE_FOLDER_ID   = '1kvgxJN72BwUPuo3Pz0Zd92tYLjP9YsqA';
const CLIENTS_FOLDER_ID    = '1xxNaC69sPg6ByM370ETpzdDgiEqUCxgC';
const EMPLOYEES_FOLDER_ID = '1gXaQQUCpEYq3fjFtUYy2jp5YlEVFpcnn'; 


const CUSTOMERS_SHEET_NAME = 'customers';
const EMPLOYEES_SHEET_NAME = 'employees';
const COL_EMP_FOLDER_URL = 6; // F في شيت employees
const COL_NAME          = 3;
const COL_EMAIL         = 2;
const COL_EMPLOYEE      = 11;
const COL_FOLDER_URL    = 12;
const COL_FOLDER_ID     = 13;
const COL_PREV_EMPLOYEE = 14;


// احذف القديم واستبدله بهذا
const COL_DATE_ZAKAT = 9;   // I — تاريخ تقديم الإقرار الزكوي القادم
const COL_DATE_TAX   = 10;  // J — تاريخ تقديم الإقرار الضريبي القادم

const CALENDAR_REMINDER_DAYS = 7;

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

function setupTemplateYear(year) {
  const templateFolder = DriveApp.getFolderById(TEMPLATE_FOLDER_ID);

  getOrCreateSubfolder_(templateFolder, 'uploads');
  getOrCreateSubfolder_(templateFolder, 'results');
  const stageFolder = getOrCreateSubfolder_(templateFolder, 'stage');

  const monthNames = [
    '01-January', '02-February', '03-March',
    '04-April',   '05-May',      '06-June',
    '07-July',    '08-August',   '09-September',
    '10-October', '11-November', '12-December'
  ];

  const yearFolder = getOrCreateSubfolder_(stageFolder, String(year));

  for (let m = 0; m < monthNames.length; m++) {
    const monthFolder = getOrCreateSubfolder_(yearFolder, monthNames[m]);
    const daysInMonth = new Date(year, m + 1, 0).getDate();

    for (let day = 1; day <= daysInMonth; day++) {
      getOrCreateSubfolder_(monthFolder, String(day).padStart(2, '0'));
    }

    Utilities.sleep(200); // استراحة بسيطة بعد كل شهر
  }

  Logger.log('Year ' + year + ' done ✅');
}

// شغّل كل واحدة منفردة
function setupPreviousYear() {
  setupTemplateYear(new Date().getFullYear() - 1);
}

function setupCurrentYear() {
  setupTemplateYear(new Date().getFullYear());
}

function setupNextYear() {
  setupTemplateYear(new Date().getFullYear() + 1);
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

  Logger.log('Triggers ready');
}

function fillExistingEmployeeFolderUrls() {
  const ss          = SpreadsheetApp.getActiveSpreadsheet();
  const empSheet    = ss.getSheetByName(EMPLOYEES_SHEET_NAME);
  const empFolder   = DriveApp.getFolderById(EMPLOYEES_FOLDER_ID);
  const data        = empSheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    const name = data[i][0];
    if (!name) continue;

    const folderName = name.replace(/\s+/g, '_');
    const iter = empFolder.getFoldersByName(folderName);

    if (iter.hasNext()) {
      empSheet.getRange(i + 1, COL_EMP_FOLDER_URL).setValue(iter.next().getUrl());
      Logger.log('✅ ' + name);
    } else {
      Logger.log('❌ مجلد مش موجود: ' + name);
    }
  }
}