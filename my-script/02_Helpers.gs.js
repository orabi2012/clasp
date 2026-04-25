// ============================================================
// 02_Helpers.gs
// Drive utilities, permissions, shortcuts & employee lookups
// ============================================================

// ── Drive Folder Utilities ────────────────────────────────────

function getOrCreateSubfolder_(parentFolder, folderName) {
  const iter = parentFolder.getFoldersByName(folderName);
  return iter.hasNext() ? iter.next() : parentFolder.createFolder(folderName);
}

function copyFolderContents_(sourceFolder, targetFolder, skipFolderNames) {
  const skip  = skipFolderNames || [];
  const files = sourceFolder.getFiles();
  while (files.hasNext()) {
    const file = files.next();
    file.makeCopy(file.getName(), targetFolder);
  }

  const folders = sourceFolder.getFolders();
  while (folders.hasNext()) {
    const subFolder = folders.next();
    if (skip.indexOf(subFolder.getName()) !== -1) {
      // Create the folder but skip copying its contents (deferred)
      targetFolder.createFolder(subFolder.getName());
      continue;
    }
    copyFolderContents_(subFolder, targetFolder.createFolder(subFolder.getName()), skip);
  }
}

function buildClientStageFolders_(clientFolderId) {
  const clientFolder = DriveApp.getFolderById(clientFolderId);
  const stageIter    = clientFolder.getFoldersByName(FOLDER_STAGE);
  if (!stageIter.hasNext()) return;

  const stageFolder = stageIter.next();
  const year        = new Date().getFullYear();

  // Skip if year folder already exists
  const yearIter = stageFolder.getFoldersByName(String(year));
  if (yearIter.hasNext()) return;

  const yearFolder = stageFolder.createFolder(String(year));
  for (let m = 0; m < MONTH_NAMES.length; m++) {
    const monthFolder = yearFolder.createFolder(MONTH_NAMES[m]);
    const daysInMonth = new Date(year, m + 1, 0).getDate();
    for (let day = 1; day <= daysInMonth; day++) {
      monthFolder.createFolder(String(day).padStart(2, '0'));
    }
    Utilities.sleep(200);
  }

  Logger.log('Stage folders built for year ' + year);
}

function getSubfolderUrl_(parentFolder, folderName, fallbackUrl) {
  const iter = parentFolder.getFoldersByName(folderName);
  return iter.hasNext() ? iter.next().getUrl() : fallbackUrl;
}

// ── Client Folder ─────────────────────────────────────────────

function createClientFolder(clientName, clientEmail) {
  const clientsFolder  = DriveApp.getFolderById(CLIENTS_FOLDER_ID);
  const templateFolder = DriveApp.getFolderById(TEMPLATE_FOLDER_ID);

  const existing = clientsFolder.getFoldersByName(clientName);
  if (existing.hasNext()) {
    const folder = existing.next();
    return { folderId: folder.getId(), folderUrl: folder.getUrl() };
  }

  const clientFolder = clientsFolder.createFolder(clientName);
  // Skip stage/ deep structure — built later as a deferred step
  copyFolderContents_(templateFolder, clientFolder, [FOLDER_STAGE]);
  // Ensure all required subfolders exist (in case template is missing any)
  ensureFolders_(clientFolder);

  const uploadsIter = clientFolder.getFoldersByName(FOLDER_UPLOADS);
  const resultsIter = clientFolder.getFoldersByName(FOLDER_RESULTS);

  if (clientEmail && uploadsIter.hasNext()) {
    Utilities.sleep(500);
    Drive.Permissions.create(
      { role: 'writer', type: 'user', emailAddress: clientEmail },
      uploadsIter.next().getId(),
      { sendNotificationEmail: false }
    );
  }

  if (clientEmail && resultsIter.hasNext()) {
    Utilities.sleep(500);
    Drive.Permissions.create(
      { role: 'reader', type: 'user', emailAddress: clientEmail },
      resultsIter.next().getId(),
      { sendNotificationEmail: false }
    );
  }

  const guidelinesIter = clientFolder.getFoldersByName(FOLDER_GUIDELINES);
  if (clientEmail && guidelinesIter.hasNext()) {
    Utilities.sleep(500);
    Drive.Permissions.create(
      { role: 'reader', type: 'user', emailAddress: clientEmail },
      guidelinesIter.next().getId(),
      { sendNotificationEmail: false }
    );
  }

  return { folderId: clientFolder.getId(), folderUrl: clientFolder.getUrl() };
}

// ── Permissions ───────────────────────────────────────────────

function assignEmployeePermissions(clientFolderId, employeeEmail) {
  const clientFolder = DriveApp.getFolderById(clientFolderId);

  // Root: reader only (employee navigates but cannot edit at root level)
  Drive.Permissions.create(
    { role: 'reader', type: 'user', emailAddress: employeeEmail },
    clientFolderId,
    { sendNotificationEmail: false }
  );
  Utilities.sleep(300);

  // stage & results: writer — uploads is intentionally excluded (files arrive via automation)
  const writableFolders = [FOLDER_STAGE, FOLDER_RESULTS];
  for (let i = 0; i < writableFolders.length; i++) {
    const iter = clientFolder.getFoldersByName(writableFolders[i]);
    if (iter.hasNext()) {
      Drive.Permissions.create(
        { role: 'writer', type: 'user', emailAddress: employeeEmail },
        iter.next().getId(),
        { sendNotificationEmail: false }
      );
      Utilities.sleep(300);
    }
  }

  // ارشادات هامة: reader only
  const guidelinesIter = clientFolder.getFoldersByName(FOLDER_GUIDELINES);
  if (guidelinesIter.hasNext()) {
    Drive.Permissions.create(
      { role: 'reader', type: 'user', emailAddress: employeeEmail },
      guidelinesIter.next().getId(),
      { sendNotificationEmail: false }
    );
  }

  // Grant writer on existing tracker spreadsheets inside stage/
  grantTrackerAccess_(clientFolder, employeeEmail);
}

function removeEmployeePermissions(clientFolderId, employeeEmail) {
  const clientFolder = DriveApp.getFolderById(clientFolderId);

  try { clientFolder.removeViewer(employeeEmail); } catch (e) {}
  Utilities.sleep(300);

  const uploadsIter = clientFolder.getFoldersByName(FOLDER_UPLOADS);
  if (uploadsIter.hasNext()) {
    try { uploadsIter.next().removeEditor(employeeEmail); } catch (e) {}
  }
  Utilities.sleep(500);

  const stageIter = clientFolder.getFoldersByName(FOLDER_STAGE);
  if (stageIter.hasNext()) {
    try { stageIter.next().removeEditor(employeeEmail); } catch (e) {}
  }
  Utilities.sleep(500);

  const resultsIter = clientFolder.getFoldersByName(FOLDER_RESULTS);
  if (resultsIter.hasNext()) {
    try { resultsIter.next().removeEditor(employeeEmail); } catch (e) {}
  }
  Utilities.sleep(500);

  const guidelinesIter2 = clientFolder.getFoldersByName(FOLDER_GUIDELINES);
  if (guidelinesIter2.hasNext()) {
    try { guidelinesIter2.next().removeViewer(employeeEmail); } catch (e) {}
  }

  // Revoke access on tracker spreadsheets
  revokeTrackerAccess_(clientFolder, employeeEmail);
}

// ── Employee Folder & Shortcuts ───────────────────────────────

function getOrCreateEmployeeFolder(employeeName, employeeEmail, spreadsheet) {
  const employeesFolder = DriveApp.getFolderById(EMPLOYEES_FOLDER_ID);
  const folderName      = employeeName.replace(/\s+/g, '_');

  const existing = employeesFolder.getFoldersByName(folderName);
  let empFolder;

  if (existing.hasNext()) {
    empFolder = existing.next();
  } else {
    empFolder = employeesFolder.createFolder(folderName);

    if (employeeEmail) {
      try {
        Drive.Permissions.create(
          { role: 'reader', type: 'user', emailAddress: employeeEmail },
          empFolder.getId(),
          { sendNotificationEmail: false }
        );
      } catch (err) {
        Logger.log('Warning: employee folder permission: ' + err.message);
      }
    }

    Logger.log('Created employee folder: ' + folderName);
  }

  if (spreadsheet) {
    try {
      const empSheet = spreadsheet.getSheetByName(EMPLOYEES_SHEET_NAME);
      if (empSheet) {
        const data = empSheet.getDataRange().getValues();
        for (let i = 1; i < data.length; i++) {
          if (data[i][0] === employeeName) {
            if (!data[i][COL_EMP_FOLDER_URL - 1]) {
              empSheet.getRange(i + 1, COL_EMP_FOLDER_URL)
                .setRichTextValue(
                  SpreadsheetApp.newRichTextValue()
                    .setText(employeeName)
                    .setLinkUrl(empFolder.getUrl())
                    .build()
                );
            }
            break;
          }
        }
      }
    } catch (err) {
      Logger.log('Warning: saving employee URL: ' + err.message);
    }
  }

  return empFolder;
}

function addClientShortcutToEmployee(employeeName, employeeEmail, clientFolderId, clientName, spreadsheet) {
  const empFolder = getOrCreateEmployeeFolder(employeeName, employeeEmail, spreadsheet);

  const existing = empFolder.getFilesByName(clientName);
  while (existing.hasNext()) {
    if (existing.next().getMimeType() === 'application/vnd.google-apps.shortcut') {
      Logger.log('Shortcut already exists: ' + clientName);
      return;
    }
  }

  Drive.Files.create({
    name:            clientName,
    mimeType:        'application/vnd.google-apps.shortcut',
    parents:         [empFolder.getId()],
    shortcutDetails: { targetId: clientFolderId }
  });

  Logger.log('Shortcut created: ' + clientName + ' in ' + employeeName);
}

function removeClientShortcutFromEmployee(employeeName, clientName) {
  const employeesFolder = DriveApp.getFolderById(EMPLOYEES_FOLDER_ID);
  const folderName      = employeeName.replace(/\s+/g, '_');

  const empFolderIter = employeesFolder.getFoldersByName(folderName);
  if (!empFolderIter.hasNext()) return;

  const empFolder = empFolderIter.next();
  const filesIter = empFolder.getFilesByName(clientName);

  while (filesIter.hasNext()) {
    const file = filesIter.next();
    if (file.getMimeType() === 'application/vnd.google-apps.shortcut') {
      file.setTrashed(true);
      Logger.log('Shortcut removed: ' + clientName + ' from ' + employeeName);
      return;
    }
  }
}

// ── Employee Sheet Lookups ────────────────────────────────────

function getEmployeeEmail(employeeName, spreadsheet) {
  const empSheet = spreadsheet.getSheetByName(EMPLOYEES_SHEET_NAME);
  if (!empSheet) return null;

  const data = empSheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === employeeName) return data[i][2];
  }
  return null;
}

function getEmployeeData(employeeName, spreadsheet) {
  const empSheet = spreadsheet.getSheetByName(EMPLOYEES_SHEET_NAME);
  if (!empSheet) return null;

  const data = empSheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === employeeName) {
      return {
        name:  data[i][0],
        job:   data[i][1],
        email: data[i][2],
        phone: data[i][3]
      };
    }
  }

  return { name: employeeName, job: '', email: '', phone: '' };
}

// ── Supervisor Sheet Lookups ────────────────────────────────────

function getSupervisorByName_(supervisorName, spreadsheet) {
  const sheet = spreadsheet.getSheetByName(SUPERVISORS_SHEET_NAME);
  if (!sheet) return null;
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][COL_SUP_NAME - 1] === supervisorName) {
      return {
        name:  data[i][COL_SUP_NAME  - 1],
        job:   data[i][COL_SUP_JOB   - 1],
        email: data[i][COL_SUP_EMAIL - 1],
        phone: data[i][COL_SUP_PHONE - 1]
      };
    }
  }
  return null;
}

function getSupervisorForEmployee_(employeeName, spreadsheet) {
  const empSheet = spreadsheet.getSheetByName(EMPLOYEES_SHEET_NAME);
  if (!empSheet) return null;
  const data = empSheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][COL_EMP_NAME - 1] === employeeName) {
      const supervisorName = data[i][COL_EMP_SUPERVISOR - 1];
      if (!supervisorName) return null;
      return getSupervisorByName_(supervisorName, spreadsheet);
    }
  }
  return null;
}

// ── Supervisor Folder & Shortcuts ──────────────────────────────────

function getOrCreateSupervisorFolder_(supervisorName, supervisorEmail, spreadsheet) {
  if (!SUPERVISORS_FOLDER_ID) {
    Logger.log('getOrCreateSupervisorFolder_: SUPERVISORS_FOLDER_ID not set — skipping');
    return null;
  }
  const supervisorsRoot = DriveApp.getFolderById(SUPERVISORS_FOLDER_ID);
  const folderName      = supervisorName.replace(/\s+/g, '_');

  const existing = supervisorsRoot.getFoldersByName(folderName);
  let supFolder;
  if (existing.hasNext()) {
    supFolder = existing.next();
  } else {
    supFolder = supervisorsRoot.createFolder(folderName);
    if (supervisorEmail) {
      try {
        Drive.Permissions.create(
          { role: 'reader', type: 'user', emailAddress: supervisorEmail },
          supFolder.getId(),
          { sendNotificationEmail: false }
        );
      } catch (err) {
        Logger.log('Warning: supervisor folder permission: ' + err.message);
      }
    }
    Logger.log('Created supervisor folder: ' + folderName);
  }

  // Write URL chip into supervisors sheet col E
  if (spreadsheet) {
    try {
      const supSheet = spreadsheet.getSheetByName(SUPERVISORS_SHEET_NAME);
      if (supSheet) {
        const data = supSheet.getDataRange().getValues();
        for (let i = 1; i < data.length; i++) {
          if (data[i][COL_SUP_NAME - 1] === supervisorName && !data[i][COL_SUP_FOLDER_URL - 1]) {
            supSheet.getRange(i + 1, COL_SUP_FOLDER_URL)
              .setRichTextValue(
                SpreadsheetApp.newRichTextValue()
                  .setText(supervisorName)
                  .setLinkUrl(supFolder.getUrl())
                  .build()
              );
            break;
          }
        }
      }
    } catch (err) {
      Logger.log('Warning: saving supervisor folder URL: ' + err.message);
    }
  }
  return supFolder;
}

function addEmployeeShortcutToSupervisor_(supervisorName, supervisorEmail, employeeFolderId, employeeName, spreadsheet) {
  const supFolder = getOrCreateSupervisorFolder_(supervisorName, supervisorEmail, spreadsheet);
  if (!supFolder) return;

  const existing = supFolder.getFilesByName(employeeName);
  while (existing.hasNext()) {
    if (existing.next().getMimeType() === 'application/vnd.google-apps.shortcut') {
      Logger.log('Employee shortcut already in supervisor folder: ' + employeeName);
      return;
    }
  }

  Drive.Files.create({
    name:            employeeName,
    mimeType:        'application/vnd.google-apps.shortcut',
    parents:         [supFolder.getId()],
    shortcutDetails: { targetId: employeeFolderId }
  });
  Logger.log('Shortcut created: ' + employeeName + ' in supervisor folder of ' + supervisorName);
}

function removeEmployeeShortcutFromSupervisor_(supervisorName, employeeName) {
  if (!SUPERVISORS_FOLDER_ID) return;
  const supervisorsRoot = DriveApp.getFolderById(SUPERVISORS_FOLDER_ID);
  const folderName      = supervisorName.replace(/\s+/g, '_');
  const supFolderIter   = supervisorsRoot.getFoldersByName(folderName);
  if (!supFolderIter.hasNext()) return;

  const supFolder = supFolderIter.next();
  const filesIter = supFolder.getFilesByName(employeeName);
  while (filesIter.hasNext()) {
    const file = filesIter.next();
    if (file.getMimeType() === 'application/vnd.google-apps.shortcut') {
      file.setTrashed(true);
      Logger.log('Shortcut removed: ' + employeeName + ' from supervisor folder of ' + supervisorName);
      return;
    }
  }
}

// ── Tracker Access ────────────────────────────────────────────

/**
 * Grants the employee writer access on every tracker spreadsheet
 * found inside stage/<year>/ subfolders.
 */
function grantTrackerAccess_(clientFolder, employeeEmail) {
  const stageIter = clientFolder.getFoldersByName(FOLDER_STAGE);
  if (!stageIter.hasNext()) return;
  const stageFolder = stageIter.next();
  const yearFolders = stageFolder.getFolders();
  while (yearFolders.hasNext()) {
    const yearFolder = yearFolders.next();
    const filesIter  = yearFolder.getFiles();
    while (filesIter.hasNext()) {
      const file = filesIter.next();
      if (file.getName().indexOf('tracker_') === 0) {
        try {
          Drive.Permissions.create(
            { role: 'writer', type: 'user', emailAddress: employeeEmail },
            file.getId(),
            { sendNotificationEmail: false }
          );
        } catch (err) {
          Logger.log('Warning: tracker grant: ' + err.message);
        }
      }
    }
  }
}

/**
 * Revokes the employee's access on every tracker spreadsheet.
 */
function revokeTrackerAccess_(clientFolder, employeeEmail) {
  const stageIter = clientFolder.getFoldersByName(FOLDER_STAGE);
  if (!stageIter.hasNext()) return;
  const stageFolder = stageIter.next();
  const yearFolders = stageFolder.getFolders();
  while (yearFolders.hasNext()) {
    const yearFolder = yearFolders.next();
    const filesIter  = yearFolder.getFiles();
    while (filesIter.hasNext()) {
      const file = filesIter.next();
      if (file.getName().indexOf('tracker_') === 0) {
        try { file.removeEditor(employeeEmail); } catch (e) {}
      }
    }
  }
}

// ── Stage Day Folder ──────────────────────────────────────────

/**
 * Returns the day folder inside stage for the given Date,
 * creating year/month/day levels on demand if any are missing.
 * @param {GoogleAppsScript.Drive.Folder} stageFolder
 * @param {Date} date
 * @returns {GoogleAppsScript.Drive.Folder}
 */
function getOrCreateDayFolder_(stageFolder, date) {
  const year  = date.getFullYear();
  const month = date.getMonth();    // 0-based
  const day   = date.getDate();

  const yearFolder  = getOrCreateSubfolder_(stageFolder, String(year));
  const monthFolder = getOrCreateSubfolder_(yearFolder,  MONTH_NAMES[month]);
  const dayFolder   = getOrCreateSubfolder_(monthFolder, String(day).padStart(2, '0'));
  return dayFolder;
}

// ── Year Tracker Spreadsheet ──────────────────────────────────

/**
 * Returns the ID of the tracker spreadsheet for the given client/year,
 * creating it (with 12 month tabs + protections) if it does not exist yet.
 * @param {GoogleAppsScript.Drive.Folder} stageFolder
 * @param {number} year
 * @param {string} clientName
 * @returns {string} spreadsheet ID
 */
function getOrCreateYearTracker_(stageFolder, year, clientName) {
  const trackerName = 'tracker_' + clientName + '_' + year;
  const yearFolder  = getOrCreateSubfolder_(stageFolder, String(year));

  // Check if tracker already exists
  const fileIter = yearFolder.getFilesByName(trackerName);
  if (fileIter.hasNext()) {
    return fileIter.next().getId();
  }

  // Create new spreadsheet (lands in root Drive)
  const ss = SpreadsheetApp.create(trackerName);
  initTrackerSheets_(ss, year, clientName);

  // Move to year folder
  const ssFile = DriveApp.getFileById(ss.getId());
  ssFile.moveTo(yearFolder);

  // Install onOpen trigger so the Statix menu appears
  ScriptApp.newTrigger('trackerOnOpen')
    .forSpreadsheet(ss)
    .onOpen()
    .create();

  Logger.log('Tracker created: ' + trackerName);
  return ss.getId();
}

/**
 * Initialises a freshly-created tracker spreadsheet:
 * creates 12 monthly tabs, headers, checkbox validation, protections.
 */
function initTrackerSheets_(ss, year, clientName) {
  // Store searchable metadata on the spreadsheet
  ss.addDeveloperMetadata('statix_tracker', 'true');
  ss.addDeveloperMetadata('year', String(year));
  ss.addDeveloperMetadata('clientName', clientName);

  const defaultSheet = ss.getSheets()[0];

  for (let m = 0; m < MONTH_NAMES.length; m++) {
    const sheet   = ss.insertSheet(MONTH_NAMES[m]);
    const headers = ['اليوم', 'اسم الملف', 'رابط الملف', 'الحجم', 'تاريخ الرفع', 'الموظف', 'مكتمل', 'ملاحظة', 'حالة الاعتماد', 'حالة الإرسال للعميل'];

    // Header row
    sheet.getRange(1, 1, 1, headers.length)
      .setValues([headers])
      .setBackground('#1a73e8')
      .setFontColor('#ffffff')
      .setFontWeight('bold')
      .setHorizontalAlignment('center')
      .setVerticalAlignment('middle');
    sheet.setRowHeight(1, 32);
    sheet.setFrozenRows(1);

    // Column widths
    sheet.setColumnWidth(1, 70);   // Day
    sheet.setColumnWidth(2, 260);  // File Name
    sheet.setColumnWidth(3, 120);  // URL
    sheet.setColumnWidth(4, 80);   // Size
    sheet.setColumnWidth(5, 130);  // Upload Date
    sheet.setColumnWidth(6, 150);  // Employee
    sheet.setColumnWidth(7, 80);   // Finished
    sheet.setColumnWidth(8, 280);  // Note
    sheet.setColumnWidth(9, 180);  // Submit Status (employee)
    sheet.setColumnWidth(10, 200); // Send Status (supervisor)

    // Protect sheet — expose only Finished (G) + Note (H) to editors
    protectTrackerSheet_(sheet);

    Utilities.sleep(150);
  }

  ss.deleteSheet(defaultSheet);
}

/**
 * Protects a tracker sheet so that only G:H (Finished + Note) are editable
 * by non-owners. The owner bypasses all protections by default.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 */
function protectTrackerSheet_(sheet) {
  const prot = sheet.protect().setDescription('Statix — editable: Finished & Note only');
  // Remove all non-owner editors from the protection
  prot.removeEditors(prot.getEditors());
  if (prot.canDomainEdit()) prot.setDomainEdit(false);
  // Expose columns G (7) and H (8), rows 2 onward
  const lastRow = Math.max(sheet.getMaxRows(), 1000);
  prot.setUnprotectedRanges([sheet.getRange(2, 7, lastRow - 1, 2)]);
}

/**
 * Appends a row to the correct monthly tab in the tracker spreadsheet.
 * @param {string} trackerId  Spreadsheet ID
 * @param {Date}   date       Upload date (determines which tab)
 * @param {string} fileName
 * @param {string} fileUrl
 * @param {number} fileSize   bytes
 * @param {string} employeeName
 */
function appendTrackerRow_(trackerId, date, fileName, fileUrl, fileSize, employeeName) {
  const ss    = SpreadsheetApp.openById(trackerId);
  const month = date.getMonth(); // 0-based
  const sheet = ss.getSheetByName(MONTH_NAMES[month]);
  if (!sheet) {
    Logger.log('appendTrackerRow_: tab not found for month ' + MONTH_NAMES[month]);
    return;
  }

  const day     = date.getDate();
  const dateStr = Utilities.formatDate(date, Session.getScriptTimeZone(), 'dd/MM/yyyy');
  const sizeStr = fileSize < 1024
    ? fileSize + ' B'
    : fileSize < 1048576
    ? Math.round(fileSize / 1024) + ' KB'
    : (fileSize / 1048576).toFixed(1) + ' MB';

  sheet.appendRow([day, fileName, '🔗 فتح', sizeStr, dateStr, employeeName, false, '', '', '']);

  const lastRow = sheet.getLastRow();

  // Apply checkbox validation only to this new row
  sheet.getRange(lastRow, 7).setDataValidation(
    SpreadsheetApp.newDataValidation().requireCheckbox().build()
  );

  // Make the URL cell a hyperlink
  sheet.getRange(lastRow, 3).setRichTextValue(
    SpreadsheetApp.newRichTextValue()
      .setText('🔗 فتح')
      .setLinkUrl(0, '🔗 فتح'.length, fileUrl)
      .build()
  );
}

