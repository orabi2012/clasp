// ============================================================
// 03_Main.gs
// Main workflow
// ============================================================



function onEmployeeAssigned(e) {
  const sheet = e.source.getActiveSheet();
  if (sheet.getName() !== CUSTOMERS_SHEET_NAME) return;

  const editedCol = e.range.getColumn();
  const editedRow = e.range.getRow();
  if (editedRow <= 1 || editedCol !== COL_EMPLOYEE) return;

  const rowData      = sheet.getRange(editedRow, 1, 1, COL_PREV_EMPLOYEE).getValues()[0];
  const newEmployee  = rowData[COL_EMPLOYEE      - 1];
  const prevEmployee = rowData[COL_PREV_EMPLOYEE - 1];
  const existingID   = rowData[COL_FOLDER_ID     - 1];
  const clientName   = rowData[COL_NAME          - 1];
  const clientEmail  = rowData[COL_EMAIL         - 1];

  // ── un-assign: الموظف اتمسح ──
  if (!newEmployee) {
    if (prevEmployee) {
      const prevEmail = getEmployeeEmail(prevEmployee, e.source);

      if (prevEmail && existingID) {
        try { removeEmployeePermissions(existingID, prevEmail); } catch (err) {
          Logger.log('تحذير سحب صلاحيات: ' + err.message);
        }
      }

      try { removeClientShortcutFromEmployee(prevEmployee, clientName); } catch (err) {
        Logger.log('تحذير حذف shortcut: ' + err.message);
      }

      sheet.getRange(editedRow, COL_PREV_EMPLOYEE).setValue('');
      SpreadsheetApp.flush();

      Logger.log('تم إلغاء تعيين ' + prevEmployee + ' عن العميل: ' + clientName);
    }
    return;
  }

  // ── 1. جلب إيميل الموظف الجديد ──
  const newEmployeeEmail = getEmployeeEmail(newEmployee, e.source);
  if (!newEmployeeEmail) {
    SpreadsheetApp.getUi().alert('لم يُعثر على إيميل الموظف: ' + newEmployee);
    return;
  }

  let folderId  = existingID;
  let folderUrl = rowData[COL_FOLDER_URL - 1];

  // ── 2. إنشاء مجلد العميل لو مش موجود ──
  if (!folderId) {
    try {
      const result = createClientFolder(clientName, clientEmail);
      folderId  = result.folderId;
      folderUrl = result.folderUrl;
      sheet.getRange(editedRow, COL_FOLDER_URL).setValue(folderUrl);
      sheet.getRange(editedRow, COL_FOLDER_ID).setValue(folderId);
      SpreadsheetApp.flush();
    } catch (err) {
      Logger.log('خطأ في إنشاء المجلد: ' + err.message);
      SpreadsheetApp.getUi().alert('خطأ في إنشاء المجلد: ' + err.message);
      return;
    }
  }

  // ── 3. سحب صلاحيات الموظف القديم + حذف shortcut ──
  if (prevEmployee && prevEmployee !== newEmployee) {
    const prevEmail = getEmployeeEmail(prevEmployee, e.source);

    if (prevEmail) {
      try { removeEmployeePermissions(folderId, prevEmail); } catch (err) {
        Logger.log('تحذير سحب صلاحيات: ' + err.message);
      }
    }

    try { removeClientShortcutFromEmployee(prevEmployee, clientName); } catch (err) {
      Logger.log('تحذير حذف shortcut: ' + err.message);
    }
  }

  // ── 4. منح صلاحيات الموظف الجديد ──
  try {
    assignEmployeePermissions(folderId, newEmployeeEmail);
  } catch (err) {
    Logger.log('تحذير منح صلاحيات: ' + err.message);
  }

  // ── 5. جلب روابط المجلدات الفرعية ──
  const clientFolder = DriveApp.getFolderById(folderId);

  const uploadsUrl = clientFolder.getFoldersByName('uploads').hasNext()
    ? clientFolder.getFoldersByName('uploads').next().getUrl()
    : folderUrl;

  const resultsUrl = clientFolder.getFoldersByName('results').hasNext()
    ? clientFolder.getFoldersByName('results').next().getUrl()
    : folderUrl;

  const stageUrl = clientFolder.getFoldersByName('stage').hasNext()
    ? clientFolder.getFoldersByName('stage').next().getUrl()
    : folderUrl;

  const employeeData = getEmployeeData(newEmployee, e.source);

  // ── 6. إرسال الإيميلات ──
  try {
    sendEmailToEmployee(
      newEmployeeEmail,
      newEmployee,
      clientName,
      clientEmail,
      rowData,
      uploadsUrl,
      resultsUrl,
      stageUrl
    );
    if (clientEmail) {
      sendEmailToClient(clientEmail, clientName, employeeData, uploadsUrl, resultsUrl);
    }
  } catch (err) {
    Logger.log('تحذير إرسال إيميل: ' + err.message);
  }

  // ── 7. إنشاء Calendar events ──
  try {
    const zakatDate = rowData[COL_DATE_ZAKAT - 1]; // I
    const taxDate   = rowData[COL_DATE_TAX   - 1]; // J

    createOrUpdateClientEvents(
      clientName,
      clientEmail,
      newEmployeeEmail,
      zakatDate,
      taxDate,
      folderUrl
    );
  } catch (err) {
    Logger.log('تحذير Calendar: ' + err.message);
  }

  // ── 8. إضافة shortcut في مجلد الموظف الجديد ──
  try {
    addClientShortcutToEmployee(newEmployee, newEmployeeEmail, folderId, clientName, e.source);
  } catch (err) {
    Logger.log('تحذير إضافة shortcut: ' + err.message);
  }

  // ── 9. حفظ prev_employee ──
  sheet.getRange(editedRow, COL_PREV_EMPLOYEE).setValue(newEmployee);
  SpreadsheetApp.flush();

  Logger.log('تم تعيين ' + newEmployee + ' على العميل: ' + clientName);
}

function sendEmailToEmployee(employeeEmail, employeeName, clientName, clientEmail, clientRow, uploadsUrl, resultsUrl, stageUrl) {
  const subject     = 'تم تعيينك على العميل: ' + clientName;
  const clientPhone = clientRow[3] || 'غير متوفر';
  const taxNumber   = clientRow[4] || 'غير متوفر';
  const uniqueNum   = clientRow[5] || 'غير متوفر';

  const htmlBody = `
    <div style="font-family:Arial,sans-serif;direction:rtl;max-width:600px;margin:auto;background:#f9f9f9;padding:20px;">

      <!-- Header -->
      <div style="background:#0d6b6e;border-radius:10px 10px 0 0;padding:28px 32px;text-align:center;">
        <h2 style="color:white;margin:0;font-size:22px;">مهمة جديدة بانتظارك</h2>
        <p style="color:#b2dfdf;margin:8px 0 0 0;font-size:14px;">مرحباً ${employeeName}، تم تعيينك على العميل ${clientName}</p>
      </div>

      <!-- Body -->
      <div style="background:#ffffff;padding:28px 32px;border:1px solid #e0e0e0;border-top:none;">

        <!-- بيانات العميل -->
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

        <!-- uploads -->
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

        <!-- stage -->
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

        <!-- results -->
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

      <!-- Footer -->
      <div style="background:#f0f0f0;border-radius:0 0 10px 10px;padding:14px 32px;text-align:center;border:1px solid #e0e0e0;border-top:none;">
        <p style="font-size:12px;color:#999999;margin:0;">تم الارسال تلقائياً - نظام ادارة العملاء</p>
      </div>

    </div>`;

  GmailApp.sendEmail(employeeEmail, subject, '', { htmlBody: htmlBody, charset: 'UTF-8' });
}

function sendEmailToClient(clientEmail, clientName, employeeData, uploadsUrl, resultsUrl) {
  const subject = 'تم تجهيز ملفاتك - ' + clientName;
  const empName = employeeData ? employeeData.name : 'غير متوفر';
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

// ضيف دي في 03_Main.gs بعد onEmployeeAssigned مباشرة

function onDateChanged(e) {
  const sheet = e.source.getActiveSheet();
  if (sheet.getName() !== CUSTOMERS_SHEET_NAME) return;

  const editedCol = e.range.getColumn();
  const editedRow = e.range.getRow();

  if (editedRow <= 1) return;
  if (editedCol !== COL_DATE_ZAKAT && editedCol !== COL_DATE_TAX) return;

  const rowData       = sheet.getRange(editedRow, 1, 1, COL_PREV_EMPLOYEE).getValues()[0];
  const clientName    = rowData[COL_NAME          - 1];
  const clientEmail   = rowData[COL_EMAIL         - 1];
  const employee      = rowData[COL_PREV_EMPLOYEE - 1];
  const folderUrl     = rowData[COL_FOLDER_URL    - 1];

  if (!employee) return;

  const employeeEmail = getEmployeeEmail(employee, e.source);
  const zakatDate     = rowData[COL_DATE_ZAKAT - 1]; // I
  const taxDate       = rowData[COL_DATE_TAX   - 1]; // J

  try {
    createOrUpdateClientEvents(
      clientName,
      clientEmail,
      employeeEmail,
      zakatDate,
      taxDate,
      folderUrl
    );
    Logger.log('تم تحديث Calendar للعميل: ' + clientName);
  } catch (err) {
    Logger.log('تحذير Calendar: ' + err.message);
  }
}