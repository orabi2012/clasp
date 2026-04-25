// ============================================================
// 10_Portal_Api.gs
// Unified web app entry point:
//   • Client-registration form (legacy doGet ?action=check, doPost)
//   • Employee/Supervisor portal API (requires GIS ID token verification)
//
// All portal actions carry the GIS ID token in the request body
// field `id_token`.  The token is verified via Google tokeninfo.
// The verified email drives all authorization checks — never trust
// a client-supplied email field.
//
// PORTAL_GIS_CLIENT_ID must be set in Script Properties.
// ============================================================

// ── Constants ─────────────────────────────────────────────────

// Set this in Apps Script → Project Settings → Script Properties:
//   key: PORTAL_CLIENT_ID
//   value: <your portal OAuth 2.0 client ID>
var PORTAL_CLIENT_ID_PROP = 'PORTAL_CLIENT_ID';

// ── Token verification ─────────────────────────────────────────

/**
 * Verifies a GIS credential (ID token JWT) via Google's tokeninfo endpoint.
 * Returns { email, name, picture } or throws an error.
 */
function verifyIdToken_(idToken) {
  if (!idToken) throw new Error('missing id_token');

  // Fast path: try tokeninfo endpoint
  var resp = UrlFetchApp.fetch(
    'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken),
    { muteHttpExceptions: true }
  );
  if (resp.getResponseCode() !== 200) {
    throw new Error('invalid id_token (tokeninfo status ' + resp.getResponseCode() + ')');
  }
  var payload = JSON.parse(resp.getContentText());

  // Audience check
  var clientId = PropertiesService.getScriptProperties().getProperty(PORTAL_CLIENT_ID_PROP);
  if (clientId && payload.aud !== clientId) {
    throw new Error('id_token aud mismatch');
  }

  if (!payload.email_verified || payload.email_verified === 'false') {
    throw new Error('email not verified');
  }

  return { email: payload.email, name: payload.name || '', picture: payload.picture || '' };
}

// ── Role lookup ────────────────────────────────────────────────

function resolveRole_(email) {
  var lc  = (email || '').toLowerCase();
  var ssId = PropertiesService.getScriptProperties().getProperty('MAIN_SS_ID');
  var ss  = ssId ? SpreadsheetApp.openById(ssId) : SpreadsheetApp.getActiveSpreadsheet();

  var empSheet = ss.getSheetByName(EMPLOYEES_SHEET_NAME);
  if (empSheet && empSheet.getLastRow() > 1) {
    var empData = empSheet.getDataRange().getValues();
    for (var i = 1; i < empData.length; i++) {
      if ((String(empData[i][COL_EMP_EMAIL - 1] || '')).toLowerCase() === lc) {
        return {
          role:       'employee',
          name:       empData[i][COL_EMP_NAME - 1],
          email:      email,
          supervisor: empData[i][COL_EMP_SUPERVISOR - 1] || null
        };
      }
    }
  }

  var supSheet = ss.getSheetByName(SUPERVISORS_SHEET_NAME);
  if (supSheet && supSheet.getLastRow() > 1) {
    var supData = supSheet.getDataRange().getValues();
    for (var j = 1; j < supData.length; j++) {
      if ((String(supData[j][COL_SUP_EMAIL - 1] || '')).toLowerCase() === lc) {
        return {
          role:  'supervisor',
          name:  supData[j][COL_SUP_NAME - 1],
          email: email
        };
      }
    }
  }

  return { role: null, email: email };
}

// ── JSON response helpers ──────────────────────────────────────

function ok_(data) {
  return ContentService.createTextOutput(JSON.stringify({ ok: true, data: data }))
    .setMimeType(ContentService.MimeType.JSON);
}

function err_(message, code) {
  return ContentService.createTextOutput(JSON.stringify({ ok: false, error: message, code: code || 400 }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── doGet ──────────────────────────────────────────────────────
// Handles:
//   ?action=check&email=xxx              — client-form duplicate check (public)
//   ?action=me&id_token=xxx              — role lookup
//   ?action=listMyClients&id_token=xxx   — clients list
//   ?action=listRows&...                 — paginated rows
//   ?action=listPending&id_token=xxx     — supervisor pending items
//   ?action=listAudit&id=xxx&id_token=xx — audit history for one workflow row

function doGet(e) {
  var params = (e && e.parameter) ? e.parameter : {};
  var action = params.action || '';

  // ── Public: client-registration duplicate check ─────────────
  if (action === 'check') {
    return handleCheck_(params);
  }

  // ── Authenticated portal actions ────────────────────────────
  var caller;
  try { caller = verifyIdToken_(params.id_token); }
  catch (ex) { return err_(ex.message, 401); }

  var roleInfo = resolveRole_(caller.email);

  try {
    switch (action) {
      case 'me':            return ok_(roleInfo);
      case 'listMyClients': return handleListMyClients_(roleInfo);
      case 'listRows':      return handleListRows_(params, roleInfo);
      case 'listPending':   return handleListPending_(roleInfo);
      case 'listAudit':     return handleListAudit_(params, roleInfo);
      // Write actions are POST-only — reject any GET attempt
      case 'setFinished':
      case 'setNote':
      case 'submitDay':
      case 'approveAndSend':
      case 'returnToEmp':
        return err_('action \'' + action + '\' requires POST', 405);
      default:
        return err_('unknown action: ' + action);
    }
  } catch (ex) {
    Logger.log('doGet error: ' + ex.message);
    return err_(ex.message, 500);
  }
}

// ── doPost ─────────────────────────────────────────────────────
// Handles:
//   (no action field) → client-form registration (public, legacy)
//   body.action === 'setFinished'    — toggle finished flag
//   body.action === 'setNote'        — update note
//   body.action === 'submitDay'      — batch submit a day
//   body.action === 'approveAndSend' — supervisor approve + email client
//   body.action === 'returnToEmp'    — supervisor return rows to emp

function doPost(e) {
  var body;
  try { body = JSON.parse(e.postData.contents); }
  catch (ex) { return err_('invalid JSON body'); }

  // ── Public: client-registration ─────────────────────────────
  if (!body.action) {
    return handleClientFormPost_(body);
  }

  // ── Authenticated portal actions ────────────────────────────
  var caller;
  try { caller = verifyIdToken_(body.id_token); }
  catch (ex) { return err_(ex.message, 401); }

  var roleInfo = resolveRole_(caller.email);

  try {
    switch (body.action) {
      case 'setFinished':    return handleSetFinished_(body, roleInfo);
      case 'setNote':        return handleSetNote_(body, roleInfo);
      case 'submitDay':      return handleSubmitDay_(body, roleInfo);
      case 'approveAndSend': return handleApproveAndSend_(body, roleInfo);
      case 'returnToEmp':    return handleReturnToEmp_(body, roleInfo);
      default:
        return err_('unknown action: ' + body.action);
    }
  } catch (ex) {
    Logger.log('doPost error [' + body.action + ']: ' + ex.message);
    return err_(ex.message, 500);
  }
}

// ── Client-form handlers ───────────────────────────────────────

function handleCheck_(params) {
  var email   = (params.email || '').toLowerCase().trim();
  var ssId    = PropertiesService.getScriptProperties().getProperty('MAIN_SS_ID');
  var ss      = ssId ? SpreadsheetApp.openById(ssId) : SpreadsheetApp.getActiveSpreadsheet();
  var sheet   = ss.getSheetByName(CUSTOMERS_SHEET_NAME);
  var exists  = false;
  if (sheet && sheet.getLastRow() > 1) {
    var emails = sheet.getRange(2, 2, sheet.getLastRow() - 1, 1).getValues();
    exists = emails.some(function(row) {
      return (row[0] || '').toLowerCase().trim() === email;
    });
  }
  return ContentService.createTextOutput(JSON.stringify({ exists: exists }))
    .setMimeType(ContentService.MimeType.JSON);
}

function handleClientFormPost_(data) {
  try {
    submitClient(data);
    return ContentService.createTextOutput(JSON.stringify({ status: 'ok' }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function submitClient(data) {
  var ssId  = PropertiesService.getScriptProperties().getProperty('MAIN_SS_ID');
  var ss    = ssId ? SpreadsheetApp.openById(ssId) : SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(CUSTOMERS_SHEET_NAME);
  if (!sheet) throw new Error('Sheet not found: ' + CUSTOMERS_SHEET_NAME);
  var lang = data.lang || 'ar';
  sheet.appendRow([
    new Date(),    data.email,   data.name,     data.phone,
    data.taxNumber, data.crNumber,
    data.date1,    data.date2,   data.date3,    data.date4,
    lang
  ]);
  var newRow   = sheet.getLastRow();
  var langCell = sheet.getRange(newRow, COL_LANG);
  langCell
    .setBackground(lang === 'ar' ? '#e8f0fe' : '#fce8e6')
    .setFontColor(lang === 'ar' ? '#1967d2' : '#c5221f')
    .setFontWeight('bold').setHorizontalAlignment('center');
  var bg = newRow % 2 === 0 ? '#e8f0fe' : '#ffffff';
  sheet.getRange(newRow, 1, 1, 15).setBackground(bg);
  langCell
    .setBackground(lang === 'ar' ? '#e8f0fe' : '#fce8e6')
    .setFontColor(lang === 'ar' ? '#1967d2' : '#c5221f')
    .setFontWeight('bold').setHorizontalAlignment('center');
}

// ── Portal GET handlers ────────────────────────────────────────

function handleListMyClients_(roleInfo) {
  if (!roleInfo.role) return err_('not authorized', 403);

  var rows;
  if (roleInfo.role === 'employee') {
    rows = wfListByEmpEmail_(roleInfo.email);
  } else {
    rows = wfListBySupEmail_(roleInfo.email, null);
  }

  // Group by clientFolderId
  var clientMap = {};
  rows.forEach(function(r) {
    var key = r.clientFolderId;
    if (!clientMap[key]) {
      clientMap[key] = {
        clientFolderId: r.clientFolderId,
        clientName:     r.clientName,
        clientEmail:    r.clientEmail,
        empName:        r.empName,
        empEmail:       r.empEmail,
        supName:        r.supName,
        counts: { total: 0, new: 0, in_progress: 0, submitted: 0, approved_sent: 0, returned: 0 }
      };
    }
    clientMap[key].counts.total++;
    if (clientMap[key].counts[r.status] !== undefined) clientMap[key].counts[r.status]++;
  });

  return ok_(Object.values(clientMap));
}

function handleListRows_(params, roleInfo) {
  if (!roleInfo.role) return err_('not authorized', 403);

  var clientFolderId = params.clientFolderId || '';
  var statusFilter   = params.status   || null;
  var q              = params.q        || '';
  var page           = parseInt(params.page     || 0);
  var pageSize       = parseInt(params.pageSize || 50);

  var rows;
  if (roleInfo.role === 'employee') {
    rows = wfListByClientFolderId_(clientFolderId, statusFilter).filter(function(r) {
      return (r.empEmail || '').toLowerCase() === roleInfo.email.toLowerCase();
    });
  } else {
    // supervisor can see all rows of this client if it's under one of their employees
    rows = wfListByClientFolderId_(clientFolderId, statusFilter).filter(function(r) {
      return (r.supEmail || '').toLowerCase() === roleInfo.email.toLowerCase();
    });
  }

  return ok_(wfPaginate_(rows, q, page, pageSize));
}

function handleListPending_(roleInfo) {
  if (roleInfo.role !== 'supervisor') return err_('supervisor only', 403);
  var rows = wfListBySupEmail_(roleInfo.email, null); // all statuses — supervisor sees full history

  // Group by clientFolderId
  var clientMap = {};
  rows.forEach(function(r) {
    var key = r.clientFolderId;
    if (!clientMap[key]) {
      clientMap[key] = {
        clientFolderId: r.clientFolderId,
        clientName:     r.clientName,
        clientEmail:    r.clientEmail,
        clientLang:     r.clientLang,
        empName:        r.empName,
        empEmail:       r.empEmail,
        rows: []
      };
    }
    clientMap[key].rows.push(r);
  });

  return ok_(Object.values(clientMap));
}

function handleListAudit_(params, roleInfo) {
  if (!roleInfo.role) return err_('not authorized', 403);
  var wfId = params.id || '';
  if (!wfId) return err_('id required');

  // Verify the caller has access to this workflow row
  var row = wfFindById_(wfId);
  if (!row) return err_('not found', 404);

  var callerEmail = roleInfo.email.toLowerCase();
  var canAccess   = (row.empEmail || '').toLowerCase() === callerEmail ||
                    (row.supEmail || '').toLowerCase() === callerEmail;
  if (!canAccess) return err_('not authorized', 403);

  var sh = wfAuditSheet_();
  if (!sh) return ok_([]);
  var data = sh.getDataRange().getValues();
  var entries = [];
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][WFA_COL_WF_ID - 1]) === wfId) {
      entries.push({
        timestamp:  data[i][WFA_COL_TIMESTAMP   - 1],
        actorEmail: data[i][WFA_COL_ACTOR       - 1],
        action:     data[i][WFA_COL_ACTION      - 1],
        clientName: data[i][WFA_COL_CLIENT_NAME - 1],
        fileName:   data[i][WFA_COL_FILE_NAME   - 1],
        details:    data[i][WFA_COL_DETAILS     - 1]
      });
    }
  }
  return ok_(entries);
}

// ── Portal POST handlers ───────────────────────────────────────

// EDITABLE_STATUSES — employee can edit finished/note when in these statuses
var EDITABLE_STATUSES = ['new', 'in_progress', 'returned'];

function handleSetFinished_(body, roleInfo) {
  if (roleInfo.role !== 'employee') return err_('employee only', 403);
  var row = wfFindById_(body.id);
  if (!row) return err_('not found', 404);
  if ((row.empEmail || '').toLowerCase() !== roleInfo.email.toLowerCase()) return err_('not authorized', 403);
  if (EDITABLE_STATUSES.indexOf(row.status) === -1) return err_('row is locked (status: ' + row.status + ')', 409);

  var newFinished = !!body.finished;
  var newStatus   = newFinished ? 'in_progress' : 'new';
  if (row.status === 'returned') newStatus = 'returned'; // stay returned until submitted

  var updated = wfUpdateById_(body.id, { finished: newFinished, status: newStatus });
  wfAudit_(roleInfo.email, 'setFinished', body.id, row.clientName, row.fileName,
           { finished: newFinished, status: newStatus });
  return ok_(updated);
}

function handleSetNote_(body, roleInfo) {
  if (!roleInfo.role) return err_('not authorized', 403);
  var row = wfFindById_(body.id);
  if (!row) return err_('not found', 404);

  var callerEmail = roleInfo.email.toLowerCase();
  if ((row.empEmail || '').toLowerCase() !== callerEmail &&
      (row.supEmail || '').toLowerCase() !== callerEmail) return err_('not authorized', 403);

  // Employees cannot edit notes of locked rows
  if (roleInfo.role === 'employee' && EDITABLE_STATUSES.indexOf(row.status) === -1) {
    return err_('row is locked (status: ' + row.status + ')', 409);
  }

  var updated = wfUpdateById_(body.id, { note: String(body.note || '') });
  wfAudit_(roleInfo.email, 'setNote', body.id, row.clientName, row.fileName, { note: body.note });
  return ok_(updated);
}

function handleSubmitDay_(body, roleInfo) {
  if (roleInfo.role !== 'employee') return err_('employee only', 403);

  var clientFolderId = body.clientFolderId || '';
  var year           = body.year;
  var month          = body.month;
  var day            = body.day;

  if (!clientFolderId || !year || !month || !day) return err_('clientFolderId, year, month, day required');

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return err_('server busy, please retry', 503);
  try {

  var rows = wfListByClientFolderId_(clientFolderId).filter(function(r) {
    return (r.empEmail || '').toLowerCase() === roleInfo.email.toLowerCase() &&
           String(r.year) === String(year) &&
           String(r.month) === String(month) &&
           String(r.day) === String(day);
  });

  var eligibleRows = rows.filter(function(r) {
    return r.finished === true && EDITABLE_STATUSES.indexOf(r.status) !== -1;
  });

  // Count already-submitted rows (skip them, don't block)
  var alreadySubmittedCount = rows.filter(function(r) { return r.status === 'submitted'; }).length;

  if (eligibleRows.length === 0) {
    if (alreadySubmittedCount > 0) {
      // All done rows already submitted — idempotent success
      return ok_({ submitted: 0, skippedAlreadySubmitted: alreadySubmittedCount, skippedNotFinished: rows.length - alreadySubmittedCount });
    }
    return err_('no finished rows eligible for submission in this day', 409);
  }

  var now = new Date();
  eligibleRows.forEach(function(r) {
    wfUpdateById_(r.id, { status: 'submitted', submittedAt: now });
    wfAudit_(roleInfo.email, 'submitDay', r.id, r.clientName, r.fileName, null);
  });

  // Notify supervisors immediately — group by supEmail (one email per supervisor)
  var supMap = {};
  eligibleRows.forEach(function(r) {
    var key = (r.supEmail || '').toLowerCase();
    if (!key) return;
    if (!supMap[key]) {
      supMap[key] = {
        supEmail:   r.supEmail,
        supName:    r.supName,
        empName:    r.empName,
        clientName: r.clientName,
        files:      []
      };
    }
    supMap[key].files.push({ name: r.fileName, url: r.fileUrl });
  });

  for (var sKey in supMap) {
    var s = supMap[sKey];
    try {
      sendSubmittedToSupervisorEmail_(s.supEmail, s.supName, s.empName, s.clientName, s.files, WEB_APP_URL);
    } catch (emailErr) {
      Logger.log('handleSubmitDay_ supervisor notification error for ' + s.supEmail + ': ' + emailErr.message);
    }
  }

  return ok_({ submitted: eligibleRows.length, skippedAlreadySubmitted: alreadySubmittedCount, skippedNotFinished: rows.length - eligibleRows.length - alreadySubmittedCount });

  } finally {
    lock.releaseLock();
  }
}

function handleApproveAndSend_(body, roleInfo) {
  if (roleInfo.role !== 'supervisor') return err_('supervisor only', 403);

  var ids = body.ids;
  if (!ids || !ids.length) return err_('ids array required');

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return err_('server busy, please retry', 503);
  try {

  // Validate all rows belong to this supervisor and have status=submitted
  var rowsToApprove = [];
  for (var i = 0; i < ids.length; i++) {
    var row = wfFindById_(ids[i]);
    if (!row) return err_('row not found: ' + ids[i], 404);
    if ((row.supEmail || '').toLowerCase() !== roleInfo.email.toLowerCase()) return err_('not authorized for row ' + ids[i], 403);
    if (row.status !== 'submitted') return err_('row not in submitted state: ' + ids[i], 409);
    rowsToApprove.push(row);
  }

  // Group by client for one email per client
  var clientMap = {};
  rowsToApprove.forEach(function(r) {
    var key = r.clientFolderId;
    if (!clientMap[key]) {
      clientMap[key] = {
        clientEmail: r.clientEmail,
        clientName:  r.clientName,
        clientLang:  r.clientLang,
        files:       [],
        notes:       []
      };
    }
    clientMap[key].files.push({ name: r.fileName, url: r.fileUrl });
    if (r.note && String(r.note).trim()) {
      clientMap[key].notes.push({ name: r.fileName, note: r.note, url: r.fileUrl });
    }
  });

  var now     = new Date();
  var dateStr = Utilities.formatDate(now, Session.getScriptTimeZone(), 'dd/MM/yyyy');

  for (var cKey in clientMap) {
    var cData = clientMap[cKey];
    try {
      sendInvoiceDoneEmail_(cData.clientEmail, cData.clientName, dateStr,
                            cData.files, cData.notes, cData.clientLang);
    } catch (emailErr) {
      Logger.log('handleApproveAndSend_ email error for ' + cData.clientName + ': ' + emailErr.message);
    }
  }

  rowsToApprove.forEach(function(r) {
    wfUpdateById_(r.id, { status: 'approved_sent', sentAt: now });
    wfAudit_(roleInfo.email, 'approveAndSend', r.id, r.clientName, r.fileName, null);
  });

  return ok_({ approved: rowsToApprove.length });

  } finally {
    lock.releaseLock();
  }
}

function handleReturnToEmp_(body, roleInfo) {
  if (roleInfo.role !== 'supervisor') return err_('supervisor only', 403);

  var ids        = body.ids;
  var returnNote = String(body.returnNote || '').trim();
  if (!ids || !ids.length) return err_('ids array required');
  if (!returnNote) return err_('returnNote is required');

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return err_('server busy, please retry', 503);
  try {

  var rowsToReturn = [];
  for (var i = 0; i < ids.length; i++) {
    var row = wfFindById_(ids[i]);
    if (!row) return err_('row not found: ' + ids[i], 404);
    if ((row.supEmail || '').toLowerCase() !== roleInfo.email.toLowerCase()) return err_('not authorized for row ' + ids[i], 403);
    if (row.status !== 'submitted') return err_('row not in submitted state: ' + ids[i], 409);
    rowsToReturn.push(row);
  }

  rowsToReturn.forEach(function(r) {
    var newCount = (parseInt(r.returnCount) || 0) + 1;
    wfUpdateById_(r.id, {
      finished:      false,
      status:        'returned',
      returnCount:   newCount,
      lastReturnNote: returnNote
    });
    wfAudit_(roleInfo.email, 'returnToEmp', r.id, r.clientName, r.fileName,
             { returnNote: returnNote, returnCount: newCount });
  });

  // Group by employee — one email per employee
  var empMap = {};
  rowsToReturn.forEach(function(r) {
    var key = r.empEmail;
    if (!empMap[key]) {
      empMap[key] = { empEmail: r.empEmail, empName: r.empName, clientName: r.clientName, files: [] };
    }
    empMap[key].files.push({ name: r.fileName, url: r.fileUrl });
  });

  for (var eKey in empMap) {
    var eData = empMap[eKey];
    try {
      sendReturnToEmpEmail_(eData.empEmail, eData.empName, eData.clientName,
                            eData.files, roleInfo.name, returnNote);
    } catch (emailErr) {
      Logger.log('handleReturnToEmp_ email error for ' + eData.empEmail + ': ' + emailErr.message);
    }
  }

  return ok_({ returned: rowsToReturn.length });

  } finally {
    lock.releaseLock();
  }
}
