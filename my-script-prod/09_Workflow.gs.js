// ============================================================
// 09_Workflow.gs
// Central workflow data layer — read/write the `workflow` sheet
// and append to `workflow_audit`.
// All portal API actions go through these helpers.
// ============================================================

// ── UUID generator ─────────────────────────────────────────────

function wfUuid_() {
  const hex = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx';
  return hex.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// ── Sheet accessors ────────────────────────────────────────────

function wfSheet_() {
  const ss = SpreadsheetApp.openById(
    PropertiesService.getScriptProperties().getProperty('MAIN_SS_ID') ||
    SpreadsheetApp.getActiveSpreadsheet().getId()
  );
  const sh = ss.getSheetByName(WORKFLOW_SHEET_NAME);
  if (!sh) throw new Error('workflow sheet not found — run setupTriggers() first');
  return sh;
}

function wfAuditSheet_() {
  const ss = SpreadsheetApp.openById(
    PropertiesService.getScriptProperties().getProperty('MAIN_SS_ID') ||
    SpreadsheetApp.getActiveSpreadsheet().getId()
  );
  return ss.getSheetByName(WORKFLOW_AUDIT_SHEET_NAME);
}

// ── Audit write ────────────────────────────────────────────────

function wfAudit_(actorEmail, action, wfId, clientName, fileName, details) {
  try {
    const sh = wfAuditSheet_();
    if (!sh) return;
    sh.appendRow([
      new Date(),
      actorEmail || '',
      action,
      wfId || '',
      clientName || '',
      fileName || '',
      details ? JSON.stringify(details) : ''
    ]);
  } catch (err) {
    Logger.log('wfAudit_ error: ' + err.message);
  }
}

// ── Insert ─────────────────────────────────────────────────────

/**
 * Insert a new workflow row.
 * @param {Object} rec  Fields matching WF_COL_* columns.
 * @returns {string} Generated uuid.
 */
function wfInsertRow_(rec) {
  const id  = wfUuid_();
  const now = new Date();
  const sh  = wfSheet_();
  sh.appendRow([
    id,                             // A id
    rec.clientFolderId  || '',      // B
    rec.clientName      || '',      // C
    rec.clientEmail     || '',      // D
    rec.clientLang      || 'ar',    // E
    rec.empName         || '',      // F
    rec.empEmail        || '',      // G
    rec.supName         || '',      // H
    rec.supEmail        || '',      // I
    rec.year            || '',      // J
    rec.month           || '',      // K
    rec.day             || '',      // L
    rec.fileName        || '',      // M
    rec.fileUrl         || '',      // N
    rec.uploadedAt      || now,     // O
    false,                          // P finished
    '',                             // Q note
    'new',                          // R status
    '',                             // S submittedAt
    '',                             // T sentAt
    0,                              // U returnCount
    '',                             // V lastReturnNote
    now                             // W lastUpdated
  ]);
  wfAudit_(rec.empEmail, 'inserted', id, rec.clientName, rec.fileName, null);
  return id;
}

// ── Read all rows as objects ────────────────────────────────────

function wfAllRows_() {
  const sh   = wfSheet_();
  const data = sh.getDataRange().getValues();
  const rows = [];
  for (let i = 1; i < data.length; i++) {
    rows.push(wfRowToObj_(data[i], i + 1));
  }
  return rows;
}

function wfRowToObj_(row, sheetRowNum) {
  return {
    _row:          sheetRowNum,
    id:            row[WF_COL_ID           - 1],
    clientFolderId:row[WF_COL_CLIENT_FID   - 1],
    clientName:    row[WF_COL_CLIENT_NAME  - 1],
    clientEmail:   row[WF_COL_CLIENT_EMAIL - 1],
    clientLang:    row[WF_COL_CLIENT_LANG  - 1],
    empName:       row[WF_COL_EMP_NAME     - 1],
    empEmail:      row[WF_COL_EMP_EMAIL    - 1],
    supName:       row[WF_COL_SUP_NAME_WF  - 1],
    supEmail:      row[WF_COL_SUP_EMAIL_WF - 1],
    year:          row[WF_COL_YEAR         - 1],
    month:         row[WF_COL_MONTH        - 1],
    day:           row[WF_COL_DAY          - 1],
    fileName:      row[WF_COL_FILE_NAME    - 1],
    fileUrl:       row[WF_COL_FILE_URL     - 1],
    uploadedAt:    row[WF_COL_UPLOADED_AT  - 1],
    finished:      row[WF_COL_FINISHED     - 1],
    note:          row[WF_COL_NOTE         - 1],
    status:        row[WF_COL_STATUS       - 1],
    submittedAt:   row[WF_COL_SUBMITTED_AT - 1],
    sentAt:        row[WF_COL_SENT_AT      - 1],
    returnCount:   row[WF_COL_RETURN_COUNT - 1],
    lastReturnNote:row[WF_COL_LAST_RETURN_NOTE - 1],
    lastUpdated:   row[WF_COL_LAST_UPDATED - 1]
  };
}

// ── Update by ID ───────────────────────────────────────────────

/**
 * Patch a workflow row by its uuid.
 * @param {string} id
 * @param {Object} patch  key→value for WF_COL_* aligned fields.
 * @returns {Object|null}  Updated row object, or null if not found.
 */
function wfUpdateById_(id, patch) {
  const sh   = wfSheet_();
  const data = sh.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][WF_COL_ID - 1]) === String(id)) {
      const colMap = {
        finished:      WF_COL_FINISHED,
        note:          WF_COL_NOTE,
        status:        WF_COL_STATUS,
        submittedAt:   WF_COL_SUBMITTED_AT,
        sentAt:        WF_COL_SENT_AT,
        returnCount:   WF_COL_RETURN_COUNT,
        lastReturnNote:WF_COL_LAST_RETURN_NOTE,
        lastUpdated:   WF_COL_LAST_UPDATED
      };
      patch.lastUpdated = new Date();
      for (const key in patch) {
        if (colMap[key]) {
          sh.getRange(i + 1, colMap[key]).setValue(patch[key]);
        }
      }
      SpreadsheetApp.flush();
      return wfRowToObj_(sh.getRange(i + 1, 1, 1, WF_NUM_COLS).getValues()[0], i + 1);
    }
  }
  return null;
}

// ── Query helpers ──────────────────────────────────────────────

function wfListByClientFolderId_(clientFolderId, statusFilter) {
  return wfAllRows_().filter(function(r) {
    if (String(r.clientFolderId) !== String(clientFolderId)) return false;
    if (statusFilter && r.status !== statusFilter) return false;
    return true;
  });
}

function wfListByEmpEmail_(empEmail) {
  const email = (empEmail || '').toLowerCase();
  return wfAllRows_().filter(function(r) {
    return (r.empEmail || '').toLowerCase() === email;
  });
}

function wfListBySupEmail_(supEmail, statusFilter) {
  const email = (supEmail || '').toLowerCase();
  return wfAllRows_().filter(function(r) {
    if ((r.supEmail || '').toLowerCase() !== email) return false;
    if (statusFilter && r.status !== statusFilter) return false;
    return true;
  });
}

function wfFindByFileUrl_(fileUrl) {
  const url = (fileUrl || '').trim();
  return wfAllRows_().find(function(r) {
    return (r.fileUrl || '').trim() === url;
  }) || null;
}

function wfFindById_(id) {
  return wfAllRows_().find(function(r) { return String(r.id) === String(id); }) || null;
}

/**
 * Paginate + search a list of rows.
 * @param {Object[]} rows
 * @param {string}  q         Text search against fileName / clientName
 * @param {number}  page      0-based
 * @param {number}  pageSize
 * @returns {{ rows, total, page, pageSize }}
 */
function wfPaginate_(rows, q, page, pageSize) {
  if (q) {
    const lq = q.toLowerCase();
    rows = rows.filter(function(r) {
      return (r.fileName || '').toLowerCase().indexOf(lq) !== -1 ||
             (r.clientName || '').toLowerCase().indexOf(lq) !== -1;
    });
  }
  const total = rows.length;
  page     = page     || 0;
  pageSize = pageSize || 50;
  const sliced = rows.slice(page * pageSize, (page + 1) * pageSize);
  return { rows: sliced, total: total, page: page, pageSize: pageSize };
}

// ── Bulk reassignment patches ──────────────────────────────────

/**
 * Patch supName/supEmail on all open rows belonging to a given employee.
 * Called automatically when the employee's supervisor is changed in the sheet.
 * "Open" = any status except 'approved_sent'.
 */
function wfPatchOpenRowsBySup_(empEmail, newSupName, newSupEmail) {
  const email  = (empEmail || '').toLowerCase();
  const sh     = wfSheet_();
  const data   = sh.getDataRange().getValues();
  let count    = 0;
  for (let i = 1; i < data.length; i++) {
    if ((String(data[i][WF_COL_EMP_EMAIL - 1])).toLowerCase() !== email) continue;
    if (String(data[i][WF_COL_STATUS - 1]) === 'approved_sent') continue;
    sh.getRange(i + 1, WF_COL_SUP_NAME_WF).setValue(newSupName  || '');
    sh.getRange(i + 1, WF_COL_SUP_EMAIL_WF).setValue(newSupEmail || '');
    sh.getRange(i + 1, WF_COL_LAST_UPDATED).setValue(new Date());
    count++;
  }
  if (count) SpreadsheetApp.flush();
  Logger.log('wfPatchOpenRowsBySup_: patched ' + count + ' open row(s) for emp=' + empEmail);
  return count;
}

/**
 * Patch empName/empEmail/supName/supEmail on all open rows for a clientFolderId.
 * Called automatically when the client's assigned employee is changed in the sheet.
 * "Open" = any status except 'approved_sent'.
 */
function wfPatchOpenRowsByEmp_(clientFolderId, newEmpName, newEmpEmail, newSupName, newSupEmail) {
  const sh   = wfSheet_();
  const data = sh.getDataRange().getValues();
  let count  = 0;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][WF_COL_CLIENT_FID - 1]) !== String(clientFolderId)) continue;
    if (String(data[i][WF_COL_STATUS     - 1]) === 'approved_sent') continue;
    sh.getRange(i + 1, WF_COL_EMP_NAME).setValue(newEmpName   || '');
    sh.getRange(i + 1, WF_COL_EMP_EMAIL).setValue(newEmpEmail  || '');
    sh.getRange(i + 1, WF_COL_SUP_NAME_WF).setValue(newSupName  || '');
    sh.getRange(i + 1, WF_COL_SUP_EMAIL_WF).setValue(newSupEmail || '');
    sh.getRange(i + 1, WF_COL_LAST_UPDATED).setValue(new Date());
    count++;
  }
  if (count) SpreadsheetApp.flush();
  Logger.log('wfPatchOpenRowsByEmp_: patched ' + count + ' open row(s) for clientFolderId=' + clientFolderId);
  return count;
}
