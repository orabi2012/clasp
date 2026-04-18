// ============================================================
// 04_Calendar.gs
// Google Calendar events for client dates
// ============================================================


function createOrUpdateClientEvents(clientName, clientEmail, employeeEmail, zakatDate, taxDate, folderUrl) {

  // ── event الإقرار الزكوي ──
  if (zakatDate) {
    createOrUpdateEvent(
      'الإقرار الزكوي — ' + clientName,
      zakatDate,
      employeeEmail,
      'تاريخ تقديم الإقرار الزكوي القادم للعميل: ' + clientName + '\n' + (folderUrl || ''),
      CALENDAR_REMINDER_DAYS
    );
  }

  // ── event الإقرار الضريبي ──
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


// ─────────────────────────────────────────────────────────────
function createOrUpdateEvent(title, date, employeeEmail, description, reminderDays) {
  const calendar  = CalendarApp.getDefaultCalendar();
  const eventDate = new Date(date);

  // تحقق من صحة التاريخ
  if (isNaN(eventDate.getTime())) {
    Logger.log('تاريخ غير صالح: ' + date);
    return;
  }

  // ── حذف event قديم بنفس الاسم لو موجود ──
  const startOfDay = new Date(eventDate); startOfDay.setHours(0, 0, 0, 0);
  const endOfDay   = new Date(eventDate); endOfDay.setHours(23, 59, 59, 999);

  const existing = calendar.getEvents(startOfDay, endOfDay);
  for (let i = 0; i < existing.length; i++) {
    if (existing[i].getTitle() === title) {
      existing[i].deleteEvent();
      Logger.log('تم حذف event قديم: ' + title);
    }
  }

  // ── إنشاء all-day event بدون sendInvites ──
  const event = calendar.createAllDayEvent(title, eventDate, {
    description: description
    // ← لا guests ولا sendInvites لتجنب "مرسل مجهول"
  });

  // ── reminder قبل X يوم ──
  event.removeAllReminders();
  event.addEmailReminder(reminderDays * 24 * 60);

  // ── إرسال إيميل مخصص للموظف ──
  sendCalendarNotification(employeeEmail, title, eventDate, description);

  Logger.log('تم إنشاء event: ' + title + ' في ' + eventDate.toDateString());
}


// ─────────────────────────────────────────────────────────────
function sendCalendarNotification(employeeEmail, title, eventDate, description) {
  if (!employeeEmail) return;

  const dateStr = Utilities.formatDate(eventDate, Session.getScriptTimeZone(), 'dd/MM/yyyy');
  const subject = '📅 تذكير: ' + title;

  const htmlBody = `
    <div style="font-family:Arial,sans-serif;direction:rtl;max-width:600px;margin:auto;background:#f9f9f9;padding:20px;">

      <!-- Header -->
      <div style="background:#0d6b6e;border-radius:10px 10px 0 0;padding:28px 32px;text-align:center;">
        <h2 style="color:white;margin:0;font-size:20px;">📅 تذكير بموعد هام</h2>
        <p style="color:#b2dfdf;margin:8px 0 0 0;font-size:14px;">${title}</p>
      </div>

      <!-- Body -->
      <div style="background:#ffffff;padding:28px 32px;border:1px solid #e0e0e0;border-top:none;">
        <table style="width:100%;font-size:14px;color:#333333;border-collapse:collapse;">
          <tr>
            <td style="padding:10px 0;color:#888888;width:120px;">الحدث</td>
            <td style="font-weight:bold;">${title}</td>
          </tr>
          <tr>
            <td style="padding:10px 0;color:#888888;">التاريخ</td>
            <td style="font-weight:bold;color:#0d6b6e;font-size:16px;">${dateStr}</td>
          </tr>
          <tr>
            <td style="padding:10px 0;color:#888888;vertical-align:top;">التفاصيل</td>
            <td style="line-height:1.7;">${(description || '—').replace(/\n/g, '<br>')}</td>
          </tr>
        </table>
      </div>

      <!-- Footer -->
      <div style="background:#f0f0f0;border-radius:0 0 10px 10px;padding:14px 32px;text-align:center;border:1px solid #e0e0e0;border-top:none;">
        <p style="font-size:12px;color:#999999;margin:0;">تم الإرسال تلقائياً - نظام إدارة العملاء</p>
      </div>

    </div>`;

  GmailApp.sendEmail(employeeEmail, subject, '', { htmlBody: htmlBody, charset: 'UTF-8' });
}