// ============================================================
// 07_Tracker.gs
// Tracker spreadsheet menu — installed onOpen trigger from main project.
// Menu appears for every user who opens a tracker file.
// Functions execute as the script owner (supervisor) so Gmail/Drive
// scopes are available regardless of who clicks.
// ============================================================

/**
 * Installed onOpen trigger — registered on each tracker spreadsheet
 * when it is created by getOrCreateYearTracker_().
 * Adds a "Statix" custom menu.
 * The supervisor's send-to-client item is shown only for the supervisor
 * (or when the active user email cannot be determined).
 */
function trackerOnOpen(e) {
  const ss = e.source;
  const items = [
    { name: 'اعتماد / Submit',               functionName: 'menuSubmitDayForApproval' },
    { name: 'تحديد كل صفوف اليوم كمكتملة', functionName: 'menuMarkAllDayFinished' }
  ];

  try {
    const activeEmail = Session.getActiveUser().getEmail();
    const ctx         = getClientContextFromTracker_(ss);
    const supEmail    = ctx ? ctx.supervisorEmail : null;

    // Show supervisor send item when:
    //  (a) confirmed this user IS the supervisor, OR
    //  (b) we cannot determine user identity (privacy setting) — handler re-verifies
    const isSupervisor = activeEmail && supEmail &&
                         activeEmail.toLowerCase() === supEmail.toLowerCase();
    if (isSupervisor || !activeEmail) {
      items.splice(1, 0, { name: '✉ إرسال للعميل (مشرف)', functionName: 'menuSupervisorSendToClient' });
    }
  } catch (err) {
    Logger.log('trackerOnOpen: supervisor check error — ' + err.message);
  }

  ss.addMenu('Statix', items);
}

// ── Menu: Employee submit for supervisor approval ─────────────

/**
 * Marks today's completed rows as pending supervisor approval (col I).
 * Does NOT send any email — the notifyPendingSupervisors time trigger handles that.
 * Blocks re-submit if col I already set.
 */
function menuSubmitDayForApproval() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getActiveSheet();

  const todayStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy');
  const data     = sheet.getDataRange().getValues();

  // cols: 0=Day 1=FileName 2=URL 3=Size 4=UploadDate 5=Employee 6=Finished 7=Note 8=حالة الاعتماد 9=حالة الإرسال للعميل
  const matchingRows    = [];
  const matchingRowNums = [];

  for (let i = 1; i < data.length; i++) {
    const row        = data[i];
    const uploadDate = row[4];
    if (!uploadDate) continue;

    const rowDateStr = uploadDate instanceof Date
      ? Utilities.formatDate(uploadDate, Session.getScriptTimeZone(), 'dd/MM/yyyy')
      : String(uploadDate).trim();

    if (rowDateStr === todayStr && row[6] === true) {
      matchingRows.push(row);
      matchingRowNums.push(i + 1);
    }
  }

  if (matchingRows.length === 0) {
    ss.toast('لا يوجد ملفات مكتملة بتاريخ اليوم ' + todayStr, 'Statix', 5);
    return;
  }

  // Block re-submit: col I (index 8) already set
  const alreadySubmitted = matchingRows.find(function(r) { return r[8] && String(r[8]).trim() !== ''; });
  if (alreadySubmitted) {
    ss.toast('تم الاعتماد مسبقاً بتاريخ اليوم ' + todayStr + ' — ' + String(alreadySubmitted[8]), 'Statix', 6);
    return;
  }

  const submittedAt = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm');
  const submitVal   = '⏳ بانتظار الإرسال — ' + submittedAt;
  for (let r = 0; r < matchingRowNums.length; r++) {
    sheet.getRange(matchingRowNums[r], 9).setValue(submitVal);
  }

  ss.toast('✅ تم الاعتماد (' + matchingRows.length + ' ملف). سيتم إخطار المشرف خلال ' + SUPERVISOR_NOTIFY_HOURS + ' ساعة.', 'Statix', 6);
}

// ── Menu: Supervisor sends invoice-done email to client ───────

/**
 * Supervisor-only: sends the "invoice done" email to the client
 * for today's approved rows (col I starts with ⏳, col J empty).
 * Writes ✅ timestamp to col J to prevent re-send.
 */
function menuSupervisorSendToClient() {
  const ss  = SpreadsheetApp.getActiveSpreadsheet();
  const ctx = getClientContextFromTracker_(ss);

  if (!ctx || !ctx.clientEmail) {
    ss.toast('تعذّر تحديد بيانات العميل', 'Statix', 6);
    return;
  }

  // Verify caller is the supervisor (defence-in-depth)
  const activeEmail = Session.getActiveUser().getEmail();
  if (activeEmail && ctx.supervisorEmail &&
      activeEmail.toLowerCase() !== ctx.supervisorEmail.toLowerCase()) {
    ss.toast('هذا الإجراء مخصص للمشرف فقط', 'Statix', 5);
    return;
  }

  const sheet    = ss.getActiveSheet();
  const todayStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy');
  const data     = sheet.getDataRange().getValues();

  const matchingRows    = [];
  const matchingRowNums = [];

  for (let i = 1; i < data.length; i++) {
    const row        = data[i];
    const uploadDate = row[4];
    if (!uploadDate) continue;

    const rowDateStr = uploadDate instanceof Date
      ? Utilities.formatDate(uploadDate, Session.getScriptTimeZone(), 'dd/MM/yyyy')
      : String(uploadDate).trim();

    const submitStatus = String(row[8] || '');
    const sendStatus   = String(row[9] || '').trim();

    if (rowDateStr === todayStr && row[6] === true &&
        submitStatus.indexOf('⏳') === 0 && sendStatus === '') {
      matchingRows.push(row);
      matchingRowNums.push(i + 1);
    }
  }

  if (matchingRows.length === 0) {
    ss.toast('لا توجد صفوف معتمدة بانتظار الإرسال لليوم ' + todayStr, 'Statix', 5);
    return;
  }

  const alreadySent = matchingRows.find(function(r) { return r[9] && String(r[9]).trim() !== ''; });
  if (alreadySent) {
    ss.toast('تم الإرسال مسبقاً — ' + String(alreadySent[9]), 'Statix', 6);
    return;
  }

  const filesList = matchingRows.map(function(r) { return { name: String(r[1]), url: String(r[2]) }; });
  const notesList = matchingRows
    .filter(function(r) { return r[7] && String(r[7]).trim() !== ''; })
    .map(function(r)    { return { name: String(r[1]), note: String(r[7]), url: String(r[2]) }; });

  try {
    sendInvoiceDoneEmail_(ctx.clientEmail, ctx.clientName, todayStr, filesList, notesList, ctx.lang);

    const sentAt  = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm');
    const sentVal = '✅ أُرسل ' + sentAt;
    for (let r = 0; r < matchingRowNums.length; r++) {
      sheet.getRange(matchingRowNums[r], 10).setValue(sentVal);
    }
    ss.toast('✅ تم إرسال الإيميل للعميل ' + ctx.clientName + ' (' + matchingRows.length + ' ملف)', 'Statix', 5);
  } catch (err) {
    ss.toast('خطأ في الإرسال: ' + err.message, 'Statix', 8);
    Logger.log('menuSupervisorSendToClient error: ' + err.message);
  }
}

// ── Menu: Mark all rows of selected day as finished ──────────

/**
 * Marks the "Finished" checkbox (column G) to TRUE for every row
 * that shares the same day value as the currently selected row.
 */
function menuMarkAllDayFinished() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getActiveSheet();
  const row   = ss.getActiveRange().getRow();

  if (row <= 1) {
    ss.toast('الرجاء تحديد صف بيانات', 'Statix', 4);
    return;
  }

  const day = parseInt(sheet.getRange(row, 1).getValue());
  if (!day) {
    ss.toast('لا يوجد قيمة في عمود اليوم', 'Statix', 4);
    return;
  }

  const data  = sheet.getDataRange().getValues();
  let   count = 0;

  for (let i = 1; i < data.length; i++) {
    if (parseInt(data[i][0]) === day) {
      sheet.getRange(i + 1, 7).setValue(true);
      count++;
    }
  }

  ss.toast('تم تحديد ' + count + ' صف(اً) كمكتمل ✅', 'Statix', 4);
}

// ── Client context lookup ────────────────────────────────────

/**
 * Resolves client name, email, language, and year by walking the
 * tracker's parent folder chain:
 *   tracker file → stage/<year>/ → stage/ → client folder
 * Then matches the client folder ID against the customers sheet.
 *
 * @param  {GoogleAppsScript.Spreadsheet.Spreadsheet} ss  The tracker spreadsheet
 * @returns {{ clientName, clientEmail, lang, year }|null}
 */
function getClientContextFromTracker_(ss) {
  try {
    const trackerFile  = DriveApp.getFileById(ss.getId());
    const yearFolder   = trackerFile.getParents().next();   // stage/<year>/
    const stageFolder  = yearFolder.getParents().next();    // stage/
    const clientFolder = stageFolder.getParents().next();   // client root folder
    const clientFolderIdFromDrive = clientFolder.getId();

    const mainSsId = PropertiesService.getScriptProperties().getProperty('MAIN_SS_ID');
    if (!mainSsId) {
      Logger.log('getClientContextFromTracker_: MAIN_SS_ID not set — run setupTriggers() first');
      return null;
    }

    const mainSs    = SpreadsheetApp.openById(mainSsId);
    const custSheet = mainSs.getSheetByName(CUSTOMERS_SHEET_NAME);
    if (!custSheet) return null;

    const data = custSheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][COL_FOLDER_ID - 1]) === clientFolderIdFromDrive) {
        const employeeName = String(data[i][COL_PREV_EMPLOYEE - 1] || data[i][COL_EMPLOYEE - 1]);

        // Resolve supervisor email for this employee
        let supervisorEmail = null;
        try {
          const supData = getSupervisorForEmployee_(employeeName, mainSs);
          if (supData) supervisorEmail = supData.email;
        } catch (e) { /* non-fatal */ }

        return {
          clientName:     data[i][COL_NAME  - 1],
          clientEmail:    data[i][COL_EMAIL - 1],
          lang:           data[i][COL_LANG  - 1] || 'ar',
          year:           parseInt(yearFolder.getName()) || new Date().getFullYear(),
          employeeName:   employeeName,
          supervisorEmail: supervisorEmail
        };
      }
    }

    Logger.log('getClientContextFromTracker_: no matching customer for folder ' + clientFolderIdFromDrive);
  } catch (err) {
    Logger.log('getClientContextFromTracker_ error: ' + err.message);
  }
  return null;
}
