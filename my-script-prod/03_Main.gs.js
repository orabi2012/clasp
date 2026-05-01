// ============================================================
// 03_Main.gs
// Spreadsheet trigger handlers
// ============================================================

function onEmployeeAssigned(e) {
  const sheet = e.source.getActiveSheet();

  // ── Handle supervisor column change on employees sheet ────────────
  if (sheet.getName() === EMPLOYEES_SHEET_NAME) {
    onEmployeeSupervisorChanged_(e, sheet);
    return;
  }

  if (sheet.getName() !== CUSTOMERS_SHEET_NAME) return;

  const editedCol = e.range.getColumn();
  const editedRow = e.range.getRow();
  if (editedRow <= 1 || editedCol !== COL_EMPLOYEE) return;

  const newEmployee = sheet.getRange(editedRow, COL_EMPLOYEE).getValue();

  if (!newEmployee) {
    unassignEmployeeFromClient_(sheet, e.source, editedRow);
  } else {
    assignEmployeeToClient_(sheet, e.source, editedRow, newEmployee, /*interactive=*/true);
  }
}

/**
 * Removes the previously assigned employee's permissions/shortcut and clears
 * workflow assignments. Reads COL_PREV_EMPLOYEE; assumes COL_EMPLOYEE is now empty.
 * Safe to call from triggers OR portal/admin API.
 */
function unassignEmployeeFromClient_(sheet, source, editedRow) {
  const rowData      = sheet.getRange(editedRow, 1, 1, COL_PREV_EMPLOYEE).getValues()[0];
  const prevEmployee = rowData[COL_PREV_EMPLOYEE - 1];
  const existingID   = rowData[COL_FOLDER_ID     - 1];
  const clientName   = rowData[COL_NAME          - 1];

  if (!prevEmployee) return;

  const prevEmail = getEmployeeEmail(prevEmployee, source);

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

  // Clear employee/supervisor on open workflow rows so the previous employee
  // no longer sees this client's rows in their dashboard
  try {
    if (existingID) {
      wfPatchOpenRowsByEmp_(existingID, '', '', '', '');
    }
  } catch (err) {
    Logger.log('Warning: wfPatchOpenRowsByEmp_ on unassign: ' + err.message);
  }

  Logger.log('Unassigned ' + prevEmployee + ' from client: ' + clientName);
}

/**
 * Performs the full employee assignment workflow: folder creation, permission
 * grants, email notifications, calendar events, shortcut placement, etc.
 * Assumes COL_EMPLOYEE has already been written. Safe to call from triggers
 * OR portal/admin API.
 *
 * @param {boolean} interactive  If true, shows SpreadsheetApp.getUi() alerts on
 *                               folder-creation failure (only safe inside the
 *                               edit trigger). API callers should pass false;
 *                               on failure the function reverts COL_EMPLOYEE
 *                               and throws.
 */
function assignEmployeeToClient_(sheet, source, editedRow, newEmployee, interactive) {
  const rowData      = sheet.getRange(editedRow, 1, 1, COL_PREV_EMPLOYEE).getValues()[0];
  const prevEmployee = rowData[COL_PREV_EMPLOYEE - 1];
  const existingID   = rowData[COL_FOLDER_ID     - 1];
  const clientName   = rowData[COL_NAME          - 1];
  const clientEmail  = rowData[COL_EMAIL         - 1];

  // -- 1. Get new employee email --
  const newEmployeeEmail = getEmployeeEmail(newEmployee, source);
  if (!newEmployeeEmail) {
    if (interactive) SpreadsheetApp.getUi().alert('Employee email not found: ' + newEmployee);
    throw new Error('Employee email not found: ' + newEmployee);
  }

  let folderId  = existingID;
  let folderUrl = rowData[COL_FOLDER_URL - 1];

  // -- 2. Create client folder if missing --
  if (!folderId) {
    try {
      const result = withDriveRetry_(function() { return createClientFolder(clientName, clientEmail); }, 3);
      folderId  = result.folderId;
      folderUrl = result.folderUrl;
      setFolderUrlChip_(sheet, editedRow, folderUrl);
      sheet.getRange(editedRow, COL_FOLDER_ID).setValue(folderId);
      SpreadsheetApp.flush();
    } catch (err) {
      Logger.log('Error creating folder: ' + err.message);
      // Revert the employee cell back to what it was before
      sheet.getRange(editedRow, COL_EMPLOYEE).setValue(prevEmployee || '');
      SpreadsheetApp.flush();
      if (interactive) {
        SpreadsheetApp.getUi().alert(
          'فشل إنشاء مجلد العميل بسبب خطأ في Google Drive.\n' +
          'تم إلغاء التعيين. يرجى المحاولة مرة أخرى بعد قليل.\n\n' +
          '(Error: ' + err.message + ')'
        );
        return;
      }
      throw err;
    }
  }

  // -- 3. Revoke previous employee access --
  if (prevEmployee && prevEmployee !== newEmployee) {
    const prevEmail = getEmployeeEmail(prevEmployee, source);

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
    const supervisorData = getSupervisorForEmployee_(newEmployee, source);
    const supEmail = supervisorData ? supervisorData.email : null;
    assignEmployeePermissions(folderId, newEmployeeEmail, supEmail);
  } catch (err) {
    Logger.log('Warning: grant permissions: ' + err.message);
  }

  // -- 5. Resolve subfolder URLs --
  const clientFolder  = DriveApp.getFolderById(folderId);
  const uploadsUrl     = getSubfolderUrl_(clientFolder, FOLDER_UPLOADS,    folderUrl);
  const resultsUrl     = getSubfolderUrl_(clientFolder, FOLDER_RESULTS,    folderUrl);
  const guidelinesUrl  = getSubfolderUrl_(clientFolder, FOLDER_GUIDELINES, folderUrl);

  const supervisorData = getSupervisorForEmployee_(newEmployee, source);

  // -- 6. Send emails --
  try {
    const clientLang = rowData[COL_LANG - 1] || 'ar';
    sendEmailToEmployee(newEmployeeEmail, newEmployee, clientName, clientEmail, rowData);
    if (clientEmail) {
      sendEmailToClient(clientEmail, clientName, supervisorData, uploadsUrl, resultsUrl, guidelinesUrl, clientLang);
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
      folderUrl,
      supervisorData ? supervisorData.email : ''
    );
  } catch (err) {
    Logger.log('Warning: calendar: ' + err.message);
  }

  // -- 8. Add shortcut to employee folder --
  try {
    addClientShortcutToEmployee(newEmployee, newEmployeeEmail, folderId, clientName, source);
  } catch (err) {
    Logger.log('Warning: add shortcut: ' + err.message);
  }

  // -- 9. Save current employee as previous --
  sheet.getRange(editedRow, COL_PREV_EMPLOYEE).setValue(newEmployee);
  SpreadsheetApp.flush();

  // -- 10. Patch open workflow rows with new employee + supervisor --
  try {
    const newSupName  = supervisorData ? supervisorData.name  : '';
    const newSupEmail = supervisorData ? supervisorData.email : '';
    wfPatchOpenRowsByEmp_(folderId, newEmployee, newEmployeeEmail, newSupName, newSupEmail);
  } catch (err) {
    Logger.log('Warning: wfPatchOpenRowsByEmp_: ' + err.message);
  }

  // -- 11. Build stage year/month/day folders (deferred — slow operation) --
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
  const employee    = rowData[COL_PREV_EMPLOYEE - 1] || rowData[COL_EMPLOYEE - 1];
  const folderUrl   = rowData[COL_FOLDER_URL    - 1];
  const clientLang  = rowData[COL_LANG          - 1] || 'ar';

  if (!employee) return;

  const employeeEmail = getEmployeeEmail(employee, e.source);
  const supData2      = getSupervisorForEmployee_(employee, e.source);

  try {
    createOrUpdateClientEvents(
      clientName,
      clientEmail,
      employeeEmail,
      rowData[COL_DATE_ZAKAT - 1],
      rowData[COL_DATE_TAX   - 1],
      folderUrl,
      supData2 ? supData2.email : ''
    );
    Logger.log('Calendar updated for client: ' + clientName);
  } catch (err) {
    Logger.log('Warning: calendar: ' + err.message);
  }

  // Notify both employee and client about the changed date
  const changedType = editedCol === COL_DATE_TAX ? 'الإقرار الضريبي' : 'الإقرار الزكوي';
  const changedDate = rowData[editedCol - 1];
  try {
    if (employeeEmail && changedDate) {
      sendDateChangedNotification_(employeeEmail, clientName, changedType, changedDate, 'ar');
    }
    if (clientEmail && changedDate) {
      sendDateChangedNotification_(clientEmail, clientName, changedType, changedDate, clientLang);
    }
  } catch (err) {
    Logger.log('Warning: date change notification: ' + err.message);
  }
}

// ── Employee ↔ Supervisor assignment ───────────────────────────────────

function onEmployeeSupervisorChanged_(e, sheet) {
  const editedCol = e.range.getColumn();
  const editedRow = e.range.getRow();
  if (editedRow <= 1 || editedCol !== COL_EMP_SUPERVISOR) return;

  // Ensure this row has the supervisor dropdown applied (handles newly typed rows)
  try {
    const supSheet = e.source.getSheetByName(SUPERVISORS_SHEET_NAME);
    if (supSheet && supSheet.getLastRow() > 1) {
      const existing = sheet.getRange(editedRow, COL_EMP_SUPERVISOR).getDataValidation();
      if (!existing) {
        const supRule = SpreadsheetApp.newDataValidation()
          .requireValueInRange(supSheet.getRange(2, COL_SUP_NAME, supSheet.getLastRow() - 1, 1), true)
          .setAllowInvalid(false)
          .build();
        sheet.getRange(editedRow, COL_EMP_SUPERVISOR).setDataValidation(supRule);
      }
    }
  } catch (err) { /* non-fatal */ }

  const rowData        = sheet.getRange(editedRow, 1, 1, COL_EMP_PREV_SUPERVISOR).getValues()[0];
  const employeeName   = rowData[COL_EMP_NAME          - 1];
  const employeeEmail  = rowData[COL_EMP_EMAIL         - 1];
  const newSupervisor  = rowData[COL_EMP_SUPERVISOR    - 1];
  const prevSupervisor = rowData[COL_EMP_PREV_SUPERVISOR - 1];

  if (!employeeName || !employeeEmail) return;

  // Locate the employee's own Drive folder (must already exist)
  const empFolderIter = DriveApp.getFolderById(EMPLOYEES_FOLDER_ID)
    .getFoldersByName(employeeName.replace(/\s+/g, '_'));
  if (!empFolderIter.hasNext()) {
    Logger.log('onEmployeeSupervisorChanged_: employee folder not found for ' + employeeName);
    return;
  }
  const employeeFolderId = empFolderIter.next().getId();

  // Remove shortcut from previous supervisor
  if (prevSupervisor && prevSupervisor !== newSupervisor) {
    try { removeEmployeeShortcutFromSupervisor_(prevSupervisor, employeeName); }
    catch (err) { Logger.log('Warning: remove emp shortcut from prev supervisor: ' + err.message); }
  }

  // Add shortcut to new supervisor folder
  if (newSupervisor) {
    const supData  = getSupervisorByName_(newSupervisor, e.source);
    const supEmail = supData ? supData.email : null;
    try { addEmployeeShortcutToSupervisor_(newSupervisor, supEmail, employeeFolderId, employeeName, e.source); }
    catch (err) { Logger.log('Warning: add emp shortcut to supervisor: ' + err.message); }
  }

  // Save current supervisor as previous
  sheet.getRange(editedRow, COL_EMP_PREV_SUPERVISOR).setValue(newSupervisor || '');
  SpreadsheetApp.flush();

  // Patch open workflow rows with the new supervisor
  try {
    const newSupData  = newSupervisor ? getSupervisorByName_(newSupervisor, e.source) : null;
    const newSupEmail = newSupData ? newSupData.email : '';
    wfPatchOpenRowsBySup_(employeeEmail, newSupervisor || '', newSupEmail);
  } catch (err) {
    Logger.log('Warning: wfPatchOpenRowsBySup_: ' + err.message);
  }

  Logger.log('Supervisor for ' + employeeName + ' set to: ' + (newSupervisor || '(none)'));
}
