// ============================================================
// 06_Uploads.gs
// Poll client uploads/ folders — move files to stage/<y>/<m>/<d>/,
// index in tracker spreadsheet, notify employee + client.
// ============================================================

function checkUploadsForNewFiles() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
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

    if (!folderId || !employee) continue;

    try {
      const employeeEmail = getEmployeeEmail(employee, ss);
      if (!employeeEmail) {
        Logger.log('[' + clientName + '] no email for employee "' + employee + '" — skipping');
        continue;
      }

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
          Logger.log('[' + clientName + '] skipped script-owner file: ' + f.getName());
          continue;
        }
        fileMetaList.push({
          id:          f.getId(),
          name:        f.getName(),
          url:         f.getUrl(),
          size:        f.getSize(),
          dateCreated: f.getDateCreated()
        });
      }

      if (fileMetaList.length === 0) {
        Logger.log('[' + clientName + '] uploads/ empty — nothing to do');
        continue;
      }

      Logger.log('[' + clientName + '] processing ' + fileMetaList.length + ' file(s)');

      // -- Move each file and index in tracker --
      // Group by day-folder ID for batched notifications
      const dayGroups    = {}; // { dayFolderId: { dayFolderUrl, date, files[] } }
      const trackerCache = {}; // { year: trackerId }

      for (let fi = 0; fi < fileMetaList.length; fi++) {
        const meta       = fileMetaList[fi];
        const uploadDate = meta.dateCreated;

        try {
          // Ensure day folder exists
          const dayFolder = getOrCreateDayFolder_(stageFolder, uploadDate);

          // Move file from uploads/ to the day folder
          Drive.Files.update({}, meta.id, null, {
            addParents:    dayFolder.getId(),
            removeParents: uploadsFolderId
          });

          // Get/create year tracker (cached per year to avoid repeated Drive calls)
          const year = uploadDate.getFullYear();
          if (!trackerCache[year]) {
            trackerCache[year] = getOrCreateYearTracker_(stageFolder, year, clientName);
          }
          appendTrackerRow_(trackerCache[year], uploadDate, meta.name, meta.url, meta.size, employee);

          // ── Dual-write into workflow sheet ─────────────────────
          try {
            if (!wfFindByFileUrl_(meta.url)) {
              const supData  = getSupervisorForEmployee_(employee, ss);
              const month    = MONTH_NAMES[uploadDate.getMonth()];
              wfInsertRow_({
                clientFolderId: folderId,
                clientName:     clientName,
                clientEmail:    clientEmail,
                clientLang:     clientLang,
                empName:        employee,
                empEmail:       employeeEmail,
                supName:        supData ? supData.name  : '',
                supEmail:       supData ? supData.email : '',
                year:           year,
                month:          month,
                day:            uploadDate.getDate(),
                fileName:       meta.name,
                fileUrl:        meta.url,
                uploadedAt:     uploadDate
              });
            }
          } catch (wfErr) {
            Logger.log('[' + clientName + '] workflow insert error: ' + wfErr.message);
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

          Logger.log('[' + clientName + '] moved: ' + meta.name + ' → stage/' + year + '/' + uploadDate.getMonth());

        } catch (moveErr) {
          Logger.log('[' + clientName + '] failed to process "' + meta.name + '": ' + moveErr.message);
        }
      }

      // -- Send one notification pair per day folder --
      for (const dayKey in dayGroups) {
        const group    = dayGroups[dayKey];
        const dateStr  = Utilities.formatDate(group.date, Session.getScriptTimeZone(), 'dd/MM/yyyy');

        try {
          // Build tracker URL pointing to the correct month tab
          const tYear     = group.date.getFullYear();
          const tMonthIdx = group.date.getMonth();
          let trackerUrl  = 'https://docs.google.com/spreadsheets/d/' + (trackerCache[tYear] || '') + '/edit';
          if (trackerCache[tYear]) {
            try {
              const tSheet = SpreadsheetApp.openById(trackerCache[tYear]).getSheetByName(MONTH_NAMES[tMonthIdx]);
              if (tSheet) trackerUrl += '#gid=' + tSheet.getSheetId();
            } catch (e) { /* keep base URL */ }
          }
          sendUploadNotification(employeeEmail, employee, clientName, group.dayFolderUrl, group.files, dateStr, trackerUrl);
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

