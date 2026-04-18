// ============================================================
// 05_Emails.gs
// Email notification functions
// ============================================================

// -- Shared email building blocks -----------------------------

function emailHeader_(bgColor, title, subtitle) {
  return `
    <div style="background:${bgColor};border-radius:10px 10px 0 0;padding:24px 20px;text-align:center;">
      <h2 style="color:#ffffff;margin:0;font-size:20px;line-height:1.4;">${title}</h2>
      ${subtitle ? `<p style="color:rgba(255,255,255,0.8);margin:8px 0 0 0;font-size:14px;line-height:1.5;">${subtitle}</p>` : ''}
    </div>`;
}

function emailFooter_() {
  return `
    <div style="background:#f0f0f0;border-radius:0 0 10px 10px;padding:14px 20px;text-align:center;border:1px solid #e0e0e0;border-top:none;">
      <p style="font-size:12px;color:#999999;margin:0;">
        تم الارسال تلقائياً -
        <a href="${COMPANY_URL}" style="color:#999999;text-decoration:underline;">${COMPANY_NAME}</a>
      </p>
    </div>`;
}

function folderCard_(borderColor, bgColor, badgeBg, badgeText, folderName, description, url, btnLabel) {
  return `
    <div style="border:2px solid ${borderColor};border-radius:10px;padding:20px;margin-bottom:16px;background:${bgColor};box-sizing:border-box;">
      <div style="background:${badgeBg};display:inline-block;padding:4px 14px;border-radius:20px;margin-bottom:12px;">
        <span style="color:#ffffff;font-size:13px;font-weight:bold;">${badgeText}</span>
      </div>
      <p style="font-size:14px;color:#333333;margin:0 0 6px 0;font-weight:bold;">${folderName}</p>
      <p style="font-size:13px;color:#666666;margin:0 0 16px 0;line-height:1.7;">${description}</p>
      <a href="${url}" style="display:block;width:100%;box-sizing:border-box;text-align:center;background:${badgeBg};color:#ffffff;padding:14px;border-radius:8px;text-decoration:none;font-size:15px;font-weight:bold;">
        ${btnLabel}
      </a>
    </div>`;
}

// -- sendEmailToEmployee --------------------------------------

function sendEmailToEmployee(employeeEmail, employeeName, clientName, clientEmail, clientRow, uploadsUrl, resultsUrl, stageUrl) {
  const subject     = 'تم تعيينك على العميل: ' + clientName;
  const clientPhone = clientRow[3] || 'غير متوفر';
  const taxNumber   = clientRow[4] || 'غير متوفر';
  const uniqueNum   = clientRow[5] || 'غير متوفر';

  const htmlBody = `
    <div style="font-family:Arial,sans-serif;direction:rtl;width:100%;max-width:600px;margin:0 auto;background:#f9f9f9;padding:12px;box-sizing:border-box;">

      ${emailHeader_('#0d6b6e', 'مهمة جديدة بانتظارك', `مرحباً ${employeeName}، تم تعيينك على العميل ${clientName}`)}

      <div style="background:#ffffff;padding:24px 20px;border:1px solid #e0e0e0;border-top:none;box-sizing:border-box;">

        <div style="background:#f0f7ff;border-radius:10px;padding:20px;margin-bottom:16px;border:1px solid #d0e8ff;box-sizing:border-box;">
          <p style="margin:0 0 12px 0;font-size:14px;color:#1a73e8;font-weight:bold;">بيانات العميل</p>
          <table style="width:100%;font-size:13px;color:#333333;border-collapse:collapse;">
            <tr><td style="padding:8px 0;color:#888888;width:35%;vertical-align:top;">الاسم</td><td style="font-weight:bold;word-break:break-word;">${clientName}</td></tr>
            <tr><td style="padding:8px 0;color:#888888;vertical-align:top;">الايميل</td><td style="word-break:break-word;">${clientEmail || 'غير متوفر'}</td></tr>
            <tr><td style="padding:8px 0;color:#888888;vertical-align:top;">الهاتف</td><td>${clientPhone}</td></tr>
            <tr><td style="padding:8px 0;color:#888888;vertical-align:top;">الرقم الضريبي</td><td>${taxNumber}</td></tr>
            <tr><td style="padding:8px 0;color:#888888;vertical-align:top;">الرقم المميز</td><td>${uniqueNum}</td></tr>
          </table>
        </div>

        ${folderCard_('#f59e0b', '#fffdf5', '#f59e0b', 'مجلد الرفع — قراءة وتعديل', 'uploads',
          'هذا المجلد يرفع فيه العميل مستنداته.<br>يمكنك مراجعة وتعديل الملفات داخله.',
          uploadsUrl, 'افتح مجلد الرفع')}

        ${folderCard_('#8b5cf6', '#faf5ff', '#8b5cf6', 'مجلد العمل — قراءة وتعديل', 'stage',
          'هذا مجلد العمل الخاص بك لهذا العميل.<br>منظم بالسنوات والأشهر والأيام لسهولة الأرشفة.',
          stageUrl, 'افتح مجلد العمل')}

        ${folderCard_('#22c55e', '#f6fef9', '#22c55e', 'مجلد النتائج — قراءة وتعديل', 'results',
          'هذا المجلد تضع فيه النتائج والتقارير النهائية للعميل.<br>العميل يملك صلاحية قراءة هذا المجلد فقط.',
          resultsUrl, 'افتح مجلد النتائج')}

      </div>

      ${emailFooter_()}

    </div>`;

  GmailApp.sendEmail(employeeEmail, subject, '', { htmlBody: htmlBody, charset: 'UTF-8' });
}

// -- sendEmailToClient ----------------------------------------

function sendEmailToClient(clientEmail, clientName, employeeData, uploadsUrl, resultsUrl) {
  const subject  = 'تم تجهيز ملفاتك - ' + clientName;
  const empName  = employeeData ? employeeData.name  : 'غير متوفر';
  const empEmail = employeeData ? employeeData.email : 'غير متوفر';
  const empPhone = employeeData ? employeeData.phone : 'غير متوفر';

  const htmlBody = `
    <div style="font-family:Arial,sans-serif;direction:rtl;width:100%;max-width:600px;margin:0 auto;background:#f9f9f9;padding:12px;box-sizing:border-box;">

      ${emailHeader_('#1a73e8', 'تم تجهيز ملفاتك بنجاح', `عزيزي ${clientName}، يمكنك الآن الوصول إلى مجلديك الخاصين`)}

      <div style="background:#ffffff;padding:24px 20px;border:1px solid #e0e0e0;border-top:none;box-sizing:border-box;">

        ${folderCard_('#f59e0b', '#fffdf5', '#f59e0b', 'مجلد رفع الملفات', 'uploads',
          'هذا المجلد مخصص لرفع مستنداتك وملفاتك المطلوبة.',
          uploadsUrl, 'افتح مجلد الرفع')}

        ${folderCard_('#22c55e', '#f6fef9', '#22c55e', 'مجلد النتائج والتقارير', 'results',
          'ستجد هنا النتائج والتقارير التي يضعها الموظف المسؤول عنك.',
          resultsUrl, 'افتح مجلد النتائج')}

        <div style="background:#f0f7ff;border-radius:10px;padding:20px;border:1px solid #d0e8ff;box-sizing:border-box;">
          <p style="margin:0 0 12px 0;font-size:14px;color:#1a73e8;font-weight:bold;">الموظف المسؤول عنك</p>
          <table style="width:100%;font-size:13px;color:#333333;border-collapse:collapse;">
            <tr><td style="padding:8px 0;color:#888888;width:35%;vertical-align:top;">الاسم</td><td style="font-weight:bold;word-break:break-word;">${empName}</td></tr>
            <tr><td style="padding:8px 0;color:#888888;vertical-align:top;">الايميل</td><td style="word-break:break-word;">${empEmail}</td></tr>
            <tr><td style="padding:8px 0;color:#888888;vertical-align:top;">الهاتف</td><td>${empPhone || 'غير متوفر'}</td></tr>
          </table>
        </div>

      </div>

      ${emailFooter_()}

    </div>`;

  GmailApp.sendEmail(clientEmail, subject, '', { htmlBody: htmlBody, charset: 'UTF-8' });
}

// -- sendCalendarNotification ---------------------------------

function sendCalendarNotification(employeeEmail, title, eventDate, description) {
  if (!employeeEmail) return;

  const dateStr = Utilities.formatDate(eventDate, Session.getScriptTimeZone(), 'dd/MM/yyyy');
  const subject = 'تذكير: ' + title;

  const htmlBody = `
    <div style="font-family:Arial,sans-serif;direction:rtl;width:100%;max-width:600px;margin:0 auto;background:#f9f9f9;padding:12px;box-sizing:border-box;">

      ${emailHeader_('#0d6b6e', 'تذكير بموعد هام', title)}

      <div style="background:#ffffff;padding:24px 20px;border:1px solid #e0e0e0;border-top:none;box-sizing:border-box;">
        <table style="width:100%;font-size:14px;color:#333333;border-collapse:collapse;">
          <tr>
            <td style="padding:10px 0;color:#888888;width:35%;vertical-align:top;">الحدث</td>
            <td style="font-weight:bold;word-break:break-word;">${title}</td>
          </tr>
          <tr>
            <td style="padding:10px 0;color:#888888;vertical-align:top;">التاريخ</td>
            <td style="font-weight:bold;color:#0d6b6e;font-size:16px;">${dateStr}</td>
          </tr>
          <tr>
            <td style="padding:10px 0;color:#888888;vertical-align:top;">التفاصيل</td>
            <td style="line-height:1.7;word-break:break-word;">${(description || '—').replace(/\n/g, '<br>')}</td>
          </tr>
        </table>
      </div>

      ${emailFooter_()}

    </div>`;

  GmailApp.sendEmail(employeeEmail, subject, '', { htmlBody: htmlBody, charset: 'UTF-8' });
}
