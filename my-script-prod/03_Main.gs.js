// ============================================================
// 03_Main.gs
// Spreadsheet trigger handlers
// ============================================================

function onEmployeeAssigned(e) {
  const sheet = e.source.getActiveSheet();
  if (sheet.getName() !== CUSTOMERS_SHEET_NAME) return;

  const editedCol = e.range.getColumn();
  const editedRow = e.range.getRow();
  if (editedRow <= 1 || editedCol !== COL_EMPLOYEE) return;

  const rowData      = sheet.getRange(editedRow, 1, 1, COL_PREV_EMPLOYEE).getValues()[0];
  const newEmployee  = rowData[COL_EMPLOYEE      - 1];
  const prevEmployee = rowData[COL_PREV_EMPLOYEE - 1];
  const existingID   = rowData[COL_FOLDER_ID     - 1];
  const clientName   = rowData[COL_NAME          - 1];
  const clientEmail  = rowData[COL_EMAIL         - 1];

  // -- Un-assign --
  if (!newEmployee) {
    if (prevEmployee) {
      const prevEmail = getEmployeeEmail(prevEmployee, e.source);

      if (prevEmail && existingID) {
        try { removeEmployeePermissions(existingID, prevEmail); } catch (err) {
          Logger.log('Warning: revoke permissions: ' + err.message);
        }
      }

      try { removeClientShortcutFromEmployee(prevEmployee, clientName); } catch (err) {
        Logger.log('Warning: remove shortcut: ' + err.message);
      }

      sheet.getRange(editedRow, COL_PREV_EMPLOYEE).setValue('');
      SpreadsheetApp.flush();

      Logger.log('Unassigned ' + prevEmployee + ' from client: ' + clientName);
    }
    return;
  }

  // -- 1. Get new employee email --
  const newEmployeeEmail = getEmployeeEmail(newEmployee, e.source);
  if (!newEmployeeEmail) {
    SpreadsheetApp.getUi().alert('Employee email not found: ' + newEmployee);
    return;
  }

  let folderId  = existingID;
  let folderUrl = rowData[COL_FOLDER_URL - 1];

  // -- 2. Create client folder if missing --
  if (!folderId) {
    try {
      const result = createClientFolder(clientName, clientEmail);
      folderId  = result.folderId;
      folderUrl = result.folderUrl;
      setFolderUrlChip_(sheet, editedRow, folderUrl);
      sheet.getRange(editedRow, COL_FOLDER_ID).setValue(folderId);
      SpreadsheetApp.flush();
    } catch (err) {
      Logger.log('Error creating folder: ' + err.message);
      SpreadsheetApp.getUi().alert('Error creating folder: ' + err.message);
      return;
    }
  }

  // -- 3. Revoke previous employee access --
  if (prevEmployee && prevEmployee !== newEmployee) {
    const prevEmail = getEmployeeEmail(prevEmployee, e.source);

    if (prevEmail) {
      try { removeEmployeePermissions(folderId, prevEmail); } catch (err) {
        Logger.log('Warning: revoke permissions: ' + err.message);
      }
    }

    try { removeClientShortcutFromEmployee(prevEmployee, clientName); } catch (err) {
      Logger.log('Warning: remove shortcut: ' + err.message);
    }
  }

  // -- 4. Grant new employee access --
  try {
    assignEmployeePermissions(folderId, newEmployeeEmail);
  } catch (err) {
    Logger.log('Warning: grant permissions: ' + err.message);
  }

  // -- 5. Resolve subfolder URLs --
  const clientFolder = DriveApp.getFolderById(folderId);
  const uploadsUrl   = getSubfolderUrl_(clientFolder, FOLDER_UPLOADS, folderUrl);
  const resultsUrl   = getSubfolderUrl_(clientFolder, FOLDER_RESULTS, folderUrl);
  const stageUrl     = getSubfolderUrl_(clientFolder, FOLDER_STAGE,   folderUrl);

  const employeeData = getEmployeeData(newEmployee, e.source);

  // -- 6. Send emails --
  try {
    const clientLang = rowData[COL_LANG - 1] || 'ar';
    sendEmailToEmployee(newEmployeeEmail, newEmployee, clientName, clientEmail, rowData, uploadsUrl, resultsUrl, stageUrl);
    if (clientEmail) {
      sendEmailToClient(clientEmail, clientName, employeeData, uploadsUrl, resultsUrl, clientLang);
    }
  } catch (err) {
    Logger.log('Warning: send email: ' + err.message);
  }

  // -- 7. Create calendar events --
  try {
    createOrUpdateClientEvents(
      clientName,
      clientEmail,
      newEmployeeEmail,
      rowData[COL_DATE_ZAKAT - 1],
      rowData[COL_DATE_TAX   - 1],
      folderUrl
    );
  } catch (err) {
    Logger.log('Warning: calendar: ' + err.message);
  }

  // -- 8. Add shortcut to employee folder --
  try {
    addClientShortcutToEmployee(newEmployee, newEmployeeEmail, folderId, clientName, e.source);
  } catch (err) {
    Logger.log('Warning: add shortcut: ' + err.message);
  }

  // -- 9. Save current employee as previous --
  sheet.getRange(editedRow, COL_PREV_EMPLOYEE).setValue(newEmployee);
  SpreadsheetApp.flush();

  // -- 10. Build stage year/month/day folders (deferred — slow operation) --
  try {
    buildClientStageFolders_(folderId);
  } catch (err) {
    Logger.log('Warning: stage folders: ' + err.message);
  }

  Logger.log('Assigned ' + newEmployee + ' to client: ' + clientName);
}

function onDateChanged(e) {
  const sheet = e.source.getActiveSheet();
  if (sheet.getName() !== CUSTOMERS_SHEET_NAME) return;

  const editedCol = e.range.getColumn();
  const editedRow = e.range.getRow();

  if (editedRow <= 1) return;
  if (editedCol !== COL_DATE_ZAKAT && editedCol !== COL_DATE_TAX) return;

  const rowData     = sheet.getRange(editedRow, 1, 1, COL_PREV_EMPLOYEE).getValues()[0];
  const clientName  = rowData[COL_NAME          - 1];
  const clientEmail = rowData[COL_EMAIL         - 1];
  const employee    = rowData[COL_PREV_EMPLOYEE - 1];
  const folderUrl   = rowData[COL_FOLDER_URL    - 1];

  if (!employee) return;

  const employeeEmail = getEmployeeEmail(employee, e.source);

  try {
    createOrUpdateClientEvents(
      clientName,
      clientEmail,
      employeeEmail,
      rowData[COL_DATE_ZAKAT - 1],
      rowData[COL_DATE_TAX   - 1],
      folderUrl
    );
    Logger.log('Calendar updated for client: ' + clientName);
  } catch (err) {
    Logger.log('Warning: calendar: ' + err.message);
  }
}
