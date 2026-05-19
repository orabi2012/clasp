// ============================================================
// 06_Uploads.gs
// Poll client uploads/ folders — move files to stage/<y>/<m>/<d>/,
// insert a row into the workflow sheet, notify employee + client.
// ============================================================

function checkUploadsForNewFiles() {
  const ssId  = PropertiesService.getScriptProperties().getProperty('MAIN_SS_ID');
  const ss    = ssId ? SpreadsheetApp.openById(ssId) : SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CUSTOMERS_SHEET_NAME);
  if (!sheet) return;

  const data        = sheet.getDataRange().getValues();
  const scriptOwner = Session.getEffectiveUser().getEmail();

  for (let i = 1; i < data.length; i++) {
    const folderId    = data[i][COL_FOLDER_ID    - 1];
    const employee    = data[i][COL_PREV_EMPLOYEE - 1] || data[i][COL_EMPLOYEE - 1];
    const clientName  = data[i][COL_NAME          - 1];
    const clientEmail = data[i][COL_EMAIL         - 1];
    const clientLang  = data[i][COL_LANG          - 1] || 'ar';
    const isActive    = data[i][COL_IS_ACTIVE     - 1]; // FALSE = deactivated

    if (!folderId || !employee) continue;

    // Skip deactivated clients — no new workflow rows should be created
    if (isActive === false) {
      Logger.log('[' + clientName + '] client is deactivated — skipping upload processing');
      continue;
    }

    try {
      const employeeEmail = getEmployeeEmail(employee, ss);
      if (!employeeEmail) {
        Logger.log('[' + clientName + '] no email for employee "' + employee + '" — skipping');
        continue;
      }

      const supData  = getSupervisorForEmployee_(employee, ss);
      const supName  = supData ? supData.name  : '';
      const supEmail = supData ? supData.email : '';

      const clientFolder = DriveApp.getFolderById(folderId);

      // -- Locate uploads/ folder --
      const uploadsIter = clientFolder.getFoldersByName(FOLDER_UPLOADS);
      if (!uploadsIter.hasNext()) {
        Logger.log('[' + clientName + '] no uploads/ folder — skipping');
        continue;
      }
      const uploadsFolder   = uploadsIter.next();
      const uploadsFolderId = uploadsFolder.getId();

      // -- Locate stage/ folder --
      const stageIter = clientFolder.getFoldersByName(FOLDER_STAGE);
      if (!stageIter.hasNext()) {
        Logger.log('[' + clientName + '] no stage/ folder — skipping');
        continue;
      }
      const stageFolder = stageIter.next();

      // -- Snapshot all non-script-owner files before moving --
      const fileMetaList = [];
      const filesIter    = uploadsFolder.getFiles();
      while (filesIter.hasNext()) {
        const f          = filesIter.next();
        const ownerEmail = f.getOwner() ? f.getOwner().getEmail() : '';
        if (ownerEmail === scriptOwner) {
          // Allow portal-uploaded files (tagged with clientUpload app property)
          var isClientUpload = false;
          try {
            var fileMeta = Drive.Files.get(f.getId(), { fields: 'appProperties' });
            isClientUpload = !!(fileMeta.appProperties && fileMeta.appProperties.clientUpload === 'true');
          } catch (e) { /* treat as non-portal file */ }
          if (!isClientUpload) {
            Logger.log('[' + clientName + '] skipped script-owner file: ' + f.getName());
            continue;
          }
        }
        fileMetaList.push({
          id:          f.getId(),
          name:        f.getName(),
          url:         f.getUrl(),
          size:        f.getSize(),
          dateCreated: f.getDateCreated(),
          description: f.getDescription() || ''
        });
      }

      if (fileMetaList.length === 0) {
        Logger.log('[' + clientName + '] uploads/ empty — nothing to do');
        continue;
      }

      Logger.log('[' + clientName + '] processing ' + fileMetaList.length + ' file(s)');

      // Group by day folder for batched notifications
      const dayGroups = {}; // { dayFolderId: { dayFolderUrl, date, files[] } }

      for (let fi = 0; fi < fileMetaList.length; fi++) {
        const meta       = fileMetaList[fi];
        const uploadDate = new Date(); // use today's date for stage folder bucketing

        try {
          // Ensure day folder exists
          const dayFolder = getOrCreateDayFolder_(stageFolder, uploadDate);

          // Move file from uploads/ to the day folder
          Drive.Files.update({}, meta.id, null, {
            addParents:    dayFolder.getId(),
            removeParents: uploadsFolderId
          });

          const year  = uploadDate.getFullYear();
          const month = MONTH_NAMES[uploadDate.getMonth()];
          const day   = uploadDate.getDate();

          // Insert a row into the workflow sheet
          try {
            wfInsertRow_({
              clientFolderId: folderId,
              clientName:     clientName,
              clientEmail:    clientEmail,
              clientLang:     clientLang,
              empName:        employee,
              empEmail:       employeeEmail,
              supName:        supName,
              supEmail:       supEmail,
              year:           year,
              month:          month,
              day:            day,
              fileName:          meta.name,
              fileUrl:           meta.url,
              uploadedAt:        uploadDate,
              clientDescription: meta.description
            });
          } catch (wfErr) {
            Logger.log('[' + clientName + '] workflow insert failed for "' + meta.name + '": ' + wfErr.message);
          }

          // Group for notification email
          const dayKey = dayFolder.getId();
          if (!dayGroups[dayKey]) {
            dayGroups[dayKey] = {
              dayFolderUrl: dayFolder.getUrl(),
              date:         uploadDate,
              files:        []
            };
          }
          dayGroups[dayKey].files.push({ name: meta.name, url: meta.url, size: meta.size });

          Logger.log('[' + clientName + '] moved: ' + meta.name + ' → stage/' + year + '/' + month);

        } catch (moveErr) {
          Logger.log('[' + clientName + '] failed to process "' + meta.name + '": ' + moveErr.message);
        }
      }

      // -- Send one notification pair per day folder --
      for (const dayKey in dayGroups) {
        const group   = dayGroups[dayKey];
        const dateStr = Utilities.formatDate(group.date, Session.getScriptTimeZone(), 'dd/MM/yyyy');

        try {
          sendUploadNotification(employeeEmail, employee, clientName, group.dayFolderUrl, group.files, dateStr, getPortalUrl_(), supEmail);
        } catch (err) {
          Logger.log('[' + clientName + '] employee notification error: ' + err.message);
        }

        try {
          if (clientEmail) {
            sendFilesReceivedEmail_(clientEmail, clientName, group.files, dateStr, clientLang);
          }
        } catch (err) {
          Logger.log('[' + clientName + '] client notification error: ' + err.message);
        }
      }

    } catch (err) {
      Logger.log('[' + clientName + '] error: ' + err.message);
    }
  }

  Logger.log('Upload check completed');
}

