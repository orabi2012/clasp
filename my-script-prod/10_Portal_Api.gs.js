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

  // ── Cache check: avoid a tokeninfo HTTP round-trip on every request ──
  var cache = CacheService.getScriptCache();
  var cacheKey = 'tok_' + Utilities.base64Encode(
    Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, idToken)
  ).replace(/[^a-zA-Z0-9]/g, '').substring(0, 60);
  var cached = cache.get(cacheKey);
  if (cached) {
    try { return JSON.parse(cached); } catch (e) { /* fall through to re-verify */ }
  }

  // ── Verify via tokeninfo endpoint (cache miss) ──
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

  var result = { email: payload.email, name: payload.name || '', picture: payload.picture || '' };

  // Cache for up to 5 minutes or the token's remaining lifetime, whichever is shorter
  var ttl = 300;
  if (payload.exp) {
    var remaining = Math.floor(Number(payload.exp) - Date.now() / 1000);
    if (remaining > 0 && remaining < ttl) ttl = remaining;
  }
  if (ttl > 0) cache.put(cacheKey, JSON.stringify(result), ttl);

  return result;
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
      case 'me':                return ok_(roleInfo);
      case 'client.me':          return handleClientMe_(caller);
      case 'client.listMyFiles': return handleClientListMyFiles_(caller);
      case 'listMyClients': return handleListMyClients_(roleInfo);
      case 'listRows':      return handleListRows_(params, roleInfo);
      case 'listPending':   return handleListPending_(params, roleInfo);
      case 'listAudit':     return handleListAudit_(params, roleInfo);
      // Admin GET actions
      case 'admin.me':           return ok_({ isAdmin: isAdmin_(caller.email), email: caller.email, name: caller.name });
      case 'admin.listClients':  return handleAdminListClients_(caller);
      case 'admin.listPeople':   return handleAdminListPeople_(caller);
      // Write actions are POST-only — reject any GET attempt
      case 'setFinished':
      case 'setNote':
      case 'submitDay':
      case 'approveAndSend':
      case 'returnToEmp':
      case 'uploadClientFile':
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
      case 'checkUploads':      return handleCheckUploads_(roleInfo);
      case 'uploadClientFile':   return handleClientFileUpload_(body, caller);
      // Admin write actions
      case 'admin.assignEmployee':   return handleAdminAssignEmployee_(body, caller);
      case 'admin.unassignEmployee': return handleAdminUnassignEmployee_(body, caller);
      case 'admin.editClient':       return handleAdminEditClient_(body, caller);
      case 'admin.deactivateClient': return handleAdminSetClientActive_(body, caller, false);
      case 'admin.reactivateClient': return handleAdminSetClientActive_(body, caller, true);
      case 'admin.deleteClient':     return handleAdminDeleteClient_(body, caller);
      case 'admin.addPerson':        return handleAdminAddPerson_(body, caller);
      case 'admin.editPerson':       return handleAdminEditPerson_(body, caller);
      case 'admin.deletePerson':     return handleAdminDeletePerson_(body, caller);
      default:
        return err_('unknown action: ' + body.action);
    }
  } catch (ex) {
    Logger.log('doPost error [' + body.action + ']: ' + ex.message);
    return err_(ex.message, 500);
  }
}

// ── Client: list my files ──────────────────────────────────

/**
 * Returns all workflow rows for the authenticated client.
 * Only exposes client-safe fields (no internal employee/supervisor notes).
 * The 'note' field contains the supervisor's return note (lastReturnNote).
 */
function handleClientListMyFiles_(caller) {
  var ssId  = PropertiesService.getScriptProperties().getProperty('MAIN_SS_ID');
  var ss    = ssId ? SpreadsheetApp.openById(ssId) : SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(CUSTOMERS_SHEET_NAME);
  if (!sheet) return err_('customers sheet not found', 500);

  var lc   = caller.email.toLowerCase().trim();
  var data = sheet.getDataRange().getValues();
  var found = false;
  for (var i = 1; i < data.length; i++) {
    if ((String(data[i][COL_EMAIL - 1] || '')).toLowerCase().trim() !== lc) continue;
    if (data[i][COL_IS_ACTIVE - 1] === false) return err_('account inactive', 403);
    found = true;
    break;
  }
  if (!found) return err_('not a registered client', 403);

  var rows = wfAllRows_().filter(function(r) {
    return (String(r.clientEmail || '')).toLowerCase().trim() === lc;
  });

  rows.sort(function(a, b) {
    var ta = a.uploadedAt ? new Date(a.uploadedAt).getTime() : 0;
    var tb = b.uploadedAt ? new Date(b.uploadedAt).getTime() : 0;
    return tb - ta;
  });

  var result = rows.map(function(r) {
    return {
      id:               r.id,
      fileName:         r.fileName          || '',
      fileUrl:          r.fileUrl           || '',
      uploadedAt:       r.uploadedAt ? Utilities.formatDate(new Date(r.uploadedAt), 'Asia/Riyadh', 'yyyy-MM-dd') : '',
      status:           r.status            || '',
      sentAt:           r.sentAt   ? Utilities.formatDate(new Date(r.sentAt),   'Asia/Riyadh', 'yyyy-MM-dd') : '',
      note:             r.status === 'approved_sent' ? (r.lastReturnNote || '') : '',
      clientDescription: r.clientDescription || ''
    };
  });

  return ok_(result);
}

// ── Client portal: client.me ──────────────────────────────────

/**
 * Returns the authenticated client's profile and Drive folder links.
 * If the email is not found in the customers sheet, returns { registered: false }.
 */
function handleClientMe_(caller) {
  var ssId  = PropertiesService.getScriptProperties().getProperty('MAIN_SS_ID');
  var ss    = ssId ? SpreadsheetApp.openById(ssId) : SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(CUSTOMERS_SHEET_NAME);

  if (!sheet || sheet.getLastRow() < 2) return ok_({ registered: false });

  var lc   = caller.email.toLowerCase().trim();
  var data = sheet.getDataRange().getValues();

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if ((String(row[COL_EMAIL - 1] || '')).toLowerCase().trim() !== lc) continue;

    var isActive   = row[COL_IS_ACTIVE - 1];
    var folderId   = String(row[COL_FOLDER_ID - 1] || '').trim();
    var folderUrl  = String(row[COL_FOLDER_URL - 1] || '').trim();
    var empName    = String(row[COL_EMPLOYEE - 1] || '').trim();

    // Resolve subfolder URLs from Drive when folder exists
    var uploadsUrl = '';
    var resultsUrl = '';
    if (folderId) {
      try {
        var rootFolder = DriveApp.getFolderById(folderId);
        var upIter = rootFolder.getFoldersByName(FOLDER_UPLOADS);
        if (upIter.hasNext()) uploadsUrl = upIter.next().getUrl();
        var reIter = rootFolder.getFoldersByName(FOLDER_RESULTS);
        if (reIter.hasNext()) resultsUrl = reIter.next().getUrl();
      } catch (e) {
        Logger.log('handleClientMe_: Drive lookup failed: ' + e.message);
      }
    }

    return ok_({
      registered:      true,
      active:          isActive !== false && isActive !== 'FALSE' && isActive !== false,
      email:           String(row[COL_EMAIL - 1] || ''),
      company:         String(row[COL_NAME - 1] || ''),
      contact:         String(row[COL_CONTACT_PERSON - 1] || ''),
      phone:           String(row[4] || ''),  // col E (index 4) — no named constant
      taxType:         String(row[COL_TAX_TYPE - 1] || ''),
      nextTaxDate:     row[COL_DATE_TAX - 1]   ? Utilities.formatDate(new Date(row[COL_DATE_TAX - 1]),   'Asia/Riyadh', 'yyyy-MM-dd') : '',
      nextZakatDate:   row[COL_DATE_ZAKAT - 1] ? Utilities.formatDate(new Date(row[COL_DATE_ZAKAT - 1]), 'Asia/Riyadh', 'yyyy-MM-dd') : '',
      language:        String(row[COL_LANG - 1] || 'ar'),
      folderAssigned:  empName !== '',
      folderUrl:       folderUrl,
      uploadsUrl:      uploadsUrl,
      resultsUrl:      resultsUrl
    });
  }

  return ok_({ registered: false });
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
    new Date(),    data.email,          data.name,     data.contactPerson || '',
    data.phone,   data.taxNumber,       data.crNumber,
    data.date1,    data.date2,   data.date3,    data.date4,
    lang
  ]);
  var newRow   = sheet.getLastRow();
  sheet.getRange(newRow, COL_TAX_TYPE).setValue(data.taxType || '');
  sheet.getRange(newRow, COL_IS_ACTIVE).setValue(true); // mark new client as active
  var langCell = sheet.getRange(newRow, COL_LANG);
  langCell
    .setBackground(lang === 'ar' ? '#e8f0fe' : '#fce8e6')
    .setFontColor(lang === 'ar' ? '#1967d2' : '#c5221f')
    .setFontWeight('bold').setHorizontalAlignment('center');
  var bg = newRow % 2 === 0 ? '#e8f0fe' : '#ffffff';
  sheet.getRange(newRow, 1, 1, 18).setBackground(bg);
  langCell
    .setBackground(lang === 'ar' ? '#e8f0fe' : '#fce8e6')
    .setFontColor(lang === 'ar' ? '#1967d2' : '#c5221f')
    .setFontWeight('bold').setHorizontalAlignment('center');

  try { sendNewClientAdminEmail_(data, lang); } catch (err) {
    Logger.log('sendNewClientAdminEmail_ error: ' + err.message);
  }
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

  // Also include clients from the customers sheet that have no workflow rows yet
  if (roleInfo.role === 'employee' || roleInfo.role === 'supervisor') {
    var ssId2 = PropertiesService.getScriptProperties().getProperty('MAIN_SS_ID');
    var ss2   = ssId2 ? SpreadsheetApp.openById(ssId2) : SpreadsheetApp.getActiveSpreadsheet();
    var custSheet = ss2.getSheetByName(CUSTOMERS_SHEET_NAME);
    if (custSheet && custSheet.getLastRow() > 1) {
      var custData = custSheet.getDataRange().getValues();

      // Remove any deactivated clients that were added via workflow rows
      for (var di = 1; di < custData.length; di++) {
        if (custData[di][COL_IS_ACTIVE - 1] === false) {
          var inactiveFid = String(custData[di][COL_FOLDER_ID - 1] || '').trim();
          if (inactiveFid && clientMap[inactiveFid]) delete clientMap[inactiveFid];
        }
      }

      // For supervisors: build a set of employee names whose supervisor is this user
      var empNamesForSup = null;
      if (roleInfo.role === 'supervisor') {
        empNamesForSup = {};
        var supNameLc = (roleInfo.name || '').toLowerCase().trim();
        var empSheet2 = ss2.getSheetByName(EMPLOYEES_SHEET_NAME);
        if (empSheet2 && empSheet2.getLastRow() > 1) {
          var empData2 = empSheet2.getDataRange().getValues();
          for (var ei = 1; ei < empData2.length; ei++) {
            var thisSupName = String(empData2[ei][COL_EMP_SUPERVISOR - 1] || '').toLowerCase().trim();
            if (thisSupName === supNameLc) {
              empNamesForSup[String(empData2[ei][COL_EMP_NAME - 1] || '').toLowerCase().trim()] = {
                name:  empData2[ei][COL_EMP_NAME  - 1] || '',
                email: empData2[ei][COL_EMP_EMAIL - 1] || ''
              };
            }
          }
        }
      }

      var empNameLc = (roleInfo.role === 'employee') ? (roleInfo.name || '').toLowerCase().trim() : null;

      for (var ci = 1; ci < custData.length; ci++) {
        var assignedEmpRaw = String(custData[ci][COL_PREV_EMPLOYEE - 1] || custData[ci][COL_EMPLOYEE - 1] || '').toLowerCase().trim();
        if (!assignedEmpRaw) continue;

        // Skip deactivated clients — they should not appear in the employee portal
        if (custData[ci][COL_IS_ACTIVE - 1] === false) continue;

        var matchedEmpInfo = null;
        if (roleInfo.role === 'employee' && assignedEmpRaw === empNameLc) {
          matchedEmpInfo = { name: roleInfo.name, email: roleInfo.email };
        } else if (roleInfo.role === 'supervisor' && empNamesForSup && empNamesForSup[assignedEmpRaw]) {
          matchedEmpInfo = empNamesForSup[assignedEmpRaw];
        }
        if (!matchedEmpInfo) continue;

        var cFolderId = String(custData[ci][COL_FOLDER_ID - 1] || '').trim();
        // Use folder ID as key when available; fall back to email so clients
        // with no folder yet (trigger not run) still appear in the portal
        var mapKey = cFolderId || ('__nofolder__' + String(custData[ci][COL_EMAIL - 1] || ci).toLowerCase());
        if (!clientMap[mapKey]) {
          clientMap[mapKey] = {
            clientFolderId: cFolderId,
            clientName:     custData[ci][COL_NAME  - 1] || '',
            clientEmail:    custData[ci][COL_EMAIL - 1] || '',
            empName:        matchedEmpInfo.name,
            empEmail:       matchedEmpInfo.email,
            supName:        roleInfo.role === 'supervisor' ? roleInfo.name : '',
            counts: { total: 0, new: 0, in_progress: 0, submitted: 0, approved_sent: 0, returned: 0 }
          };
        }
      }
    }
  }

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

function handleListPending_(params, roleInfo) {
  if (roleInfo.role !== 'supervisor') return err_('supervisor only', 403);
  var showAll = String(params.all || '').toLowerCase() === 'true';

  var rows;
  if (showAll) {
    rows = wfAllRows_(); // all employees, all statuses
  } else {
    rows = wfListBySupEmail_(roleInfo.email, null); // all statuses — supervisor sees full history
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
        clientLang:     r.clientLang,
        empName:        r.empName,
        empEmail:       r.empEmail,
        rows: []
      };
    }
    clientMap[key].rows.push(r);
  });

  // Also include customers that have no workflow rows yet.
  // When showAll=true, include ALL customers; otherwise only those under this supervisor.
  var ssId2 = PropertiesService.getScriptProperties().getProperty('MAIN_SS_ID');
  var ss2   = ssId2 ? SpreadsheetApp.openById(ssId2) : SpreadsheetApp.getActiveSpreadsheet();
  var custSheet = ss2.getSheetByName(CUSTOMERS_SHEET_NAME);
  if (custSheet && custSheet.getLastRow() > 1) {
    var custData  = custSheet.getDataRange().getValues();
    var supNameLc = (roleInfo.name || '').toLowerCase().trim();

    // Build employee lookup map
    var empNamesForSup = {};
    var empSheet2 = ss2.getSheetByName(EMPLOYEES_SHEET_NAME);
    if (empSheet2 && empSheet2.getLastRow() > 1) {
      var empData2 = empSheet2.getDataRange().getValues();
      for (var ei = 1; ei < empData2.length; ei++) {
        var thisSupName = String(empData2[ei][COL_EMP_SUPERVISOR - 1] || '').toLowerCase().trim();
        var empNameLc   = String(empData2[ei][COL_EMP_NAME - 1] || '').toLowerCase().trim();
        if (!empNameLc) continue;
        if (showAll || thisSupName === supNameLc) {
          empNamesForSup[empNameLc] = {
            name:  empData2[ei][COL_EMP_NAME  - 1] || '',
            email: empData2[ei][COL_EMP_EMAIL - 1] || ''
          };
        }
      }
    }

    for (var ci = 1; ci < custData.length; ci++) {
      var assignedEmpRaw = String(custData[ci][COL_PREV_EMPLOYEE - 1] || custData[ci][COL_EMPLOYEE - 1] || '').toLowerCase().trim();
      if (!assignedEmpRaw || !empNamesForSup[assignedEmpRaw]) continue;
      var matchedEmpInfo = empNamesForSup[assignedEmpRaw];

      var cFolderId = String(custData[ci][COL_FOLDER_ID - 1] || '').trim();
      var mapKey = cFolderId || ('__nofolder__' + String(custData[ci][COL_EMAIL - 1] || ci).toLowerCase());
      if (!clientMap[mapKey]) {
        clientMap[mapKey] = {
          clientFolderId: cFolderId,
          clientName:     custData[ci][COL_NAME  - 1] || '',
          clientEmail:    custData[ci][COL_EMAIL - 1] || '',
          clientLang:     custData[ci][COL_LANG  - 1] || 'ar',
          empName:        matchedEmpInfo.name,
          empEmail:       matchedEmpInfo.email,
          rows: []
        };
      }
    }
  }

  return ok_(Object.values(clientMap));
}

// ── Client: upload file with description ─────────────────────

/**
 * Accepts a base64-encoded file from the authenticated client,
 * creates it in the client's uploads/ folder in Drive, and sets
 * the Drive file description to the client-supplied text.
 *
 * Body: { action, id_token, fileName, mimeType, base64, description }
 * Returns: { ok: true, fileName }
 */
function handleClientFileUpload_(body, caller) {
  var ssId  = PropertiesService.getScriptProperties().getProperty('MAIN_SS_ID');
  var ss    = ssId ? SpreadsheetApp.openById(ssId) : SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(CUSTOMERS_SHEET_NAME);
  if (!sheet) return err_('customers sheet not found', 500);

  // Look up the caller's record — must be a registered, active client
  var lc   = caller.email.toLowerCase().trim();
  var data = sheet.getDataRange().getValues();
  var folderId = null;
  for (var i = 1; i < data.length; i++) {
    if ((String(data[i][COL_EMAIL - 1] || '')).toLowerCase().trim() !== lc) continue;
    if (data[i][COL_IS_ACTIVE - 1] === false) return err_('account inactive', 403);
    folderId = String(data[i][COL_FOLDER_ID - 1] || '').trim();
    break;
  }
  if (!folderId) return err_('no folder assigned — contact support', 403);

  // Validate required fields
  var fileName = (body.fileName || '').trim();
  var mimeType = (body.mimeType || 'application/octet-stream').trim();
  var b64      = (body.base64  || '').trim();
  var desc     = (body.description || '').substring(0, 500); // cap at 500 chars
  if (!fileName) return err_('fileName required');
  if (!b64)      return err_('base64 required');

  // Locate the uploads/ subfolder
  var rootFolder;
  try { rootFolder = DriveApp.getFolderById(folderId); }
  catch (e) { return err_('client folder not accessible: ' + e.message, 500); }

  var uploadsIter = rootFolder.getFoldersByName(FOLDER_UPLOADS);
  if (!uploadsIter.hasNext()) return err_('uploads folder not found — contact support', 500);
  var uploadsFolder = uploadsIter.next();

  // Decode and create the file
  var blob = Utilities.newBlob(Utilities.base64Decode(b64), mimeType, fileName);
  var file = uploadsFolder.createFile(blob);
  if (desc) file.setDescription(desc);

  // Mark as portal-uploaded so checkUploadsForNewFiles can process it
  // (files created by the script owner are normally skipped)
  try {
    Drive.Files.update({ appProperties: { clientUpload: 'true' } }, file.getId());
  } catch (e) {
    Logger.log('handleClientFileUpload_: could not set appProperty: ' + e.message);
  }

  Logger.log('handleClientFileUpload_: ' + caller.email + ' uploaded "' + fileName + '" (desc: ' + (desc ? 'yes' : 'no') + ')');
  return ok_({ ok: true, fileName: fileName });
}

function handleCheckUploads_(roleInfo) {
  if (!roleInfo.role) return err_('not authorized', 403);
  try {
    checkUploadsForNewFiles();
    return ok_({ ran: true });
  } catch (ex) {
    Logger.log('handleCheckUploads_ error: ' + ex.message);
    return err_('check failed: ' + ex.message, 500);
  }
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

  var patch = { note: String(body.note || '') };
  // When an employee saves a note, promote 'new' → 'in_progress' (note logged = under review).
  // 'returned' stays as 'returned' until resubmitted; other statuses are unchanged.
  if (roleInfo.role === 'employee' && row.status === 'new' && patch.note) {
    patch.status = 'in_progress';
  }

  var updated = wfUpdateById_(body.id, patch);
  wfAudit_(roleInfo.email, 'setNote', body.id, row.clientName, row.fileName, patch);
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

  // Guard: block submission for deactivated clients
  var ss         = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('MAIN_SS_ID') || '') || SpreadsheetApp.getActiveSpreadsheet();
  var custSheet  = ss.getSheetByName(CUSTOMERS_SHEET_NAME);
  if (custSheet && custSheet.getLastRow() > 1) {
    var custData = custSheet.getDataRange().getValues();
    for (var ci = 1; ci < custData.length; ci++) {
      if ((custData[ci][COL_FOLDER_ID - 1] || '') === clientFolderId) {
        if (custData[ci][COL_IS_ACTIVE - 1] === false) {
          return err_('هذا العميل غير نشط ولا يمكن إرسال ملفاته', 403);
        }
        break;
      }
    }
  }

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
      sendSubmittedToSupervisorEmail_(s.supEmail, s.supName, s.empName, s.clientName, s.files, getPortalUrl_());
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

  var supervisorNote = String(body.supervisorNote || '').trim();

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
                            cData.files, cData.notes, cData.clientLang, supervisorNote);
    } catch (emailErr) {
      Logger.log('handleApproveAndSend_ email error for ' + cData.clientName + ': ' + emailErr.message);
    }
  }

  rowsToApprove.forEach(function(r) {
    var patch = { status: 'approved_sent', sentAt: now };
    if (supervisorNote) patch.lastReturnNote = supervisorNote;
    wfUpdateById_(r.id, patch);
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

// ============================================================
// ADMIN API
// ============================================================
//
// Set this in Apps Script → Project Settings → Script Properties:
//   key:   ADMIN_EMAILS
//   value: comma-separated list of admin emails (case-insensitive)
//          e.g.  alice@example.com,bob@example.com
//
// Admin page is served at:  <web_app_url>?page=admin
// All admin.* actions require the caller's email to appear in ADMIN_EMAILS.
// ============================================================

var ADMIN_EMAILS_PROP = 'ADMIN_EMAILS';

function isAdmin_(email) {
  if (!email) return false;
  var raw = PropertiesService.getScriptProperties().getProperty(ADMIN_EMAILS_PROP) || '';
  var lc  = email.toLowerCase().trim();
  return raw.split(',').some(function(e) { return e.toLowerCase().trim() === lc; });
}

function requireAdmin_(caller) {
  if (!caller || !isAdmin_(caller.email)) {
    var e = new Error('admin only');
    e.code = 403;
    throw e;
  }
}

function adminErr_(err) {
  return err_(err.message, err.code || 500);
}

function adminSpreadsheet_() {
  var ssId = PropertiesService.getScriptProperties().getProperty('MAIN_SS_ID');
  return ssId ? SpreadsheetApp.openById(ssId) : SpreadsheetApp.getActiveSpreadsheet();
}

// ── List clients ─────────────────────────────────────────────

function handleAdminListClients_(caller) {
  try { requireAdmin_(caller); } catch (ex) { return adminErr_(ex); }

  var ss    = adminSpreadsheet_();
  var sheet = ss.getSheetByName(CUSTOMERS_SHEET_NAME);
  if (!sheet || sheet.getLastRow() < 2) return ok_([]);

  var data = sheet.getDataRange().getValues();
  var out  = [];
  for (var i = 1; i < data.length; i++) {
    var r = data[i];
    out.push({
      row:           i + 1, // 1-based sheet row
      name:          r[COL_NAME      - 1] || '',
      email:         r[COL_EMAIL     - 1] || '',
      phone:         r[3]            || '', // D — phone
      taxNumber:     r[4]            || '', // E
      crNumber:      r[5]            || '', // F
      firstTaxDate:  fmtDate_(r[6]),         // G
      crDate:        fmtDate_(r[7]),         // H
      nextTaxDate:   fmtDate_(r[COL_DATE_TAX   - 1]), // I
      nextZakatDate: fmtDate_(r[COL_DATE_ZAKAT - 1]), // J
      lang:          r[COL_LANG      - 1] || '',
      employee:      r[COL_EMPLOYEE  - 1] || '',
      prevEmployee:  r[COL_PREV_EMPLOYEE - 1] || '',
      folderUrl:     r[COL_FOLDER_URL - 1] || '',
      folderId:      r[COL_FOLDER_ID  - 1] || '',
      isActive:      r[COL_IS_ACTIVE  - 1] !== false // blank or TRUE = active; FALSE = inactive
    });
  }
  return ok_(out);
}

// ── List employees + supervisors ─────────────────────────────

function handleAdminListPeople_(caller) {
  try { requireAdmin_(caller); } catch (ex) { return adminErr_(ex); }

  var ss = adminSpreadsheet_();

  function readSheet(name, cols) {
    var sh = ss.getSheetByName(name);
    if (!sh || sh.getLastRow() < 2) return [];
    var data = sh.getDataRange().getValues();
    var out  = [];
    for (var i = 1; i < data.length; i++) {
      var r = data[i];
      var obj = { row: i + 1 };
      Object.keys(cols).forEach(function(k) { obj[k] = r[cols[k] - 1] || ''; });
      out.push(obj);
    }
    return out;
  }

  var employees = readSheet(EMPLOYEES_SHEET_NAME, {
    name:       COL_EMP_NAME,
    job:        COL_EMP_JOB,
    email:      COL_EMP_EMAIL,
    phone:      COL_EMP_PHONE,
    supervisor: COL_EMP_SUPERVISOR,
    folderUrl:  COL_EMP_FOLDER_URL
  });

  var supervisors = readSheet(SUPERVISORS_SHEET_NAME, {
    name:      COL_SUP_NAME,
    job:       COL_SUP_JOB,
    email:     COL_SUP_EMAIL,
    phone:     COL_SUP_PHONE,
    folderUrl: COL_SUP_FOLDER_URL
  });

  return ok_({ employees: employees, supervisors: supervisors });
}

// ── Assign employee ──────────────────────────────────────────

// Helper: format a Date / value to YYYY-MM-DD for the admin UI; '' for blanks.
function fmtDate_(v) {
  if (!v) return '';
  if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime())) {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return String(v);
}

// ── Edit client (name / phone / numbers / dates — NOT email) ─

function handleAdminEditClient_(body, caller) {
  try { requireAdmin_(caller); } catch (ex) { return adminErr_(ex); }

  var row = parseInt(body.row || 0);
  if (!row || row < 2) return err_('row required (>=2)');

  // Whitelist of editable columns (1-based). Email is intentionally excluded.
  var FIELD_TO_COL = {
    name:          COL_NAME,        // 3
    phone:         4,                // D
    taxNumber:     5,                // E
    crNumber:      6,                // F
    firstTaxDate:  7,                // G
    crDate:        8,                // H
    nextTaxDate:   COL_DATE_TAX,     // 9
    nextZakatDate: COL_DATE_ZAKAT    // 10
  };
  var DATE_FIELDS = { firstTaxDate:1, crDate:1, nextTaxDate:1, nextZakatDate:1 };

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return err_('server busy, please retry', 503);
  try {
    var ss    = adminSpreadsheet_();
    var sheet = ss.getSheetByName(CUSTOMERS_SHEET_NAME);
    if (!sheet) return err_('customers sheet not found', 500);
    if (row > sheet.getLastRow()) return err_('row out of range', 404);

    var datesChanged = false;
    Object.keys(FIELD_TO_COL).forEach(function(field) {
      if (!Object.prototype.hasOwnProperty.call(body, field)) return;
      var col   = FIELD_TO_COL[field];
      var raw   = body[field];
      var value = '';
      if (raw !== null && raw !== undefined && String(raw).trim() !== '') {
        if (DATE_FIELDS[field]) {
          // Accept YYYY-MM-DD or anything Date can parse
          var d = new Date(raw);
          if (isNaN(d.getTime())) {
            return; // skip invalid date silently
          }
          value = d;
          datesChanged = true;
        } else {
          value = String(raw).trim();
        }
      } else if (DATE_FIELDS[field]) {
        // Explicit blank for date — clear it
        value = '';
        datesChanged = true;
      }
      sheet.getRange(row, col).setValue(value);
    });
    SpreadsheetApp.flush();

    // If date columns changed, refresh calendar events (mirrors onDateChanged)
    if (datesChanged) {
      try {
        var rowData     = sheet.getRange(row, 1, 1, COL_PREV_EMPLOYEE).getValues()[0];
        var clientName  = rowData[COL_NAME          - 1];
        var clientEmail = rowData[COL_EMAIL         - 1];
        var employee    = rowData[COL_PREV_EMPLOYEE - 1] || rowData[COL_EMPLOYEE - 1];
        var folderUrl   = rowData[COL_FOLDER_URL    - 1];
        if (employee) {
          var employeeEmail = getEmployeeEmail(employee, ss);
          var supData      = getSupervisorForEmployee_(employee, ss);
          createOrUpdateClientEvents(
            clientName, clientEmail, employeeEmail,
            rowData[COL_DATE_ZAKAT - 1],
            rowData[COL_DATE_TAX   - 1],
            folderUrl,
            supData ? supData.email : ''
          );
        }
      } catch (calErr) {
        Logger.log('admin.editClient calendar refresh failed: ' + calErr.message);
      }
    }

    return ok_({ row: row });
  } finally {
    lock.releaseLock();
  }
}

function handleAdminAssignEmployee_(body, caller) {
  try { requireAdmin_(caller); } catch (ex) { return adminErr_(ex); }

  var row      = parseInt(body.row || 0);
  var employee = String(body.employee || '').trim();
  if (!row || row < 2) return err_('row required (>=2)');
  if (!employee) return err_('employee required (use admin.unassignEmployee to clear)');

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return err_('server busy, please retry', 503);
  try {
    var ss    = adminSpreadsheet_();
    var sheet = ss.getSheetByName(CUSTOMERS_SHEET_NAME);
    if (!sheet) return err_('customers sheet not found', 500);
    if (row > sheet.getLastRow()) return err_('row out of range', 404);

    // Write the employee cell first so the helper sees the new value
    sheet.getRange(row, COL_EMPLOYEE).setValue(employee);
    SpreadsheetApp.flush();

    try {
      assignEmployeeToClient_(sheet, ss, row, employee, /*interactive=*/false);
    } catch (assignErr) {
      // assignEmployeeToClient_ already reverted COL_EMPLOYEE on folder failure
      Logger.log('admin.assignEmployee failed: ' + assignErr.message);
      return err_('فشل التعيين: ' + assignErr.message, 500);
    }
    return ok_({ row: row, employee: employee });
  } finally {
    lock.releaseLock();
  }
}

// ── Unassign employee ────────────────────────────────────────

function handleAdminUnassignEmployee_(body, caller) {
  try { requireAdmin_(caller); } catch (ex) { return adminErr_(ex); }

  var row = parseInt(body.row || 0);
  if (!row || row < 2) return err_('row required (>=2)');

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return err_('server busy, please retry', 503);
  try {
    var ss    = adminSpreadsheet_();
    var sheet = ss.getSheetByName(CUSTOMERS_SHEET_NAME);
    if (!sheet) return err_('customers sheet not found', 500);
    if (row > sheet.getLastRow()) return err_('row out of range', 404);

    sheet.getRange(row, COL_EMPLOYEE).setValue('');
    SpreadsheetApp.flush();
    unassignEmployeeFromClient_(sheet, ss, row);
    return ok_({ row: row });
  } finally {
    lock.releaseLock();
  }
}

// ── Delete client (full cleanup) ─────────────────────────────

// ── Deactivate / Reactivate client ─────────────────────────────
// Sets COL_IS_ACTIVE to false (deactivate) or true (reactivate).
// Deactivated clients: upload processing skipped, submitDay blocked.
// Their Drive folder remains intact so results are still accessible.

function handleAdminSetClientActive_(body, caller, active) {
  try { requireAdmin_(caller); } catch (ex) { return adminErr_(ex); }

  var row = parseInt(body.row || 0);
  if (!row || row < 2) return err_('row required (>=2)');

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return err_('server busy, please retry', 503);
  try {
    var ss    = adminSpreadsheet_();
    var sheet = ss.getSheetByName(CUSTOMERS_SHEET_NAME);
    if (!sheet) return err_('customers sheet not found', 500);
    if (row > sheet.getLastRow()) return err_('row out of range', 404);

    // Read client data before changing the flag
    var rowData     = sheet.getRange(row, 1, 1, COL_IS_ACTIVE).getValues()[0];
    var clientEmail = rowData[COL_EMAIL     - 1] || '';
    var folderId    = rowData[COL_FOLDER_ID - 1] || '';

    sheet.getRange(row, COL_IS_ACTIVE).setValue(active);
    SpreadsheetApp.flush();

    // Update the uploads folder Drive permission: writer (active) ↔ reader (deactivated)
    if (folderId && clientEmail) {
      try {
        setClientUploadPermission_(folderId, clientEmail, active ? 'writer' : 'reader');
      } catch (permErr) {
        Logger.log('setClientUploadPermission_ error: ' + permErr.message);
        // Non-fatal — sheet flag already saved
      }
    }

    return ok_({ row: row, isActive: active });
  } finally {
    lock.releaseLock();
  }
}

function handleAdminDeleteClient_(body, caller) {
  try { requireAdmin_(caller); } catch (ex) { return adminErr_(ex); }

  var row = parseInt(body.row || 0);
  if (!row || row < 2) return err_('row required (>=2)');

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return err_('server busy, please retry', 503);
  try {
    var ss    = adminSpreadsheet_();
    var sheet = ss.getSheetByName(CUSTOMERS_SHEET_NAME);
    if (!sheet) return err_('customers sheet not found', 500);
    if (row > sheet.getLastRow()) return err_('row out of range', 404);

    try {
      deleteClientCompletely_(sheet, ss, row);
    } catch (delErr) {
      return err_('فشل الحذف: ' + delErr.message, 500);
    }
    return ok_({ row: row });
  } finally {
    lock.releaseLock();
  }
}

// ── Add person (employee or supervisor) ──────────────────────

function handleAdminAddPerson_(body, caller) {
  try { requireAdmin_(caller); } catch (ex) { return adminErr_(ex); }

  var kind  = String(body.kind || '').toLowerCase(); // 'employee' | 'supervisor'
  var name  = String(body.name  || '').trim();
  var email = String(body.email || '').trim();
  var phone = String(body.phone || '').trim();
  var job   = String(body.job   || '').trim();

  if (kind !== 'employee' && kind !== 'supervisor') return err_('kind must be employee|supervisor');
  if (!name)  return err_('name required');
  if (!email) return err_('email required');

  var ss        = adminSpreadsheet_();
  var sheetName = (kind === 'employee') ? EMPLOYEES_SHEET_NAME : SUPERVISORS_SHEET_NAME;
  var sheet     = ss.getSheetByName(sheetName);
  if (!sheet) return err_(sheetName + ' sheet not found', 500);

  // Reject duplicates by email
  if (sheet.getLastRow() > 1) {
    var emailCol = (kind === 'employee') ? COL_EMP_EMAIL : COL_SUP_EMAIL;
    var existing = sheet.getRange(2, emailCol, sheet.getLastRow() - 1, 1).getValues();
    var lc = email.toLowerCase();
    for (var i = 0; i < existing.length; i++) {
      if (String(existing[i][0] || '').toLowerCase().trim() === lc) {
        return err_('شخص بنفس البريد موجود بالفعل', 409);
      }
    }
  }

  if (kind === 'employee') {
    var supervisor = String(body.supervisor || '').trim();
    var rowVals = [];
    rowVals[COL_EMP_NAME       - 1] = name;
    rowVals[COL_EMP_JOB        - 1] = job;
    rowVals[COL_EMP_EMAIL      - 1] = email;
    rowVals[COL_EMP_PHONE      - 1] = phone;
    rowVals[COL_EMP_SUPERVISOR - 1] = supervisor;
    // Pad to 7 columns
    for (var k = 0; k < 7; k++) if (rowVals[k] === undefined) rowVals[k] = '';
    sheet.appendRow(rowVals);
  } else {
    var rowVals2 = [];
    rowVals2[COL_SUP_NAME  - 1] = name;
    rowVals2[COL_SUP_JOB   - 1] = job;
    rowVals2[COL_SUP_EMAIL - 1] = email;
    rowVals2[COL_SUP_PHONE - 1] = phone;
    for (var k2 = 0; k2 < 5; k2++) if (rowVals2[k2] === undefined) rowVals2[k2] = '';
    sheet.appendRow(rowVals2);
  }
  SpreadsheetApp.flush();
  return ok_({ kind: kind, row: sheet.getLastRow() });
}

// ── Edit person ──────────────────────────────────────────────

function handleAdminEditPerson_(body, caller) {
  try { requireAdmin_(caller); } catch (ex) { return adminErr_(ex); }

  var kind = String(body.kind || '').toLowerCase();
  var row  = parseInt(body.row || 0);
  if (kind !== 'employee' && kind !== 'supervisor') return err_('kind must be employee|supervisor');
  if (!row || row < 2) return err_('row required (>=2)');

  var ss        = adminSpreadsheet_();
  var sheetName = (kind === 'employee') ? EMPLOYEES_SHEET_NAME : SUPERVISORS_SHEET_NAME;
  var sheet     = ss.getSheetByName(sheetName);
  if (!sheet) return err_(sheetName + ' sheet not found', 500);
  if (row > sheet.getLastRow()) return err_('row out of range', 404);

  var fields = body.fields || {};
  var colMap = (kind === 'employee') ? {
    name:       COL_EMP_NAME,
    job:        COL_EMP_JOB,
    email:      COL_EMP_EMAIL,
    phone:      COL_EMP_PHONE,
    supervisor: COL_EMP_SUPERVISOR
  } : {
    name:  COL_SUP_NAME,
    job:   COL_SUP_JOB,
    email: COL_SUP_EMAIL,
    phone: COL_SUP_PHONE
  };

  Object.keys(fields).forEach(function(k) {
    if (colMap[k] !== undefined) {
      sheet.getRange(row, colMap[k]).setValue(String(fields[k] || ''));
    }
  });
  SpreadsheetApp.flush();
  return ok_({ kind: kind, row: row });
}

// ── Delete person (guarded) ──────────────────────────────────

function handleAdminDeletePerson_(body, caller) {
  try { requireAdmin_(caller); } catch (ex) { return adminErr_(ex); }

  var kind = String(body.kind || '').toLowerCase();
  var row  = parseInt(body.row || 0);
  if (kind !== 'employee' && kind !== 'supervisor') return err_('kind must be employee|supervisor');
  if (!row || row < 2) return err_('row required (>=2)');

  var ss        = adminSpreadsheet_();
  var sheetName = (kind === 'employee') ? EMPLOYEES_SHEET_NAME : SUPERVISORS_SHEET_NAME;
  var sheet     = ss.getSheetByName(sheetName);
  if (!sheet) return err_(sheetName + ' sheet not found', 500);
  if (row > sheet.getLastRow()) return err_('row out of range', 404);

  var nameCol  = (kind === 'employee') ? COL_EMP_NAME : COL_SUP_NAME;
  var personName = String(sheet.getRange(row, nameCol).getValue() || '').trim();
  if (!personName) return err_('person row is empty', 404);

  // Guard: check active assignments
  var blockers = [];
  if (kind === 'employee') {
    var custSheet = ss.getSheetByName(CUSTOMERS_SHEET_NAME);
    if (custSheet && custSheet.getLastRow() > 1) {
      var data = custSheet.getDataRange().getValues();
      var lc   = personName.toLowerCase().trim();
      for (var i = 1; i < data.length; i++) {
        var assigned = String(data[i][COL_EMPLOYEE - 1] || '').toLowerCase().trim();
        if (assigned === lc) blockers.push(data[i][COL_NAME - 1] || ('row ' + (i + 1)));
      }
    }
  } else {
    var empSheet = ss.getSheetByName(EMPLOYEES_SHEET_NAME);
    if (empSheet && empSheet.getLastRow() > 1) {
      var data2 = empSheet.getDataRange().getValues();
      var lc2   = personName.toLowerCase().trim();
      for (var j = 1; j < data2.length; j++) {
        var sup = String(data2[j][COL_EMP_SUPERVISOR - 1] || '').toLowerCase().trim();
        if (sup === lc2) blockers.push(data2[j][COL_EMP_NAME - 1] || ('row ' + (j + 1)));
      }
    }
  }

  if (blockers.length > 0) {
    return err_('لا يمكن الحذف — لديه ارتباطات نشطة: ' + blockers.join('، '), 409);
  }

  sheet.deleteRow(row);
  SpreadsheetApp.flush();
  return ok_({ kind: kind, row: row, name: personName });
}
