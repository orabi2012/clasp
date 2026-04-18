// ============================================================
// 06_Uploads.gs
// Poll client uploads/ folders for new files & notify employees
// ============================================================

function checkUploadsForNewFiles() {
  const props = PropertiesService.getScriptProperties();
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CUSTOMERS_SHEET_NAME);
  if (!sheet) return;

  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    const folderId   = data[i][COL_FOLDER_ID    - 1];
    const employee   = data[i][COL_PREV_EMPLOYEE - 1];
    const clientName = data[i][COL_NAME          - 1];

    if (!folderId || !employee) continue;

    try {
      const employeeEmail = getEmployeeEmail(employee, ss);
      if (!employeeEmail) {
        Logger.log('[' + clientName + '] no email for employee "' + employee + '" — skipping');
        continue;
      }

      const clientFolder = DriveApp.getFolderById(folderId);
      const uploadsIter  = clientFolder.getFoldersByName(FOLDER_UPLOADS);
      if (!uploadsIter.hasNext()) {
        Logger.log('[' + clientName + '] no uploads/ folder — skipping');
        continue;
      }

      const uploadsFolder = uploadsIter.next();
      const uploadsUrl    = uploadsFolder.getUrl();

      // -- Get all files currently in uploads/ --
      const scriptOwner = Session.getEffectiveUser().getEmail();
      const allFiles    = [];
      const filesIter   = uploadsFolder.getFiles();
      while (filesIter.hasNext()) {
        const f          = filesIter.next();
        const ownerEmail = f.getOwner() ? f.getOwner().getEmail() : '';
        if (ownerEmail === scriptOwner) {
          Logger.log('[' + clientName + '] skipped script-owner file: ' + f.getName());
          continue;
        }
        allFiles.push({ id: f.getId(), name: f.getName(), url: f.getUrl(), size: f.getSize() });
      }

      Logger.log('[' + clientName + '] files in uploads/: ' + allFiles.length);

      if (allFiles.length === 0) {
        // uploads/ is empty — clear stored IDs for this client
        props.deleteProperty('notified_' + folderId);
        continue;
      }

      // -- Load already-notified file IDs --
      const storedRaw    = props.getProperty('notified_' + folderId);
      const notifiedIds  = storedRaw ? JSON.parse(storedRaw) : [];

      Logger.log('[' + clientName + '] already notified IDs: ' + notifiedIds.length);

      // -- Find files NOT yet notified --
      const newFiles = allFiles.filter(function(f) {
        return notifiedIds.indexOf(f.id) === -1;
      });

      Logger.log('[' + clientName + '] new (unnotified) files: ' + newFiles.length);

      if (newFiles.length > 0) {
        sendUploadNotification(employeeEmail, employee, clientName, uploadsUrl, newFiles);
        Logger.log('[' + clientName + '] notified ' + employee + ' about ' + newFiles.length + ' file(s)');
      }

      // -- Update stored IDs = only files still in uploads/ (clears moved files automatically) --
      const currentIds = allFiles.map(function(f) { return f.id; });
      props.setProperty('notified_' + folderId, JSON.stringify(currentIds));

    } catch (err) {
      Logger.log('[' + clientName + '] error: ' + err.message);
    }
  }

  Logger.log('Upload check completed');
}
