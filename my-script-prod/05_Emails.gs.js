// ============================================================
// 05_Emails.gs
// Email notification functions
// ============================================================

// -- Shared email building blocks -----------------------------

function emailLogo_() {
  if (!COMPANY_LOGO_URL) return '';
  return `
    <div style="background:#0d6b6e;border-radius:10px 10px 0 0;padding:20px;text-align:center;">
      <a href="${COMPANY_URL}" style="text-decoration:none;">
        <img src="${COMPANY_LOGO_URL}" alt="${COMPANY_NAME}" style="max-height:48px;max-width:180px;object-fit:contain;" />
      </a>
    </div>`;
}

function emailHeader_(bgColor, title, subtitle) {
  const hasLogo     = !!COMPANY_LOGO_URL;
  const topRadius   = hasLogo ? '0' : '10px';
  return `
    <div style="background:${bgColor};border-radius:${topRadius} ${topRadius} 0 0;padding:32px 24px 28px;text-align:center;">
      <h2 style="color:#ffffff;margin:0 0 8px 0;font-size:22px;font-weight:700;line-height:1.3;">${title}</h2>
      ${subtitle ? `<p style="color:rgba(255,255,255,0.85);margin:0;font-size:14px;line-height:1.6;">${subtitle}</p>` : ''}
    </div>`;
}

function emailFooter_(lang) {
  const sentBy   = lang === 'en' ? 'Sent automatically by' : 'تم الإرسال تلقائياً بواسطة';
  const logoHtml = COMPANY_LOGO_URL
    ? `<img src="${COMPANY_LOGO_URL}" alt="${COMPANY_NAME}" style="max-height:28px;max-width:100px;object-fit:contain;display:block;margin:0 auto 8px;" />`
    : '';
  return `
    <div style="background:#0d6b6e;border-radius:0 0 10px 10px;padding:16px 24px;text-align:center;">
      ${logoHtml}
      <p style="font-size:12px;color:rgba(255,255,255,0.75);margin:0;line-height:1.8;">
        ${sentBy}
        <a href="${COMPANY_URL}" style="color:#ffffff;text-decoration:none;font-weight:600;">${COMPANY_NAME}</a>
      </p>
    </div>`;
}

function folderCard_(borderColor, bgColor, badgeBg, badgeText, folderName, description, url, btnLabel) {
  return `
    <div style="border-right:4px solid ${borderColor};border-radius:8px;padding:18px 20px;margin-bottom:14px;background:${bgColor};box-sizing:border-box;box-shadow:0 1px 4px rgba(0,0,0,0.06);">
      <div style="margin-bottom:10px;">
        <span style="background:${badgeBg};color:#ffffff;font-size:11px;font-weight:700;padding:3px 12px;border-radius:20px;letter-spacing:0.3px;">${badgeText}</span>
      </div>
      <p style="font-size:15px;color:#2d3748;margin:0 0 6px 0;font-weight:700;">${folderName}</p>
      <p style="font-size:13px;color:#718096;margin:0 0 14px 0;line-height:1.7;">${description}</p>
      <a href="${url}" style="display:inline-block;background:${badgeBg};color:#ffffff;padding:11px 24px;border-radius:6px;text-decoration:none;font-size:14px;font-weight:700;letter-spacing:0.2px;">
        ${btnLabel} ←
      </a>
    </div>`;
}

function infoCard_(title, color, rows) {
  let rowsHtml = '';
  for (let i = 0; i < rows.length; i++) {
    const bg = i % 2 === 0 ? '#ffffff' : '#f9fbfc';
    rowsHtml += `
      <tr style="background:${bg};">
        <td style="padding:10px 12px;color:#a0aec0;font-size:13px;width:38%;vertical-align:top;white-space:nowrap;">${rows[i][0]}</td>
        <td style="padding:10px 12px;color:#2d3748;font-size:13px;font-weight:600;word-break:break-word;">${rows[i][1]}</td>
      </tr>`;
  }
  return `
    <div style="border-radius:8px;overflow:hidden;border:1px solid #e8edf2;margin-bottom:14px;box-shadow:0 1px 4px rgba(0,0,0,0.06);">
      <div style="background:${color};padding:10px 16px;">
        <p style="margin:0;font-size:13px;color:#ffffff;font-weight:700;">${title}</p>
      </div>
      <table style="width:100%;border-collapse:collapse;">
        ${rowsHtml}
      </table>
    </div>`;
}

function emailWrapper_(content, lang) {
  const dir       = lang === 'en' ? 'ltr' : 'rtl';
  const logoBar   = emailLogo_();
  const topRadius = COMPANY_LOGO_URL ? '0' : '10px';
  return `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#edf2f7;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#edf2f7;padding:24px 8px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;font-family:'Segoe UI',Arial,sans-serif;direction:${dir};">
        <tr><td>
          ${logoBar}
          <div style="border-radius:${topRadius} ${topRadius} 0 0;overflow:hidden;">
            ${content}
          </div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// -- sendEmailToEmployee --------------------------------------

function sendEmailToEmployee(employeeEmail, employeeName, clientName, clientEmail, clientRow, uploadsUrl, resultsUrl, stageUrl) {
  const subject     = 'تم تعيينك على العميل: ' + clientName;
  const clientPhone = clientRow[3] || 'غير متوفر';
  const taxNumber   = clientRow[4] || 'غير متوفر';
  const uniqueNum   = clientRow[5] || 'غير متوفر';

  const content = `
    ${emailHeader_('#0d6b6e', 'مهمة جديدة بانتظارك', 'مرحباً ' + employeeName + '، تم تعيينك على العميل ' + clientName)}
    <div style="background:#ffffff;padding:24px 20px;border:1px solid #e8edf2;border-top:none;">

      ${infoCard_('بيانات العميل', '#1a73e8', [
        ['الاسم',           clientName],
        ['الايميل',         clientEmail  || 'غير متوفر'],
        ['الهاتف',          clientPhone],
        ['الرقم الضريبي',  taxNumber],
        ['الرقم المميز',   uniqueNum]
      ])}

      <p style="font-size:13px;color:#718096;margin:0 0 14px 0;font-weight:600;">المجلدات المخصصة لك:</p>

      ${folderCard_('#8b5cf6', '#faf5ff', '#8b5cf6', 'مجلد العمل', 'stage',
        'مجلد العمل الخاص بك، منظم بالسنوات والأشهر والأيام.',
        stageUrl, 'افتح مجلد العمل')}

      ${folderCard_('#22c55e', '#f6fef9', '#22c55e', 'مجلد النتائج', 'results',
        'ضع هنا النتائج والتقارير النهائية. العميل يملك صلاحية قراءة فقط.',
        resultsUrl, 'افتح مجلد النتائج')}

    </div>
    ${emailFooter_('ar')}`;

  GmailApp.sendEmail(employeeEmail, subject, '', { htmlBody: emailWrapper_(content, 'ar'), charset: 'UTF-8' });
}

// -- sendEmailToClient ----------------------------------------

function sendEmailToClient(clientEmail, clientName, employeeData, uploadsUrl, resultsUrl, guidelinesUrl, lang) {
  const isEn    = lang === 'en';
  const na      = isEn ? 'N/A' : 'غير متوفر';
  const subject = isEn
    ? 'Your Files Are Ready - ' + clientName
    : 'تم تجهيز ملفاتك - ' + clientName;
  const empName  = employeeData ? employeeData.name         : na;
  const empEmail = employeeData ? employeeData.email        : na;
  const empPhone = employeeData ? (employeeData.phone || na) : na;

  const content = `
    ${emailHeader_('#1a73e8',
      isEn ? 'Your Files Are Ready' : 'تم تجهيز ملفاتك بنجاح',
      isEn ? 'Dear ' + clientName + ', you can now access your personal folders'
           : 'عزيزي ' + clientName + '، يمكنك الآن الوصول إلى مجلديك الخاصين')}
    <div style="background:#ffffff;padding:24px 20px;border:1px solid #e8edf2;border-top:none;">

      ${folderCard_('#f59e0b', '#fffdf5', '#f59e0b',
        isEn ? 'Uploads' : 'مجلد رفع الملفات',
        isEn ? 'Uploads Folder' : 'uploads',
        isEn ? 'This folder is for uploading your documents and required files.'
             : 'هذا المجلد مخصص لرفع مستنداتك وملفاتك المطلوبة.',
        uploadsUrl,
        isEn ? 'Open Uploads Folder' : 'افتح مجلد الرفع')}

      ${folderCard_('#22c55e', '#f6fef9', '#22c55e',
        isEn ? 'Results' : 'مجلد النتائج والتقارير',
        isEn ? 'Results Folder' : 'results',
        isEn ? 'Here you will find reports and results added by your assigned employee.'
             : 'ستجد هنا النتائج والتقارير التي يضعها الموظف المسؤول عنك.',
        resultsUrl,
        isEn ? 'Open Results Folder' : 'افتح مجلد النتائج')}

      ${guidelinesUrl ? folderCard_('#6366f1', '#f5f3ff', '#6366f1',
        isEn ? 'Important Guidelines' : 'ارشادات هامة',
        isEn ? 'Guidelines Folder' : FOLDER_GUIDELINES,
        isEn ? 'Important guidelines and instructions to help you use our services effectively.'
             : 'ارشادات وتعليمات مهمة تساعدك على استخدام خدماتنا بشكل صحيح.',
        guidelinesUrl,
        isEn ? 'Open Guidelines' : 'افتح الارشادات') : ''}

      ${infoCard_(
        isEn ? 'Your Assigned Employee' : 'الموظف المسؤول عنك',
        '#0d6b6e', [
          [isEn ? 'Name'  : 'الاسم',   empName],
          [isEn ? 'Email' : 'الايميل', empEmail],
          [isEn ? 'Phone' : 'الهاتف',  empPhone]
        ])}

    </div>
    ${emailFooter_(lang)}`;

  GmailApp.sendEmail(clientEmail, subject, '', { htmlBody: emailWrapper_(content, lang), charset: 'UTF-8' });
}

// -- sendCalendarEventNotification_ -------------------------
// Branded Statix email sent when a calendar event is created/updated.
// Replaces Google's plain invite email.

function sendCalendarEventNotification_(email, title, eventDate, description, lang) {
  if (!email) return;
  const isEn    = lang === 'en';
  const dateStr = Utilities.formatDate(new Date(eventDate), Session.getScriptTimeZone(), 'dd/MM/yyyy');
  const subject = isEn
    ? 'Upcoming Declaration: ' + title
    : 'موعد إقرار قادم: ' + title;

  // Extract folder URL from description if present
  const lines      = (description || '').split('\n');
  const folderLine = lines.filter(function(l) { return l.indexOf('https://') === 0; })[0] || '';
  const infoText   = lines[0] || title;

  const rows = [
    [isEn ? 'Event'  : 'الحدث',   title],
    [isEn ? 'Date'   : 'التاريخ',
      '<span style="color:#0d6b6e;font-size:16px;font-weight:700;">' + dateStr + '</span>'],
    [isEn ? 'Reminder' : 'التذكير',
      isEn ? CALENDAR_REMINDER_DAYS + ' days before'
           : 'قبل ' + CALENDAR_REMINDER_DAYS + ' أيام']
  ];
  if (folderLine) {
    rows.push([isEn ? 'Folder' : 'المجلد',
      '<a href="' + folderLine + '" style="color:#0d6b6e;font-weight:600;">' +
      (isEn ? 'Open Folder' : 'فتح المجلد') + '</a>']);
  }

  const content = `
    ${emailHeader_('#0d6b6e',
      isEn ? 'Declaration Date Added to Your Calendar' : 'تم إضافة موعد الإقرار إلى تقويمك',
      isEn ? 'The event has been added to your Google Calendar'
           : 'تم إضافة الحدث إلى تقويم Google الخاص بك')}
    <div style="background:#ffffff;padding:24px 20px;border:1px solid #e8edf2;border-top:none;">

      ${infoCard_(isEn ? 'Event Details' : 'تفاصيل الموعد', '#0d6b6e', rows)}

      <p style="font-size:13px;color:#718096;margin:8px 0 0;line-height:1.8;">
        ${isEn
          ? 'You will receive an email reminder ' + CALENDAR_REMINDER_DAYS + ' days before this date.'
          : 'ستصلك رسالة تذكير قبل ' + CALENDAR_REMINDER_DAYS + ' أيام من هذا التاريخ.'}
      </p>

    </div>
    ${emailFooter_(lang)}`;

  GmailApp.sendEmail(email, subject, '', { htmlBody: emailWrapper_(content, lang), charset: 'UTF-8' });
}

// -- sendDateChangedNotification_ ----------------------------
// Called when a declaration date is edited in the sheet.
// Notifies both employee (always ar) and client (their lang).

function sendDateChangedNotification_(email, clientName, type, newDate, lang) {
  if (!email) return;
  const isEn    = lang === 'en';
  const dateStr = Utilities.formatDate(new Date(newDate), Session.getScriptTimeZone(), 'dd/MM/yyyy');
  const subject = isEn
    ? 'Date Updated: ' + type + ' — ' + clientName
    : 'تم تحديث الموعد: ' + type + ' — ' + clientName;

  const content = `
    ${emailHeader_('#e67e22',
      isEn ? 'Declaration Date Updated' : 'تم تحديث تاريخ الإقرار',
      clientName + ' · ' + type)}
    <div style="background:#ffffff;padding:24px 20px;border:1px solid #e8edf2;border-top:none;">

      ${infoCard_(isEn ? 'Updated Details' : 'التفاصيل المحدّثة', '#e67e22', [
        [isEn ? 'Client'   : 'العميل',        clientName],
        [isEn ? 'Type'     : 'النوع',          type],
        [isEn ? 'New Date' : 'التاريخ الجديد',
          '<span style="color:#e67e22;font-size:16px;font-weight:700;">' + dateStr + '</span>']
      ])}

    </div>
    ${emailFooter_(lang)}`;

  GmailApp.sendEmail(email, subject, '', { htmlBody: emailWrapper_(content, lang), charset: 'UTF-8' });
}

// -- sendDateReminder_ ----------------------------------------
// Called by checkUpcomingDates (daily trigger).
// Notifies both employee and client CALENDAR_REMINDER_DAYS before the date.

function sendDateReminder_(email, clientName, type, date, daysLeft, folderUrl, lang) {
  if (!email) return;
  const isEn    = lang === 'en';
  const dateStr = Utilities.formatDate(new Date(date), Session.getScriptTimeZone(), 'dd/MM/yyyy');
  const subject = isEn
    ? 'Reminder: ' + type + ' in ' + daysLeft + ' days — ' + clientName
    : 'تذكير: ' + type + ' بعد ' + daysLeft + ' أيام — ' + clientName;

  const rows = [
    [isEn ? 'Client'    : 'العميل',        clientName],
    [isEn ? 'Type'      : 'النوع',          type],
    [isEn ? 'Date'      : 'التاريخ',
      '<span style="color:#dc3545;font-size:16px;font-weight:700;">' + dateStr + '</span>'],
    [isEn ? 'Days Left' : 'الأيام المتبقية',
      '<span style="color:#dc3545;font-weight:700;">' + daysLeft + '</span>']
  ];
  if (folderUrl) {
    rows.push([isEn ? 'Folder' : 'المجلد',
      '<a href="' + folderUrl + '" style="color:#0d6b6e;font-weight:600;">' +
      (isEn ? 'Open Folder' : 'فتح المجلد') + '</a>']);
  }

  const content = `
    ${emailHeader_('#dc3545',
      isEn ? 'Upcoming Declaration Reminder' : 'تذكير بموعد إقرار قادم',
      isEn ? daysLeft + ' days remaining' : 'تبقى ' + daysLeft + ' أيام')}
    <div style="background:#ffffff;padding:24px 20px;border:1px solid #e8edf2;border-top:none;">

      ${infoCard_(isEn ? 'Reminder Details' : 'تفاصيل التذكير', '#dc3545', rows)}

    </div>
    ${emailFooter_(lang)}`;

  GmailApp.sendEmail(email, subject, '', { htmlBody: emailWrapper_(content, lang), charset: 'UTF-8' });
}

// -- sendUploadNotification -----------------------------------
// Notifies the employee that new files were moved into stage/<day>.
// dayFolderUrl: direct link to the day folder in stage/
// dateStr: formatted date string e.g. "22/04/2026"

function sendUploadNotification(employeeEmail, employeeName, clientName, dayFolderUrl, files, dateStr, trackerUrl) {
  const count   = files.length;
  const subject = 'ملفات جديدة بتاريخ ' + dateStr + ' — ' + clientName + ' (' + count + ')';

  let fileRows = '';
  for (let i = 0; i < files.length; i++) {
    const f    = files[i];
    const size = f.size < 1024    ? f.size + ' B'
               : f.size < 1048576 ? Math.round(f.size / 1024) + ' KB'
               : (f.size / 1048576).toFixed(1) + ' MB';
    const bg   = i % 2 === 0 ? '#ffffff' : '#f9fbfc';
    fileRows += `
      <tr style="background:${bg};">
        <td style="padding:11px 12px;font-size:13px;word-break:break-word;">
          <a href="${f.url}" style="color:#1a73e8;text-decoration:none;font-weight:600;">${f.name}</a>
        </td>
        <td style="padding:11px 12px;font-size:12px;color:#a0aec0;text-align:center;white-space:nowrap;">${size}</td>
      </tr>`;
  }

  const content = `
    ${emailHeader_('#0d6b6e', 'ملفات جديدة بتاريخ ' + dateStr, clientName + ' — ' + count + ' ملف(ات) تم نقلها إلى مجلد العمل')}
    <div style="background:#ffffff;padding:24px 20px;border:1px solid #e8edf2;border-top:none;">

      <p style="font-size:14px;color:#4a5568;margin:0 0 16px 0;line-height:1.8;">
        مرحباً <strong>${employeeName}</strong>، رفع العميل <strong>${clientName}</strong> الملفات التالية وتم نقلها تلقائياً إلى مجلد العمل:
      </p>

      <div style="border-radius:8px;overflow:hidden;border:1px solid #e8edf2;margin-bottom:18px;box-shadow:0 1px 4px rgba(0,0,0,0.06);">
        <table style="width:100%;border-collapse:collapse;">
          <tr style="background:#f5f7fa;">
            <th style="padding:10px 12px;text-align:right;font-size:12px;color:#718096;font-weight:700;">اسم الملف</th>
            <th style="padding:10px 12px;text-align:center;font-size:12px;color:#718096;font-weight:700;">الحجم</th>
          </tr>
          ${fileRows}
        </table>
      </div>

      <a href="${dayFolderUrl}" style="display:inline-block;background:#8b5cf6;color:#ffffff;padding:12px 28px;border-radius:6px;text-decoration:none;font-size:14px;font-weight:700;margin-left:10px;">
        افتح مجلد اليوم ←
      </a>
      ${trackerUrl ? `<a href="${trackerUrl}" style="display:inline-block;background:#1a73e8;color:#ffffff;padding:12px 28px;border-radius:6px;text-decoration:none;font-size:14px;font-weight:700;">
        افتح جدول المتابعة ←
      </a>` : ''}

    </div>
    ${emailFooter_('ar')}`;

  GmailApp.sendEmail(employeeEmail, subject, '', { htmlBody: emailWrapper_(content, 'ar'), charset: 'UTF-8' });
}

// -- sendFilesReceivedEmail_ ----------------------------------
// Branded email to the CLIENT confirming files were received
// and are under processing. No Drive links exposed.

function sendFilesReceivedEmail_(clientEmail, clientName, files, dateStr, lang) {
  if (!clientEmail) return;
  const isEn    = lang === 'en';
  const subject = isEn
    ? 'Files Received — ' + dateStr + ' | ' + COMPANY_NAME
    : 'استلام ملفاتك بتاريخ ' + dateStr;

  let fileRows = '';
  for (let i = 0; i < files.length; i++) {
    const bg = i % 2 === 0 ? '#ffffff' : '#f9fbfc';
    fileRows += `
      <tr style="background:${bg};">
        <td style="padding:11px 14px;font-size:13px;color:#2d3748;word-break:break-word;">${files[i].name}</td>
      </tr>`;
  }

  const content = `
    ${emailHeader_('#0d6b6e',
      isEn ? 'Files Received' : 'تم استلام ملفاتك',
      isEn ? 'Your files dated ' + dateStr + ' are under processing'
           : 'ملفاتك بتاريخ ' + dateStr + ' قيد المعالجة')}
    <div style="background:#ffffff;padding:24px 20px;border:1px solid #e8edf2;border-top:none;">

      <p style="font-size:14px;color:#4a5568;margin:0 0 16px 0;line-height:1.9;">
        ${ isEn
          ? 'Dear <strong>' + clientName + '</strong>, we have received the following files and our team is currently processing them:'
          : 'عزيزنا <strong>' + clientName + '</strong>، استلمنا الملفات التالية وهي حالياً قيد المعالجة من قبل فريقنا:'}
      </p>

      <div style="border-radius:8px;overflow:hidden;border:1px solid #e8edf2;margin-bottom:18px;box-shadow:0 1px 4px rgba(0,0,0,0.06);">
        <div style="background:#0d6b6e;padding:10px 14px;">
          <p style="margin:0;font-size:13px;color:#ffffff;font-weight:700;">
            ${isEn ? 'Received Files (' + files.length + ')' : 'الملفات المستلمة (' + files.length + ')'}
          </p>
        </div>
        <table style="width:100%;border-collapse:collapse;">
          ${fileRows}
        </table>
      </div>

      <p style="font-size:13px;color:#718096;margin:0;line-height:1.8;">
        ${isEn
          ? 'We will notify you once the work is complete.'
          : 'سيتم إشعارك فور الانتهاء من معالجتها.'}
      </p>

    </div>
    ${emailFooter_(lang)}`;

  GmailApp.sendEmail(clientEmail, subject, '', { htmlBody: emailWrapper_(content, lang), charset: 'UTF-8' });
}

// -- sendInvoiceDoneEmail_ ------------------------------------
// Sent by the employee via the tracker menu when a day's work is complete.
// filesList: [{ name, url }]
// notesList: [{ name, note, url }]  (only rows with non-empty notes)

function sendInvoiceDoneEmail_(clientEmail, clientName, dateStr, filesList, notesList, lang) {
  if (!clientEmail) return;
  const isEn    = lang === 'en';
  const subject = isEn
    ? 'Invoice Processing Complete — ' + dateStr + ' | ' + COMPANY_NAME
    : 'اكتمال معالجة فواتير يوم ' + dateStr;

  // File list rows
  let fileRows = '';
  for (let i = 0; i < filesList.length; i++) {
    const bg = i % 2 === 0 ? '#ffffff' : '#f9fbfc';
    fileRows += `
      <tr style="background:${bg};">
        <td style="padding:11px 14px;font-size:13px;">
          <a href="${filesList[i].url}" style="color:#1a73e8;text-decoration:none;font-weight:600;">${filesList[i].name}</a>
        </td>
      </tr>`;
  }

  // Notes section (optional)
  let notesHtml = '';
  if (notesList && notesList.length > 0) {
    let notesRows = '';
    for (let j = 0; j < notesList.length; j++) {
      const bg = j % 2 === 0 ? '#ffffff' : '#f9fbfc';
      notesRows += `
        <tr style="background:${bg};">
          <td style="padding:10px 12px;font-size:13px;width:40%;">
            <a href="${notesList[j].url}" style="color:#1a73e8;text-decoration:none;font-weight:600;">${notesList[j].name}</a>
          </td>
          <td style="padding:10px 12px;font-size:13px;color:#4a5568;">${notesList[j].note}</td>
        </tr>`;
    }
    notesHtml = `
      <p style="font-size:14px;font-weight:700;color:#2d3748;margin:20px 0 10px 0;">
        ${isEn ? 'Notes' : 'ملاحظات'}
      </p>
      <div style="border-radius:8px;overflow:hidden;border:1px solid #e8edf2;margin-bottom:18px;">
        <table style="width:100%;border-collapse:collapse;">
          <tr style="background:#f5f7fa;">
            <th style="padding:10px 12px;text-align:right;font-size:12px;color:#718096;font-weight:700;">${isEn ? 'File' : 'الملف'}</th>
            <th style="padding:10px 12px;text-align:right;font-size:12px;color:#718096;font-weight:700;">${isEn ? 'Note' : 'الملاحظة'}</th>
          </tr>
          ${notesRows}
        </table>
      </div>`;
  }

  const content = `
    ${emailHeader_('#0d6b6e',
      isEn ? 'Invoice Processing Complete' : 'تم الانتهاء من معالجة فواتيرك',
      isEn ? 'Invoices for ' + dateStr + ' have been processed'
           : 'تم الانتهاء من فواتير يوم ' + dateStr)}
    <div style="background:#ffffff;padding:24px 20px;border:1px solid #e8edf2;border-top:none;">

      <p style="font-size:14px;color:#4a5568;margin:0 0 16px 0;line-height:1.9;">
        ${isEn
          ? 'Dear <strong>' + clientName + '</strong>, the following invoices have been processed:'
          : 'عزيزنا <strong>' + clientName + '</strong>، تم الانتهاء من معالجة الفواتير التالية:'}
      </p>

      <div style="border-radius:8px;overflow:hidden;border:1px solid #e8edf2;margin-bottom:18px;box-shadow:0 1px 4px rgba(0,0,0,0.06);">
        <div style="background:#0d6b6e;padding:10px 14px;">
          <p style="margin:0;font-size:13px;color:#ffffff;font-weight:700;">
            ${isEn ? 'Processed Files (' + filesList.length + ')' : 'الملفات المعالجة (' + filesList.length + ')'}
          </p>
        </div>
        <table style="width:100%;border-collapse:collapse;">
          ${fileRows}
        </table>
      </div>

      ${notesHtml}

    </div>
    ${emailFooter_(lang)}`;

  GmailApp.sendEmail(clientEmail, subject, '', { htmlBody: emailWrapper_(content, lang), charset: 'UTF-8' });
}

// -- sendReturnToEmpEmail_ ------------------------------------
// Sent by the supervisor via the portal when returning files to an employee.
// files: [{ name, url }]

function sendReturnToEmpEmail_(empEmail, empName, clientName, files, supervisorName, returnNote) {
  if (!empEmail) return;
  const count   = files ? files.length : 0;
  const subject = 'إعادة ملفات للمراجعة — ' + clientName + ' (' + count + ')';

  let fileRows = '';
  for (let i = 0; i < (files || []).length; i++) {
    const bg = i % 2 === 0 ? '#ffffff' : '#f9fbfc';
    fileRows += `
      <tr style="background:${bg};">
        <td style="padding:11px 14px;font-size:13px;">
          <a href="${files[i].url}" style="color:#1a73e8;text-decoration:none;font-weight:600;">${files[i].name}</a>
        </td>
      </tr>`;
  }

  const noteHtml = returnNote
    ? `<div style="background:#fff3cd;border-right:4px solid #f59e0b;border-radius:8px;padding:16px 20px;margin-top:16px;">
        <p style="margin:0 0 6px 0;font-size:13px;font-weight:700;color:#92400e;">ملاحظة المشرف:</p>
        <p style="margin:0;font-size:13px;color:#4a5568;line-height:1.8;">${returnNote}</p>
       </div>`
    : '';

  const content = `
    ${emailHeader_('#f59e0b', 'إعادة ملفات للمراجعة', 'العميل: ' + clientName + ' · المشرف: ' + (supervisorName || COMPANY_NAME))}
    <div style="background:#ffffff;padding:24px 20px;border:1px solid #e8edf2;border-top:none;">

      <p style="font-size:14px;color:#4a5568;margin:0 0 16px 0;line-height:1.8;">
        مرحباً <strong>${empName}</strong>، أعاد المشرف الملفات التالية للمراجعة وتطلب إعادة الاعتماد:
      </p>

      <div style="border-radius:8px;overflow:hidden;border:1px solid #e8edf2;margin-bottom:16px;box-shadow:0 1px 4px rgba(0,0,0,0.06);">
        <div style="background:#f59e0b;padding:10px 14px;">
          <p style="margin:0;font-size:13px;color:#ffffff;font-weight:700;">الملفات المُعادة (${count})</p>
        </div>
        <table style="width:100%;border-collapse:collapse;">
          ${fileRows}
        </table>
      </div>

      ${noteHtml}

      <p style="font-size:13px;color:#718096;margin:16px 0 0;line-height:1.8;">
        يرجى مراجعة الملفات، التأكد من اكتمالها ثم إعادة الاعتماد من البوابة.
      </p>

    </div>
    ${emailFooter_('ar')}`;

  GmailApp.sendEmail(empEmail, subject, '', { htmlBody: emailWrapper_(content, 'ar'), charset: 'UTF-8' });
}

// -- sendSubmittedToSupervisorEmail_ --------------------------
// Direct notification to the supervisor when an employee submits a day
// for review. Replaces the legacy batched digest.
// files: [{ name, url }]

function sendSubmittedToSupervisorEmail_(supEmail, supName, empName, clientName, files, portalUrl) {
  if (!supEmail) return;
  const count   = files ? files.length : 0;
  const subject = 'ملفات بانتظار المراجعة — ' + clientName + ' (' + count + ')';

  let fileRows = '';
  for (let i = 0; i < (files || []).length; i++) {
    const bg = i % 2 === 0 ? '#ffffff' : '#f9fbfc';
    fileRows += `
      <tr style="background:${bg};">
        <td style="padding:11px 14px;font-size:13px;">
          <a href="${files[i].url}" style="color:#1a73e8;text-decoration:none;font-weight:600;">${files[i].name}</a>
        </td>
      </tr>`;
  }

  const portalBtn = portalUrl
    ? `<a href="${portalUrl}" style="display:inline-block;background:#0d6b6e;color:#ffffff;padding:12px 28px;border-radius:6px;text-decoration:none;font-size:14px;font-weight:700;margin-top:8px;">
        افتح لوحة المتابعة ←
       </a>`
    : '';

  const content = `
    ${emailHeader_('#0d6b6e', 'ملفات بانتظار المراجعة', 'العميل: ' + clientName + ' · الموظف: ' + empName)}
    <div style="background:#ffffff;padding:24px 20px;border:1px solid #e8edf2;border-top:none;">

      <p style="font-size:14px;color:#4a5568;margin:0 0 16px 0;line-height:1.8;">
        مرحباً <strong>${supName || ''}</strong>، قام الموظف <strong>${empName}</strong> باعتماد الملفات التالية للعميل <strong>${clientName}</strong> وهي بانتظار مراجعتك:
      </p>

      <div style="border-radius:8px;overflow:hidden;border:1px solid #e8edf2;margin-bottom:16px;box-shadow:0 1px 4px rgba(0,0,0,0.06);">
        <div style="background:#0d6b6e;padding:10px 14px;">
          <p style="margin:0;font-size:13px;color:#ffffff;font-weight:700;">الملفات المعتمدة (${count})</p>
        </div>
        <table style="width:100%;border-collapse:collapse;">
          ${fileRows}
        </table>
      </div>

      ${portalBtn}

    </div>
    ${emailFooter_('ar')}`;

  GmailApp.sendEmail(supEmail, subject, '', { htmlBody: emailWrapper_(content, 'ar'), charset: 'UTF-8' });
}