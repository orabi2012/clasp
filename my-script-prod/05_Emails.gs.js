// ============================================================
// 05_Emails.gs
// Email notification functions
// ============================================================

// -- Shared email building blocks -----------------------------

function esc_(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

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

function sendEmailToEmployee(employeeEmail, employeeName, clientName, clientEmail, clientRow) {
  const subject     = 'تم تعيينك على العميل: ' + clientName;
  const clientPhone = clientRow[3] || 'غير متوفر';
  const taxNumber   = clientRow[4] || 'غير متوفر';
  const uniqueNum   = clientRow[5] || 'غير متوفر';
  const portalUrl   = getPortalUrl_();

  const rows = [
    ['الاسم',          clientName],
    ['الايميل',        clientEmail || 'غير متوفر'],
    ['الهاتف',         clientPhone],
    ['الرقم الضريبي',  taxNumber],
    ['الرقم المميز',   uniqueNum]
  ];
  let infoRows = '';
  for (let i = 0; i < rows.length; i++) {
    const bg = i % 2 === 0 ? '#ffffff' : '#f9fbfc';
    infoRows += `
      <tr style="background:${bg};">
        <td style="padding:11px 14px;font-size:13px;color:#a0aec0;width:38%;vertical-align:top;white-space:nowrap;">${rows[i][0]}</td>
        <td style="padding:11px 14px;font-size:13px;color:#2d3748;font-weight:600;word-break:break-word;">${rows[i][1]}</td>
      </tr>`;
  }

  const content = `
    ${emailHeader_('#0d6b6e',
      'مهمة جديدة بانتظارك',
      'تم تعيينك على العميل ' + clientName)}
    <div style="background:#ffffff;padding:24px 20px;border:1px solid #e8edf2;border-top:none;">

      <p style="font-size:14px;color:#4a5568;margin:0 0 16px 0;line-height:1.9;">
        مرحباً <strong>${employeeName}</strong>، تم إسناد عميل جديد إليك. تجد بيانات العميل أدناه:
      </p>

      <div style="border-radius:8px;overflow:hidden;border:1px solid #e8edf2;margin-bottom:18px;box-shadow:0 1px 4px rgba(0,0,0,0.06);">
        <div style="background:#0d6b6e;padding:10px 14px;">
          <p style="margin:0;font-size:13px;color:#ffffff;font-weight:700;">بيانات العميل</p>
        </div>
        <table style="width:100%;border-collapse:collapse;">
          ${infoRows}
        </table>
      </div>

      ${portalUrl ? `<div style="text-align:center;margin:6px 0 10px;">
        <a href="${portalUrl}/workflow.html" style="display:inline-block;background:#0d6b6e;color:#ffffff;padding:12px 32px;border-radius:6px;text-decoration:none;font-size:14px;font-weight:700;">
          افتح لوحة المتابعة ←
        </a>
      </div>` : ''}

      <p style="font-size:13px;color:#718096;margin:8px 0 0;line-height:1.8;">
        يرجى المتابعة مع العميل في أقرب وقت ممكن.
      </p>

    </div>
    ${emailFooter_('ar')}`;

  GmailApp.sendEmail(employeeEmail, subject, '', { htmlBody: emailWrapper_(content, 'ar'), charset: 'UTF-8' });
}

// -- sendEmailToClient ----------------------------------------

function sendEmailToClient(clientEmail, clientName, employeeData, uploadsUrl, resultsUrl, guidelinesUrl, lang) {
  const isEn    = lang === 'en';
  const na      = isEn ? 'N/A' : 'غير متوفر';
  const subject = isEn
    ? 'Your Files Are Ready - ' + clientName + ' | ' + COMPANY_NAME
    : 'تم تجهيز ملفاتك - ' + clientName;
  const empName  = employeeData ? employeeData.name         : na;
  const empEmail = employeeData ? employeeData.email        : na;
  const empPhone = employeeData ? (employeeData.phone || na) : na;

  const folders = [
    {
      url:   uploadsUrl,
      title: isEn ? 'Uploads Folder' : 'مجلد رفع الملفات',
      desc:  isEn ? 'Upload your documents and required files here.'
                  : 'لرفع مستنداتك وملفاتك المطلوبة.',
      btn:   isEn ? 'Open Uploads' : 'افتح مجلد الرفع'
    },
    {
      url:   resultsUrl,
      title: isEn ? 'Results Folder' : 'مجلد النتائج والتقارير',
      desc:  isEn ? 'Reports and results added by the team will appear here.'
                  : 'ستجد هنا النتائج والتقارير التي يضعها الفريق.',
      btn:   isEn ? 'Open Results' : 'افتح مجلد النتائج'
    }
  ];
  if (guidelinesUrl) {
    folders.push({
      url:   guidelinesUrl,
      title: isEn ? 'Guidelines' : 'ارشادات هامة',
      desc:  isEn ? 'Important guidelines to help you use our services effectively.'
                  : 'ارشادات وتعليمات مهمة تساعدك على استخدام خدماتنا بشكل صحيح.',
      btn:   isEn ? 'Open Guidelines' : 'افتح الارشادات'
    });
  }

  let folderRows = '';
  for (let i = 0; i < folders.length; i++) {
    const f  = folders[i];
    const bg = i % 2 === 0 ? '#ffffff' : '#f9fbfc';
    folderRows += `
      <tr style="background:${bg};">
        <td style="padding:14px;font-size:13px;">
          <p style="margin:0 0 4px 0;font-size:14px;color:#2d3748;font-weight:700;">${f.title}</p>
          <p style="margin:0 0 10px 0;font-size:12px;color:#718096;line-height:1.7;">${f.desc}</p>
          <a href="${f.url}" style="display:inline-block;background:#0d6b6e;color:#ffffff;padding:8px 18px;border-radius:6px;text-decoration:none;font-size:13px;font-weight:700;">${f.btn} ←</a>
        </td>
      </tr>`;
  }

  const supRows = [
    [isEn ? 'Name'  : 'الاسم',   empName],
    [isEn ? 'Email' : 'الايميل', empEmail],
    [isEn ? 'Phone' : 'الهاتف',  empPhone]
  ];
  let supRowsHtml = '';
  for (let i = 0; i < supRows.length; i++) {
    const bg = i % 2 === 0 ? '#ffffff' : '#f9fbfc';
    supRowsHtml += `
      <tr style="background:${bg};">
        <td style="padding:11px 14px;font-size:13px;color:#a0aec0;width:38%;vertical-align:top;white-space:nowrap;">${supRows[i][0]}</td>
        <td style="padding:11px 14px;font-size:13px;color:#2d3748;font-weight:600;word-break:break-word;">${supRows[i][1]}</td>
      </tr>`;
  }

  const content = `
    ${emailHeader_('#0d6b6e',
      isEn ? 'Your Files Are Ready' : 'تم تجهيز ملفاتك بنجاح',
      isEn ? 'You can now access your personal folders'
           : 'يمكنك الآن الوصول إلى مجلداتك الخاصة')}
    <div style="background:#ffffff;padding:24px 20px;border:1px solid #e8edf2;border-top:none;">

      <p style="font-size:14px;color:#4a5568;margin:0 0 16px 0;line-height:1.9;">
        ${ isEn
          ? 'Dear <strong>' + clientName + '</strong>, your personal folders have been prepared and are ready for use:'
          : 'عزيزنا <strong>' + clientName + '</strong>، تم تجهيز مجلداتك الخاصة وأصبحت جاهزة للاستخدام:'}
      </p>

      <div style="border-radius:8px;overflow:hidden;border:1px solid #e8edf2;margin-bottom:18px;box-shadow:0 1px 4px rgba(0,0,0,0.06);">
        <div style="background:#0d6b6e;padding:10px 14px;">
          <p style="margin:0;font-size:13px;color:#ffffff;font-weight:700;">
            ${isEn ? 'Your Folders (' + folders.length + ')' : 'مجلداتك (' + folders.length + ')'}
          </p>
        </div>
        <table style="width:100%;border-collapse:collapse;">
          ${folderRows}
        </table>
      </div>

      <div style="border-radius:8px;overflow:hidden;border:1px solid #e8edf2;margin-bottom:18px;box-shadow:0 1px 4px rgba(0,0,0,0.06);">
        <div style="background:#0d6b6e;padding:10px 14px;">
          <p style="margin:0;font-size:13px;color:#ffffff;font-weight:700;">
            ${isEn ? 'Your Assigned Supervisor' : 'المشرف المسؤول عنك'}
          </p>
        </div>
        <table style="width:100%;border-collapse:collapse;">
          ${supRowsHtml}
        </table>
      </div>

      <p style="font-size:13px;color:#718096;margin:0;line-height:1.8;">
        ${isEn
          ? 'Feel free to contact your assigned supervisor for any questions.'
          : 'لا تتردد في التواصل مع المشرف المسؤول عنك لأي استفسار.'}
      </p>

    </div>
    ${emailFooter_(lang)}`;

  GmailApp.sendEmail(clientEmail, subject, '', { htmlBody: emailWrapper_(content, lang), charset: 'UTF-8' });
}

// -- sendNewClientAdminEmail_ ---------------------------------
// Notifies all admin emails (ADMIN_EMAILS script property) when a new
// client submits the registration form.

function sendNewClientAdminEmail_(data, lang) {
  const adminEmails = (PropertiesService.getScriptProperties().getProperty('ADMIN_EMAILS') || '')
    .split(',').map(function(e) { return e.trim(); }).filter(Boolean);
  if (!adminEmails.length) return;

  const isEn     = lang === 'en';
  const portalUrl = getPortalUrl_();
  const subject = isEn
    ? 'New Client Registered: ' + data.name
    : 'عميل جديد: ' + data.name;

  const content = `
    ${emailHeader_('#1a73e8',
      isEn ? 'New Client Registration' : 'تسجيل عميل جديد',
      isEn ? 'A new client has submitted the registration form'
           : 'قام عميل جديد بتعبئة نموذج التسجيل')}
    <div style="background:#ffffff;padding:24px 20px;border:1px solid #e8edf2;border-top:none;">
      ${infoCard_(isEn ? 'Client Details' : 'بيانات العميل', '#1a73e8', [
        [isEn ? 'Name'       : 'الاسم',             data.name      || '—'],
        [isEn ? 'Email'      : 'الايميل',            data.email     || '—'],
        [isEn ? 'Phone'      : 'الهاتف',             data.phone     || '—'],
        [isEn ? 'Tax Number' : 'الرقم الضريبي',      data.taxNumber || '—'],
        [isEn ? 'CR Number'  : 'الرقم المميز',       data.crNumber  || '—'],
        [isEn ? 'Language'   : 'اللغة',              data.lang      || 'ar']
      ])}

      ${portalUrl ? `<div style="text-align:center;margin:14px 0 4px;">
        <a href="${portalUrl}/admin.html" style="display:inline-block;background:#1e3a8a;color:#ffffff;padding:12px 32px;border-radius:6px;text-decoration:none;font-size:14px;font-weight:700;">
          ${isEn ? 'Open Admin Dashboard →' : 'افتح لوحة الإدارة ←'}
        </a>
      </div>` : ''}
    </div>
    ${emailFooter_(lang)}`;

  const html = emailWrapper_(content, lang);
  adminEmails.forEach(function(email) {
    try {
      GmailApp.sendEmail(email, subject, '', { htmlBody: html, charset: 'UTF-8' });
    } catch (err) {
      Logger.log('sendNewClientAdminEmail_ error for ' + email + ': ' + err.message);
    }
  });
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

      ${trackerUrl ? `<div style="text-align:center;margin:6px 0 10px;">
        <a href="${trackerUrl}/workflow.html" style="display:inline-block;background:#0d6b6e;color:#ffffff;padding:12px 32px;border-radius:6px;text-decoration:none;font-size:14px;font-weight:700;">
          افتح لوحة المتابعة ←
        </a>
      </div>` : ''}

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

function sendInvoiceDoneEmail_(clientEmail, clientName, dateStr, filesList, notesList, lang, supervisorNote) {
  if (!clientEmail) return;
  const isEn    = lang === 'en';
  const subject = isEn
    ? 'Invoice Processing Complete — ' + dateStr + ' | ' + COMPANY_NAME
    : 'اكتمال معالجة فواتير يوم ' + dateStr;

  // File list rows — plain text names, no hyperlinks
  let fileRows = '';
  for (let i = 0; i < filesList.length; i++) {
    const bg = i % 2 === 0 ? '#ffffff' : '#f9fbfc';
    fileRows += `
      <tr style="background:${bg};">
        <td style="padding:11px 14px;font-size:13px;">
          <span style="font-size:13px;color:#2d3748;">${filesList[i].name}</span>
        </td>
      </tr>`;
  }

  // Supervisor note block (optional)
  const supNoteHtml = supervisorNote
    ? `<div style="background:#fffbeb;border-right:4px solid #f59e0b;border-radius:8px;padding:16px 20px;margin-top:16px;">
        <p style="margin:0 0 6px 0;font-size:13px;font-weight:700;color:#92400e;">${isEn ? 'Note from Statix:' : 'ملاحظة من Statix:'}</p>
        <p style="margin:0;font-size:13px;color:#4a5568;line-height:1.8;">${esc_(supervisorNote)}</p>
       </div>`
    : '';

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

      ${supNoteHtml}

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