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

  // uploads & stage & results: writer
  const writableFolders = [FOLDER_UPLOADS, FOLDER_STAGE, FOLDER_RESULTS];
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

