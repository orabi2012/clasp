// ============================================================
// 04_Calendar.gs
// Google Calendar events for client declaration dates
// ============================================================

function createOrUpdateClientEvents(clientName, clientEmail, employeeEmail, zakatDate, taxDate, folderUrl, supervisorEmail) {
  if (taxDate) {
    createOrUpdateEvent_(
      'الإقرار الضريبي — ' + clientName,
      taxDate,
      clientEmail,
      employeeEmail,
      'تاريخ تقديم الإقرار الضريبي القادم للعميل: ' + clientName + (folderUrl ? '\n' + folderUrl : ''),
      supervisorEmail
    );
  }
  if (zakatDate) {
    createOrUpdateEvent_(
      'الإقرار الزكوي — ' + clientName,
      zakatDate,
      clientEmail,
      employeeEmail,
      'تاريخ تقديم الإقرار الزكوي القادم للعميل: ' + clientName + (folderUrl ? '\n' + folderUrl : ''),
      supervisorEmail
    );
  }
}

function createOrUpdateEvent_(title, date, clientEmail, employeeEmail, description, supervisorEmail) {
  const eventDate = new Date(date);
  if (isNaN(eventDate.getTime())) {
    Logger.log('Invalid date: ' + date);
    return;
  }

  const tz         = Session.getScriptTimeZone();
  const dateStr    = Utilities.formatDate(eventDate, tz, 'yyyy-MM-dd');
  const nextDay    = new Date(eventDate);
  nextDay.setDate(nextDay.getDate() + 1);
  const nextDayStr = Utilities.formatDate(nextDay, tz, 'yyyy-MM-dd');

  // Delete existing event with same title from supervisor calendar
  const searchStart = new Date(); searchStart.setFullYear(searchStart.getFullYear() - 2);
  const searchEnd   = new Date(); searchEnd.setFullYear(searchEnd.getFullYear() + 2);
  const existing    = CalendarApp.getDefaultCalendar().getEvents(searchStart, searchEnd);
  for (let i = 0; i < existing.length; i++) {
    if (existing[i].getTitle() === title) {
      existing[i].deleteEvent();
      Logger.log('Deleted existing event: ' + title);
    }
  }

  // Build guest list — supervisor owns the event, emp & client are read-only guests
  const attendees = [clientEmail, employeeEmail, supervisorEmail]
    .filter(function(e) { return !!e; })
    .map(function(e) { return { email: e }; });

  Calendar.Events.insert(
    {
      summary     : title,
      description : description,
      start       : { date: dateStr },
      end         : { date: nextDayStr },
      attendees   : attendees,
      guestsCanModify       : false,
      guestsCanInviteOthers : false,
      reminders: {
        useDefault : false,
        overrides  : [{ method: 'email', minutes: CALENDAR_REMINDER_DAYS * 24 * 60 }]
      }
    },
    'primary',
    { sendUpdates: 'none' }  // suppress Google's plain invite — we send our own branded email
  );

  // Send branded Statix notification to employee, supervisor, and client
  if (employeeEmail)   sendCalendarEventNotification_(employeeEmail,   title, eventDate, description, 'ar');
  if (supervisorEmail) sendCalendarEventNotification_(supervisorEmail, title, eventDate, description, 'ar');
  if (clientEmail)     sendCalendarEventNotification_(clientEmail,     title, eventDate, description, 'ar');

  Logger.log('Created event: ' + title + ' on ' + dateStr);
}

// ── Daily reminder check ──────────────────────────────────────

/**
 * Runs daily via time-based trigger.
 * Sends a reminder email to both employee and client CALENDAR_REMINDER_DAYS before each declaration date.
 */
function checkUpcomingDates() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CUSTOMERS_SHEET_NAME);
  if (!sheet || sheet.getLastRow() <= 1) return;

  const today  = new Date(); today.setHours(0, 0, 0, 0);
  const target = new Date(today);
  target.setDate(target.getDate() + CALENDAR_REMINDER_DAYS);

  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, COL_PREV_EMPLOYEE).getValues();

  for (let i = 0; i < data.length; i++) {
    const row         = data[i];
    const clientName  = row[COL_NAME          - 1];
    const clientEmail = row[COL_EMAIL         - 1];
    const employee    = row[COL_PREV_EMPLOYEE - 1] || row[COL_EMPLOYEE - 1];
    const clientLang  = row[COL_LANG          - 1] || 'ar';
    const taxDate     = row[COL_DATE_TAX      - 1];
    const zakatDate   = row[COL_DATE_ZAKAT    - 1];
    const folderUrl   = row[COL_FOLDER_URL    - 1];

    if (!clientName || !employee) continue;

    const empEmail = getEmployeeEmail(employee, ss);
    const supData   = getSupervisorForEmployee_(employee, ss);
    const supEmail  = supData ? supData.email : '';

    notifyIfDue_(clientName, clientEmail, empEmail, supEmail, taxDate,   'الإقرار الضريبي', clientLang, folderUrl, target);
    notifyIfDue_(clientName, clientEmail, empEmail, supEmail, zakatDate, 'الإقرار الزكوي',  clientLang, folderUrl, target);
  }
}

function notifyIfDue_(clientName, clientEmail, empEmail, supEmail, dateVal, type, clientLang, folderUrl, target) {
  if (!dateVal) return;
  const d = new Date(dateVal); d.setHours(0, 0, 0, 0);
  if (d.getTime() !== target.getTime()) return;

  if (empEmail)    sendDateReminder_(empEmail,    clientName, type, d, CALENDAR_REMINDER_DAYS, folderUrl, 'ar');
  if (supEmail)    sendDateReminder_(supEmail,    clientName, type, d, CALENDAR_REMINDER_DAYS, folderUrl, 'ar');
  if (clientEmail) sendDateReminder_(clientEmail, clientName, type, d, CALENDAR_REMINDER_DAYS, folderUrl, clientLang);
}
