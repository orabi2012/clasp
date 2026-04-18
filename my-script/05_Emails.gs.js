// ============================================================
// 05_Emails.gs
// Email notification functions
// ============================================================

function sendEmailToEmployee(employeeEmail, employeeName, clientName, clientEmail, clientRow, uploadsUrl, resultsUrl, stageUrl) {
  const subject     = 'تم تعيينك على العميل: ' + clientName;
  const clientPhone = clientRow[3] || 'غير متوفر';
  const taxNumber   = clientRow[4] || 'غير متوفر';
  const uniqueNum   = clientRow[5] || 'غير متوفر';

  const htmlBody = `
    <div style="font-family:Arial,sans-serif;direction:rtl;max-width:600px;margin:auto;background:#f9f9f9;padding:20px;">

      <div style="background:#0d6b6e;border-radius:10px 10px 0 0;padding:28px 32px;text-align:center;">
        <h2 style="color:white;margin:0;font-size:22px;">مهمة جديدة بانتظارك</h2>
        <p style="color:#b2dfdf;margin:8px 0 0 0;font-size:14px;">مرحباً ${employeeName}، تم تعيينك على العميل ${clientName}</p>
      </div>

      <div style="background:#ffffff;padding:28px 32px;border:1px solid #e0e0e0;border-top:none;">

        <div style="background:#f0f7ff;border-radius:10px;padding:20px;margin-bottom:16px;border:1px solid #d0e8ff;">
          <p style="margin:0 0 12px 0;font-size:14px;color:#1a73e8;font-weight:bold;">بيانات العميل</p>
          <table style="width:100%;font-size:13px;color:#333333;border-collapse:collapse;">
            <tr><td style="padding:6px 0;color:#888888;width:120px;">الاسم</td><td style="font-weight:bold;">${clientName}</td></tr>
            <tr><td style="padding:6px 0;color:#888888;">الايميل</td><td>${clientEmail || 'غير متوفر'}</td></tr>
            <tr><td style="padding:6px 0;color:#888888;">الهاتف</td><td>${clientPhone}</td></tr>
            <tr><td style="padding:6px 0;color:#888888;">الرقم الضريبي</td><td>${taxNumber}</td></tr>
            <tr><td style="padding:6px 0;color:#888888;">الرقم المميز</td><td>${uniqueNum}</td></tr>
          </table>
        </div>

        <div style="border:2px solid #f59e0b;border-radius:10px;padding:20px;margin-bottom:16px;background:#fffdf5;">
          <div style="background:#f59e0b;display:inline-block;padding:4px 14px;border-radius:20px;margin-bottom:12px;">
            <span style="color:white;font-size:13px;font-weight:bold;">مجلد الرفع — قراءة وتعديل</span>
          </div>
          <p style="font-size:14px;color:#333333;margin:0 0 6px 0;font-weight:bold;">uploads</p>
          <p style="font-size:13px;color:#666666;margin:0 0 16px 0;line-height:1.7;">
            هذا المجلد يرفع فيه العميل مستنداته.<br>
            يمكنك مراجعة وتعديل الملفات داخله.
          </p>
          <a href="${uploadsUrl}" style="display:block;text-align:center;background:#f59e0b;color:#ffffff;padding:12px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:bold;">
            افتح مجلد الرفع
          </a>
        </div>

        <div style="border:2px solid #8b5cf6;border-radius:10px;padding:20px;margin-bottom:16px;background:#faf5ff;">
          <div style="background:#8b5cf6;display:inline-block;padding:4px 14px;border-radius:20px;margin-bottom:12px;">
            <span style="color:white;font-size:13px;font-weight:bold;">مجلد العمل — قراءة وتعديل</span>
          </div>
          <p style="font-size:14px;color:#333333;margin:0 0 6px 0;font-weight:bold;">stage</p>
          <p style="font-size:13px;color:#666666;margin:0 0 16px 0;line-height:1.7;">
            هذا مجلد العمل الخاص بك لهذا العميل.<br>
            منظم بالسنوات والأشهر والأيام لسهولة الأرشفة.
          </p>
          <a href="${stageUrl}" style="display:block;text-align:center;background:#8b5cf6;color:#ffffff;padding:12px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:bold;">
            افتح مجلد العمل
          </a>
        </div>

        <div style="border:2px solid #22c55e;border-radius:10px;padding:20px;margin-bottom:16px;background:#f6fef9;">
          <div style="background:#22c55e;display:inline-block;padding:4px 14px;border-radius:20px;margin-bottom:12px;">
            <span style="color:white;font-size:13px;font-weight:bold;">مجلد النتائج — قراءة وتعديل</span>
          </div>
          <p style="font-size:14px;color:#333333;margin:0 0 6px 0;font-weight:bold;">results</p>
          <p style="font-size:13px;color:#666666;margin:0 0 16px 0;line-height:1.7;">
            هذا المجلد تضع فيه النتائج والتقارير النهائية للعميل.<br>
            العميل يملك صلاحية قراءة هذا المجلد فقط.
          </p>
          <a href="${resultsUrl}" style="display:block;text-align:center;background:#22c55e;color:#ffffff;padding:12px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:bold;">
            افتح مجلد النتائج
          </a>
        </div>

      </div>

      <div style="background:#f0f0f0;border-radius:0 0 10px 10px;padding:14px 32px;text-align:center;border:1px solid #e0e0e0;border-top:none;">
        <p style="font-size:12px;color:#999999;margin:0;">تم الارسال تلقائياً - نظام ادارة العملاء</p>
      </div>

    </div>`;

  GmailApp.sendEmail(employeeEmail, subject, '', { htmlBody: htmlBody, charset: 'UTF-8' });
}

function sendEmailToClient(clientEmail, clientName, employeeData, uploadsUrl, resultsUrl) {
  const subject  = 'تم تجهيز ملفاتك - ' + clientName;
  const empName  = employeeData ? employeeData.name  : 'غير متوفر';
  const empEmail = employeeData ? employeeData.email : 'غير متوفر';
  const empPhone = employeeData ? employeeData.phone : 'غير متوفر';

  const htmlBody = `
    <div style="font-family:Arial,sans-serif;direction:rtl;max-width:600px;margin:auto;background:#f9f9f9;padding:20px;">

      <div style="background:#1a73e8;border-radius:10px 10px 0 0;padding:28px 32px;text-align:center;">
        <h2 style="color:white;margin:0;font-size:22px;">تم تجهيز ملفاتك بنجاح</h2>
        <p style="color:#cce4ff;margin:8px 0 0 0;font-size:14px;">عزيزي ${clientName}، يمكنك الآن الوصول إلى مجلديك الخاصين</p>
      </div>

      <div style="background:#ffffff;padding:28px 32px;border:1px solid #e0e0e0;border-top:none;">

        <div style="border:2px solid #f59e0b;border-radius:10px;padding:20px;margin-bottom:16px;background:#fffdf5;">
          <div style="background:#f59e0b;display:inline-block;padding:4px 14px;border-radius:20px;margin-bottom:12px;">
            <span style="color:white;font-size:13px;font-weight:bold;">مجلد رفع الملفات</span>
          </div>
          <p style="font-size:14px;color:#333333;margin:0 0 6px 0;font-weight:bold;">uploads</p>
          <p style="font-size:13px;color:#666666;margin:0 0 16px 0;line-height:1.7;">
            هذا المجلد مخصص لرفع مستنداتك وملفاتك المطلوبة.
          </p>
          <a href="${uploadsUrl}" style="display:block;text-align:center;background:#f59e0b;color:#ffffff;padding:12px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:bold;">
            افتح مجلد الرفع
          </a>
        </div>

        <div style="border:2px solid #22c55e;border-radius:10px;padding:20px;margin-bottom:16px;background:#f6fef9;">
          <div style="background:#22c55e;display:inline-block;padding:4px 14px;border-radius:20px;margin-bottom:12px;">
            <span style="color:white;font-size:13px;font-weight:bold;">مجلد النتائج والتقارير</span>
          </div>
          <p style="font-size:14px;color:#333333;margin:0 0 6px 0;font-weight:bold;">results</p>
          <p style="font-size:13px;color:#666666;margin:0 0 16px 0;line-height:1.7;">
            ستجد هنا النتائج والتقارير التي يضعها الموظف المسؤول عنك.
          </p>
          <a href="${resultsUrl}" style="display:block;text-align:center;background:#22c55e;color:#ffffff;padding:12px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:bold;">
            افتح مجلد النتائج
          </a>
        </div>

        <div style="background:#f0f7ff;border-radius:10px;padding:20px;border:1px solid #d0e8ff;">
          <p style="margin:0 0 12px 0;font-size:14px;color:#1a73e8;font-weight:bold;">الموظف المسؤول عنك</p>
          <table style="width:100%;font-size:13px;color:#333333;border-collapse:collapse;">
            <tr><td style="padding:6px 0;color:#888888;width:90px;">الاسم</td><td style="padding:6px 0;font-weight:bold;">${empName}</td></tr>
            <tr><td style="padding:6px 0;color:#888888;">الايميل</td><td style="padding:6px 0;">${empEmail}</td></tr>
            <tr><td style="padding:6px 0;color:#888888;">الهاتف</td><td style="padding:6px 0;">${empPhone || 'غير متوفر'}</td></tr>
          </table>
        </div>

      </div>

      <div style="background:#f0f0f0;border-radius:0 0 10px 10px;padding:14px 32px;text-align:center;border:1px solid #e0e0e0;border-top:none;">
        <p style="font-size:12px;color:#999999;margin:0;">تم الارسال تلقائياً - نظام ادارة العملاء</p>
      </div>

    </div>`;

  GmailApp.sendEmail(clientEmail, subject, '', { htmlBody: htmlBody, charset: 'UTF-8' });
}

function sendCalendarNotification(employeeEmail, title, eventDate, description) {
  if (!employeeEmail) return;

  const dateStr = Utilities.formatDate(eventDate, Session.getScriptTimeZone(), 'dd/MM/yyyy');
  const subject = '📅 تذكير: ' + title;

  const htmlBody = `
    <div style="font-family:Arial,sans-serif;direction:rtl;max-width:600px;margin:auto;background:#f9f9f9;padding:20px;">

      <div style="background:#0d6b6e;border-radius:10px 10px 0 0;padding:28px 32px;text-align:center;">
        <h2 style="color:white;margin:0;font-size:20px;">📅 تذكير بموعد هام</h2>
        <p style="color:#b2dfdf;margin:8px 0 0 0;font-size:14px;">${title}</p>
      </div>

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

      <div style="background:#f0f0f0;border-radius:0 0 10px 10px;padding:14px 32px;text-align:center;border:1px solid #e0e0e0;border-top:none;">
        <p style="font-size:12px;color:#999999;margin:0;">تم الإرسال تلقائياً - نظام إدارة العملاء</p>
      </div>

    </div>`;

  GmailApp.sendEmail(employeeEmail, subject, '', { htmlBody: htmlBody, charset: 'UTF-8' });
}
