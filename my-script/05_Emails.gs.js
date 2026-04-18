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

function emailFooter_() {
  const logoHtml = COMPANY_LOGO_URL
    ? `<img src="${COMPANY_LOGO_URL}" alt="${COMPANY_NAME}" style="max-height:28px;max-width:100px;object-fit:contain;display:block;margin:0 auto 8px;" />`
    : '';
  return `
    <div style="background:#0d6b6e;border-radius:0 0 10px 10px;padding:16px 24px;text-align:center;">
      ${logoHtml}
      <p style="font-size:12px;color:rgba(255,255,255,0.75);margin:0;line-height:1.8;">
        تم الإرسال تلقائياً بواسطة
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

function emailWrapper_(content) {
  const logoBar = emailLogo_();
  const topRadius = COMPANY_LOGO_URL ? '0' : '10px';
  return `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#edf2f7;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#edf2f7;padding:24px 8px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;font-family:'Segoe UI',Arial,sans-serif;direction:rtl;">
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

      ${folderCard_('#f59e0b', '#fffdf5', '#f59e0b', 'مجلد الرفع', 'uploads',
        'يرفع فيه العميل مستنداته. يمكنك مراجعة وتعديل الملفات داخله.',
        uploadsUrl, 'افتح مجلد الرفع')}

      ${folderCard_('#8b5cf6', '#faf5ff', '#8b5cf6', 'مجلد العمل', 'stage',
        'مجلد العمل الخاص بك، منظم بالسنوات والأشهر والأيام.',
        stageUrl, 'افتح مجلد العمل')}

      ${folderCard_('#22c55e', '#f6fef9', '#22c55e', 'مجلد النتائج', 'results',
        'ضع هنا النتائج والتقارير النهائية. العميل يملك صلاحية قراءة فقط.',
        resultsUrl, 'افتح مجلد النتائج')}

    </div>
    ${emailFooter_()}`;

  GmailApp.sendEmail(employeeEmail, subject, '', { htmlBody: emailWrapper_(content), charset: 'UTF-8' });
}

// -- sendEmailToClient ----------------------------------------

function sendEmailToClient(clientEmail, clientName, employeeData, uploadsUrl, resultsUrl) {
  const subject  = 'تم تجهيز ملفاتك - ' + clientName;
  const empName  = employeeData ? employeeData.name  : 'غير متوفر';
  const empEmail = employeeData ? employeeData.email : 'غير متوفر';
  const empPhone = employeeData ? employeeData.phone : 'غير متوفر';

  const content = `
    ${emailHeader_('#1a73e8', 'تم تجهيز ملفاتك بنجاح', 'عزيزي ' + clientName + '، يمكنك الآن الوصول إلى مجلديك الخاصين')}
    <div style="background:#ffffff;padding:24px 20px;border:1px solid #e8edf2;border-top:none;">

      ${folderCard_('#f59e0b', '#fffdf5', '#f59e0b', 'مجلد رفع الملفات', 'uploads',
        'هذا المجلد مخصص لرفع مستنداتك وملفاتك المطلوبة.',
        uploadsUrl, 'افتح مجلد الرفع')}

      ${folderCard_('#22c55e', '#f6fef9', '#22c55e', 'مجلد النتائج والتقارير', 'results',
        'ستجد هنا النتائج والتقارير التي يضعها الموظف المسؤول عنك.',
        resultsUrl, 'افتح مجلد النتائج')}

      ${infoCard_('الموظف المسؤول عنك', '#0d6b6e', [
        ['الاسم',    empName],
        ['الايميل',  empEmail],
        ['الهاتف',   empPhone || 'غير متوفر']
      ])}

    </div>
    ${emailFooter_()}`;

  GmailApp.sendEmail(clientEmail, subject, '', { htmlBody: emailWrapper_(content), charset: 'UTF-8' });
}

// -- sendCalendarNotification ---------------------------------

function sendCalendarNotification(employeeEmail, title, eventDate, description) {
  if (!employeeEmail) return;

  const dateStr = Utilities.formatDate(eventDate, Session.getScriptTimeZone(), 'dd/MM/yyyy');
  const subject = 'تذكير: ' + title;

  const content = `
    ${emailHeader_('#0d6b6e', 'تذكير بموعد هام', title)}
    <div style="background:#ffffff;padding:24px 20px;border:1px solid #e8edf2;border-top:none;">

      ${infoCard_('تفاصيل الموعد', '#0d6b6e', [
        ['الحدث',     title],
        ['التاريخ',   '<span style="color:#0d6b6e;font-size:16px;font-weight:700;">' + dateStr + '</span>'],
        ['التفاصيل',  (description || '—').replace(/\n/g, '<br>')]
      ])}

    </div>
    ${emailFooter_()}`;

  GmailApp.sendEmail(employeeEmail, subject, '', { htmlBody: emailWrapper_(content), charset: 'UTF-8' });
}

// -- sendUploadNotification -----------------------------------

function sendUploadNotification(employeeEmail, employeeName, clientName, uploadsUrl, files) {
  const count   = files.length;
  const subject = 'ملفات جديدة من العميل: ' + clientName + ' (' + count + ')';

  let fileRows = '';
  for (let i = 0; i < files.length; i++) {
    const f    = files[i];
    const size = f.size < 1024       ? f.size + ' B'
               : f.size < 1048576    ? Math.round(f.size / 1024) + ' KB'
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
    ${emailHeader_('#0d6b6e', 'ملفات جديدة من العميل', clientName + ' — ' + count + ' ملف(ات) جديدة')}
    <div style="background:#ffffff;padding:24px 20px;border:1px solid #e8edf2;border-top:none;">

      <p style="font-size:14px;color:#4a5568;margin:0 0 16px 0;line-height:1.8;">
        مرحباً <strong>${employeeName}</strong>، رفع العميل <strong>${clientName}</strong> الملفات التالية في مجلد الرفع:
      </p>

      <div style="border-radius:8px;overflow:hidden;border:1px solid #e8edf2;margin-bottom:18px;box-shadow:0 1px 4px rgba(0,0,0,0.06);">
        <table style="width:100%;border-collapse:collapse;">
          <tr style="background:#f5f7fa;">
            <th style="padding:10px 12px;text-align:right;font-size:12px;color:#718096;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">اسم الملف</th>
            <th style="padding:10px 12px;text-align:center;font-size:12px;color:#718096;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">الحجم</th>
          </tr>
          ${fileRows}
        </table>
      </div>

      <a href="${uploadsUrl}" style="display:inline-block;background:#f59e0b;color:#ffffff;padding:12px 28px;border-radius:6px;text-decoration:none;font-size:14px;font-weight:700;">
        افتح مجلد الرفع ←
      </a>

    </div>
    ${emailFooter_()}`;

  GmailApp.sendEmail(employeeEmail, subject, '', { htmlBody: emailWrapper_(content), charset: 'UTF-8' });
}
