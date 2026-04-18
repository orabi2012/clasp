// ============================================================
// 02_Helpers.gs
// Helpers
// ============================================================

function getOrCreateSubfolder_(parentFolder, folderName) {
  const iter = parentFolder.getFoldersByName(folderName);
  return iter.hasNext() ? iter.next() : parentFolder.createFolder(folderName);
}

function copyFolderContents_(sourceFolder, targetFolder) {
  const files = sourceFolder.getFiles();
  while (files.hasNext()) {
    const file = files.next();
    file.makeCopy(file.getName(), targetFolder);
  }

  const folders = sourceFolder.getFolders();
  while (folders.hasNext()) {
    const subFolder = folders.next();
    const newSubFolder = targetFolder.createFolder(subFolder.getName());
    copyFolderContents_(subFolder, newSubFolder);
  }
}

function getEmployeeEmail(employeeName, spreadsheet) {
  const empSheet = spreadsheet.getSheetByName(EMPLOYEES_SHEET_NAME);
  if (!empSheet) return null;

  const data = empSheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === employeeName) return data[i][2]; // ✅ C = index 2
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
        phone: data[i][3]  // ✅ D = index 3
      };
    }
  }

  return { name: employeeName, job: '', email: '', phone: '' };
}

function createClientFolder(clientName, clientEmail) {
  const clientsFolder = DriveApp.getFolderById(CLIENTS_FOLDER_ID);
  const templateFolder = DriveApp.getFolderById(TEMPLATE_FOLDER_ID);

  const existing = clientsFolder.getFoldersByName(clientName);
  if (existing.hasNext()) {
    const f = existing.next();
    return { folderId: f.getId(), folderUrl: f.getUrl() };
  }

  const clientFolder = clientsFolder.createFolder(clientName);
  copyFolderContents_(templateFolder, clientFolder);

  const uploadsIter = clientFolder.getFoldersByName('uploads');
  const resultsIter = clientFolder.getFoldersByName('results');

  const uploadsFolder = uploadsIter.hasNext() ? uploadsIter.next() : null;
  const resultsFolder = resultsIter.hasNext() ? resultsIter.next() : null;

  if (clientEmail && uploadsFolder) {
    Utilities.sleep(500);
    Drive.Permissions.create(
      { role: 'writer', type: 'user', emailAddress: clientEmail },
      uploadsFolder.getId(),
      { sendNotificationEmail: false }
    );
  }

  if (clientEmail && resultsFolder) {
    Utilities.sleep(500);
    Drive.Permissions.create(
      { role: 'reader', type: 'user', emailAddress: clientEmail },
      resultsFolder.getId(),
      { sendNotificationEmail: false }
    );
  }

  return { folderId: clientFolder.getId(), folderUrl: clientFolder.getUrl() };
}

function assignEmployeePermissions(clientFolderId, employeeEmail) {
  Drive.Permissions.create(
    { role: 'writer', type: 'user', emailAddress: employeeEmail },
    clientFolderId,
    { sendNotificationEmail: false }
  );
}



function removeEmployeePermissions(clientFolderId, employeeEmail) {
  const clientFolder = DriveApp.getFolderById(clientFolderId);

  // ── سحب من المجلد الرئيسي ──
  try { clientFolder.removeViewer(employeeEmail); } catch (e) {}

  Utilities.sleep(300);

  const uploadsIter = clientFolder.getFoldersByName('uploads');
  if (uploadsIter.hasNext()) {
    try { uploadsIter.next().removeEditor(employeeEmail); } catch (e) {}
  }

  Utilities.sleep(500);

  const stageIter = clientFolder.getFoldersByName('stage');
  if (stageIter.hasNext()) {
    try { stageIter.next().removeEditor(employeeEmail); } catch (e) {}
  }

  Utilities.sleep(500);

  const resultsIter = clientFolder.getFoldersByName('results');
  if (resultsIter.hasNext()) {
    try { resultsIter.next().removeEditor(employeeEmail); } catch (e) {}
  }
}

// ============================================================
// إدارة مجلد الموظف والـ Shortcuts
// ============================================================

function getOrCreateEmployeeFolder(employeeName, employeeEmail, spreadsheet) {
  const employeesFolder = DriveApp.getFolderById(EMPLOYEES_FOLDER_ID);
  const folderName      = employeeName.replace(/\s+/g, '_');

  let empFolder;
  const existing = employeesFolder.getFoldersByName(folderName);

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
        Logger.log('تحذير صلاحية مجلد الموظف: ' + err.message);
      }
    }

    Logger.log('تم إنشاء مجلد الموظف: ' + folderName);
  }

  // ── حفظ URL دايماً لو الخلية فاضية ── ✅
  if (spreadsheet) {
    try {
      const empSheet = spreadsheet.getSheetByName(EMPLOYEES_SHEET_NAME);
      if (empSheet) {
        const data = empSheet.getDataRange().getValues();
        for (let i = 1; i < data.length; i++) {
          if (data[i][0] === employeeName) {
            const existingUrl = data[i][COL_EMP_FOLDER_URL - 1];

            if (!existingUrl) { // ← يحفظ لو فاضي سواء جديد أو قديم
              const cell     = empSheet.getRange(i + 1, COL_EMP_FOLDER_URL);
              const richText = SpreadsheetApp.newRichTextValue()
                .setText(employeeName)
                .setLinkUrl(empFolder.getUrl())
                .build();
              cell.setRichTextValue(richText);
            }
            break;
          }
        }
      }
    } catch (err) {
      Logger.log('تحذير حفظ URL الموظف: ' + err.message);
    }
  }

  return empFolder;
}
// ── إضافة shortcut لمجلد العميل داخل مجلد الموظف ──
function addClientShortcutToEmployee(employeeName, employeeEmail, clientFolderId, clientName, spreadsheet) {
  const empFolder = getOrCreateEmployeeFolder(employeeName, employeeEmail, spreadsheet);

  // تحقق إن الـ shortcut مش موجود بالفعل
  const existing = empFolder.getFilesByName(clientName);
  while (existing.hasNext()) {
    const f = existing.next();
    if (f.getMimeType() === 'application/vnd.google-apps.shortcut') {
      Logger.log('Shortcut موجود بالفعل: ' + clientName);
      return;
    }
  }

  // إنشاء الـ shortcut
  Drive.Files.create({
    name:     clientName,
    mimeType: 'application/vnd.google-apps.shortcut',
    parents:  [empFolder.getId()],
    shortcutDetails: {
      targetId: clientFolderId
    }
  });

  Logger.log('تم إنشاء shortcut لـ ' + clientName + ' في مجلد ' + employeeName);
}
// ── حذف shortcut العميل من مجلد الموظف ──
function removeClientShortcutFromEmployee(employeeName, clientName) {
  const employeesFolder = DriveApp.getFolderById(EMPLOYEES_FOLDER_ID);
  const folderName      = employeeName.replace(/\s+/g, '_');

  const empFolderIter = employeesFolder.getFoldersByName(folderName);
  if (!empFolderIter.hasNext()) return;

  const empFolder  = empFolderIter.next();
  const filesIter  = empFolder.getFilesByName(clientName);

  while (filesIter.hasNext()) {
    const file = filesIter.next();
    if (file.getMimeType() === 'application/vnd.google-apps.shortcut') {
      file.setTrashed(true);
      Logger.log('تم حذف shortcut لـ ' + clientName + ' من مجلد ' + employeeName);
      return;
    }
  }
}