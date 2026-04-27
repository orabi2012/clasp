// ============================================================
// 02_Helpers.gs
// Drive utilities, permissions, shortcuts & employee lookups
// ============================================================

// ── Drive Folder Utilities ────────────────────────────────────

/**
 * Retry a Drive operation up to maxTries times on transient "Service error: Drive" failures.
 * @param {Function} fn   Zero-arg function to attempt
 * @param {number}   maxTries
 */
function withDriveRetry_(fn, maxTries) {
  maxTries = maxTries || 4;
  var delay = 1000;
  for (var attempt = 1; attempt <= maxTries; attempt++) {
    try {
      return fn();
    } catch (err) {
      var msg = (err.message || '').toLowerCase();
      var isTransient = msg.indexOf('service error') !== -1 ||
                        msg.indexOf('rate limit')    !== -1 ||
                        msg.indexOf('quota')         !== -1 ||
                        msg.indexOf('backend error') !== -1 ||
                        msg.indexOf('timeout')       !== -1;
      if (!isTransient || attempt === maxTries) throw err;
      Logger.log('withDriveRetry_: attempt ' + attempt + ' failed (' + err.message + '), retrying in ' + delay + 'ms');
      Utilities.sleep(delay);
      delay *= 2;
    }
  }
}

function getOrCreateSubfolder_(parentFolder, folderName) {
  const iter = parentFolder.getFoldersByName(folderName);
  return iter.hasNext() ? iter.next() : withDriveRetry_(function() { return parentFolder.createFolder(folderName); });
}

function copyFolderContents_(sourceFolder, targetFolder, skipFolderNames) {
  const skip  = skipFolderNames || [];
  const files = sourceFolder.getFiles();
  while (files.hasNext()) {
    const file = files.next();
    (function(f) {
      withDriveRetry_(function() { f.makeCopy(f.getName(), targetFolder); });
    })(file);
  }

  const folders = sourceFolder.getFolders();
  while (folders.hasNext()) {
    const subFolder = folders.next();
    if (skip.indexOf(subFolder.getName()) !== -1) {
      // Create the folder but skip copying its contents (deferred)
      withDriveRetry_(function() { targetFolder.createFolder(subFolder.getName()); });
      continue;
    }
    const newSub = withDriveRetry_(function() { return targetFolder.createFolder(subFolder.getName()); });
    copyFolderContents_(subFolder, newSub, skip);
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
    // Folder already exists (possibly from a previously failed attempt).
    // Ensure all required subfolders are present in case they were never created.
    ensureFolders_(folder);
    return { folderId: folder.getId(), folderUrl: folder.getUrl() };
  }

  // Create the main folder — track it so we can roll back on failure
  const clientFolder = clientsFolder.createFolder(clientName);
  try {
    // Skip stage/ deep structure — built later as a deferred step.
    // Skip help/ — will be added as a shortcut to the template's help folder.
    copyFolderContents_(templateFolder, clientFolder, [FOLDER_STAGE, FOLDER_GUIDELINES]);

    // Remove the empty help/ folder that copyFolderContents_ created (skip semantics),
    // then add a shortcut to the template's help folder instead of duplicating its content.
    const helpInClientIter = clientFolder.getFoldersByName(FOLDER_GUIDELINES);
    if (helpInClientIter.hasNext()) {
      try { Drive.Files.remove(helpInClientIter.next().getId()); } catch (e) { /* ignore */ }
    }

    const helpInTemplateIter = templateFolder.getFoldersByName(FOLDER_GUIDELINES);
    if (helpInTemplateIter.hasNext()) {
      const helpTarget = helpInTemplateIter.next();
      Drive.Files.create({
        name:            FOLDER_GUIDELINES,
        mimeType:        'application/vnd.google-apps.shortcut',
        parents:         [clientFolder.getId()],
        shortcutDetails: { targetId: helpTarget.getId() }
      });
    }

    // Ensure all required subfolders exist (in case template is missing any).
    ensureFolders_(clientFolder);

    const uploadsIter = clientFolder.getFoldersByName(FOLDER_UPLOADS);
    const resultsIter = clientFolder.getFoldersByName(FOLDER_RESULTS);

    if (clientEmail && uploadsIter.hasNext()) {
      Utilities.sleep(500);
      drivePermCreate_({ role: 'writer', type: 'user', emailAddress: clientEmail },
        uploadsIter.next().getId());
    }

    if (clientEmail && resultsIter.hasNext()) {
      Utilities.sleep(500);
      drivePermCreate_({ role: 'reader', type: 'user', emailAddress: clientEmail },
        resultsIter.next().getId());
    }

    // Grant read access on the template's help folder once per client (shortcut target).
    if (clientEmail) {
      const helpInTemplateIter2 = templateFolder.getFoldersByName(FOLDER_GUIDELINES);
      if (helpInTemplateIter2.hasNext()) {
        Utilities.sleep(500);
        try {
          drivePermCreate_({ role: 'reader', type: 'user', emailAddress: clientEmail },
            helpInTemplateIter2.next().getId());
        } catch (permErr) {
          Logger.log('help folder perm grant failed for ' + clientEmail + ': ' + permErr.message);
        }
      }
    }

  } catch (err) {
    // ── Rollback: trash the partially-created folder so next attempt starts clean ──
    try { Drive.Files.remove(clientFolder.getId()); } catch (trashErr) {
      Logger.log('Rollback delete failed: ' + trashErr.message);
    }
    throw err; // re-throw so caller handles it
  }

  return { folderId: clientFolder.getId(), folderUrl: clientFolder.getUrl() };
}

// ── Permissions ───────────────────────────────────────────────

/**
 * Thin wrapper around Drive.Permissions.create that ignores the
 * 'Empty response' false-error the Drive API sometimes returns even
 * when the permission was successfully applied.
 */
function drivePermCreate_(resource, fileId) {
  try {
    Drive.Permissions.create(resource, fileId, { sendNotificationEmail: false });
  } catch (err) {
    if (err.message && err.message.indexOf('Empty response') !== -1) {
      Logger.log('drivePermCreate_: ignoring Empty response for fileId=' + fileId);
    } else {
      throw err; // real error — propagate
    }
  }
}

function assignEmployeePermissions(clientFolderId, employeeEmail) {
  const clientFolder = DriveApp.getFolderById(clientFolderId);

  // Root: reader only (employee navigates but cannot edit at root level)
  drivePermCreate_({ role: 'reader', type: 'user', emailAddress: employeeEmail }, clientFolderId);
  Utilities.sleep(300);

  // stage & results: writer — uploads is intentionally excluded (files arrive via automation)
  const writableFolders = [FOLDER_STAGE, FOLDER_RESULTS];
  for (let i = 0; i < writableFolders.length; i++) {
    const iter = clientFolder.getFoldersByName(writableFolders[i]);
    if (iter.hasNext()) {
      drivePermCreate_({ role: 'writer', type: 'user', emailAddress: employeeEmail }, iter.next().getId());
      Utilities.sleep(300);
    }
  }

  // ارشادات هامة: reader only
  const guidelinesIter = clientFolder.getFoldersByName(FOLDER_GUIDELINES);
  if (guidelinesIter.hasNext()) {
    drivePermCreate_({ role: 'reader', type: 'user', emailAddress: employeeEmail }, guidelinesIter.next().getId());
  }
}

/**
 * Changes the client's permission on their uploads folder.
 * role: 'writer' = active (can upload), 'reader' = deactivated (view only).
 * Uses Drive Advanced Service to suppress notification emails.
 */
function setClientUploadPermission_(clientFolderId, clientEmail, role) {
  var clientFolder = DriveApp.getFolderById(clientFolderId);
  var uploadsIter  = clientFolder.getFoldersByName(FOLDER_UPLOADS);
  if (!uploadsIter.hasNext()) {
    Logger.log('setClientUploadPermission_: no uploads folder found for ' + clientFolderId);
    return;
  }
  var uploadsFolderId = uploadsIter.next().getId();

  // Remove existing permission for this email (both editor and viewer), then re-grant
  // with the correct role — no notification email via Drive Advanced Service.
  var permsList = Drive.Permissions.list(uploadsFolderId,
    { fields: 'permissions(id,emailAddress,role)', supportsAllDrives: true });
  if (permsList.permissions) {
    for (var i = 0; i < permsList.permissions.length; i++) {
      var p = permsList.permissions[i];
      if ((p.emailAddress || '').toLowerCase() === clientEmail.toLowerCase()) {
        Drive.Permissions.remove(uploadsFolderId, p.id, { supportsAllDrives: true });
        Utilities.sleep(300);
        break;
      }
    }
  }

  drivePermCreate_({ role: role, type: 'user', emailAddress: clientEmail }, uploadsFolderId);
  Logger.log('setClientUploadPermission_: ' + clientEmail + ' → ' + role + ' on uploads of ' + clientFolderId);
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
      try { Drive.Files.remove(file.getId()); } catch (e) { file.setTrashed(true); }
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
      try { Drive.Files.remove(file.getId()); } catch (e) { file.setTrashed(true); }
      Logger.log('Shortcut removed: ' + employeeName + ' from supervisor folder of ' + supervisorName);
      return;
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

// ── Client deletion (full cleanup) ────────────────────────────

/**
 * Permanently deletes a client: revokes the assigned employee's permissions,
 * removes their shortcut, clears any open workflow rows, permanently removes
 * the client folder from Drive, then deletes the customers-sheet row.
 * Throws on hard failure (Drive folder removal).
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet  customers sheet
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} source  spreadsheet (for lookups)
 * @param {number} editedRow  1-based row index in customers sheet
 */
function deleteClientCompletely_(sheet, source, editedRow) {
  const rowData      = sheet.getRange(editedRow, 1, 1, COL_PREV_EMPLOYEE).getValues()[0];
  const folderId     = rowData[COL_FOLDER_ID     - 1];
  const clientName   = rowData[COL_NAME          - 1];
  const empNow       = rowData[COL_EMPLOYEE      - 1];
  const empPrev      = rowData[COL_PREV_EMPLOYEE - 1];
  const empName      = empNow || empPrev || '';

  // 1. Revoke employee permissions + remove their shortcut
  if (empName) {
    const empEmail = getEmployeeEmail(empName, source);
    if (empEmail && folderId) {
      try { removeEmployeePermissions(folderId, empEmail); }
      catch (err) { Logger.log('deleteClientCompletely_: revoke perms: ' + err.message); }
    }
    try { removeClientShortcutFromEmployee(empName, clientName); }
    catch (err) { Logger.log('deleteClientCompletely_: remove shortcut: ' + err.message); }
  }

  // 2. Clear any open workflow rows referencing this client
  if (folderId) {
    try { wfPatchOpenRowsByEmp_(folderId, '', '', '', ''); }
    catch (err) { Logger.log('deleteClientCompletely_: wfPatch: ' + err.message); }
  }

  // 3. Permanently remove the Drive folder (and ALL its contents)
  if (folderId) {
    try {
      withDriveRetry_(function() { Drive.Files.remove(folderId); }, 3);
      Logger.log('deleteClientCompletely_: removed folder ' + folderId);
    } catch (err) {
      Logger.log('deleteClientCompletely_: folder removal FAILED: ' + err.message);
      throw new Error('Failed to remove client folder from Drive: ' + err.message);
    }
  }

  // 4. Delete the customers-sheet row
  sheet.deleteRow(editedRow);
  SpreadsheetApp.flush();
  Logger.log('deleteClientCompletely_: deleted row ' + editedRow + ' (' + clientName + ')');
}