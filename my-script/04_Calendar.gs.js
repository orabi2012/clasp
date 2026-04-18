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

  const startOfDay = new Date(eventDate); startOfDay.setHours(0, 0, 0, 0);
  const endOfDay   = new Date(eventDate); endOfDay.setHours(23, 59, 59, 999);

  const existing = calendar.getEvents(startOfDay, endOfDay);
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
