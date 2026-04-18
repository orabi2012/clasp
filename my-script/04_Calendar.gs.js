// ============================================================
// 04_Calendar.gs
// Google Calendar events for client declaration dates
// ============================================================

function createOrUpdateClientEvents(clientName, clientEmail, employeeEmail, zakatDate, taxDate, folderUrl) {
  if (zakatDate) {
    createOrUpdateEvent(
      'الإقرار الزكوي — ' + clientName,
      zakatDate,
      employeeEmail,
      'تاريخ تقديم الإقرار الزكوي القادم للعميل: ' + clientName + '\n' + (folderUrl || ''),
      CALENDAR_REMINDER_DAYS
    );
  }

  if (taxDate) {
    createOrUpdateEvent(
      'الإقرار الضريبي — ' + clientName,
      taxDate,
      employeeEmail,
      'تاريخ تقديم الإقرار الضريبي القادم للعميل: ' + clientName + '\n' + (folderUrl || ''),
      CALENDAR_REMINDER_DAYS
    );
  }
}

function createOrUpdateEvent(title, date, employeeEmail, description, reminderDays) {
  const calendar  = CalendarApp.getDefaultCalendar();
  const eventDate = new Date(date);

  if (isNaN(eventDate.getTime())) {
    Logger.log('Invalid date: ' + date);
    return;
  }

  // Search a wide window (past 2 years → future 2 years) to find any existing
  // event with this title, regardless of what date it was previously set to.
  const searchStart = new Date(); searchStart.setFullYear(searchStart.getFullYear() - 2);
  const searchEnd   = new Date(); searchEnd.setFullYear(searchEnd.getFullYear() + 2);

  const existing = calendar.getEvents(searchStart, searchEnd);
  for (let i = 0; i < existing.length; i++) {
    if (existing[i].getTitle() === title) {
      existing[i].deleteEvent();
      Logger.log('Deleted existing event: ' + title);
    }
  }

  const event = calendar.createAllDayEvent(title, eventDate, {
    description: description
  });

  event.removeAllReminders();
  event.addEmailReminder(reminderDays * 24 * 60);

  sendCalendarNotification(employeeEmail, title, eventDate, description);

  Logger.log('Created event: ' + title + ' on ' + eventDate.toDateString());
}
