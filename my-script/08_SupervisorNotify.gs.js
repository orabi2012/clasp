// ============================================================
// 08_SupervisorNotify.gs
// Batched supervisor notification — runs on a time-based trigger
// every SUPERVISOR_NOTIFY_HOURS hours (set in 01_Setup).
//
// Scans all client tracker spreadsheets for rows where:
//   col I (حالة الاعتماد)  starts with ⏳  (submitted by employee)
//   col J (حالة الإرسال)   is empty        (not yet sent to client)
// Groups pending items by supervisor and sends one digest email.
// Idempotent: rows are NOT mutated here; the supervisor's own
// "send to client" action writes to col J, dropping rows from
// future digest runs.
// ============================================================

function notifyPendingSupervisors() {
  const mainSsId = PropertiesService.getScriptProperties().getProperty('MAIN_SS_ID');
  if (!mainSsId) {
    Logger.log('notifyPendingSupervisors: MAIN_SS_ID not set — run setupTriggers() first');
    return;
  }

  const mainSs    = SpreadsheetApp.openById(mainSsId);
  const custSheet = mainSs.getSheetByName(CUSTOMERS_SHEET_NAME);
  if (!custSheet) return;

  const custData = custSheet.getDataRange().getValues();

  // Map: supervisorEmail → { supervisorName, items[] }
  const supervisorDigests = {};

  for (let i = 1; i < custData.length; i++) {
    const folderId   = custData[i][COL_FOLDER_ID    - 1];
    const employee   = custData[i][COL_PREV_EMPLOYEE - 1] || custData[i][COL_EMPLOYEE - 1];
    const clientName = custData[i][COL_NAME         - 1];

    if (!folderId || !employee) continue;

    // Find supervisor for this employee
    const supData = getSupervisorForEmployee_(employee, mainSs);
    if (!supData || !supData.email) {
      Logger.log('[' + clientName + '] no supervisor for "' + employee + '" — skipping');
      continue;
    }

    // Locate stage/ folder inside client folder
    let stageFolder;
    try {
      const clientFolder = DriveApp.getFolderById(folderId);
      const stageIter    = clientFolder.getFoldersByName(FOLDER_STAGE);
      if (!stageIter.hasNext()) continue;
      stageFolder = stageIter.next();
    } catch (err) {
      Logger.log('[' + clientName + '] cannot open Drive folder: ' + err.message);
      continue;
    }

    // Walk year folders → tracker files
    const yearFolders = stageFolder.getFolders();
    while (yearFolders.hasNext()) {
      const yearFolder = yearFolders.next();
      const filesIter  = yearFolder.getFiles();
      while (filesIter.hasNext()) {
        const file = filesIter.next();
        if (file.getName().indexOf('tracker_') !== 0) continue;

        let trackerSs;
        try { trackerSs = SpreadsheetApp.openById(file.getId()); }
        catch (e) { continue; }

        const sheets = trackerSs.getSheets();
        for (let s = 0; s < sheets.length; s++) {
          const sheet     = sheets[s];
          const sheetData = sheet.getDataRange().getValues();

          // Collect rows where col I starts with ⏳ AND col J is empty
          const pendingRows = [];
          for (let r = 1; r < sheetData.length; r++) {
            const submitStatus = String(sheetData[r][8] || '');
            const sendStatus   = String(sheetData[r][9] || '').trim();
            if (submitStatus.indexOf('⏳') === 0 && sendStatus === '') {
              const uploadDate = sheetData[r][4];
              pendingRows.push({
                fileName: sheetData[r][1],
                fileUrl:  sheetData[r][2],
                dateStr:  uploadDate instanceof Date
                          ? Utilities.formatDate(uploadDate, Session.getScriptTimeZone(), 'dd/MM/yyyy')
                          : String(uploadDate)
              });
            }
          }

          if (pendingRows.length === 0) continue;

          const trackerUrl = 'https://docs.google.com/spreadsheets/d/' +
                             file.getId() + '/edit#gid=' + sheet.getSheetId();

          if (!supervisorDigests[supData.email]) {
            supervisorDigests[supData.email] = { supervisorName: supData.name, items: [] };
          }
          supervisorDigests[supData.email].items.push({
            clientName:  clientName,
            employee:    employee,
            monthTab:    sheet.getName(),
            trackerUrl:  trackerUrl,
            pendingRows: pendingRows
          });
        }
      }
    }
  }

  // Send one digest email per supervisor
  let totalSent = 0;
  for (const supEmail in supervisorDigests) {
    const digest = supervisorDigests[supEmail];
    if (digest.items.length === 0) continue;
    try {
      sendSupervisorDigestEmail_(supEmail, digest.supervisorName, digest.items);
      totalSent++;
      Logger.log('Digest sent to: ' + supEmail + ' (' + digest.items.length + ' item(s))');
    } catch (err) {
      Logger.log('Error sending digest to ' + supEmail + ': ' + err.message);
    }
  }

  Logger.log('notifyPendingSupervisors: done. ' + totalSent + ' digest email(s) sent.');
}
