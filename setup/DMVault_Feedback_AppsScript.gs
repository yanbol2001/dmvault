const SHEET_NAME = '回報紀錄';
const SERVICE_VERSION = 'DMVault Feedback v1.3';
const MAX_MESSAGE_LENGTH = 2000;
const MAX_CONTACT_LENGTH = 150;
const HEADERS = [
  '收到時間','回報 ID','處理狀態','類型','內容','聯絡方式',
  '作品','頁面','版本','網址','PWA','網路狀態','視窗大小',
  '平台','瀏覽器','語言','回報建立時間','備註'
];

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    const data = parsePayload_(e);
    validatePayload_(data);

    const sheet = getSheet_();
    if (feedbackExists_(sheet, data.id)) {
      return json_({ ok: true, duplicate: true, id: data.id });
    }

    const d = data.diagnostics || {};
    sheet.appendRow([
      new Date(),
      safeText_(data.id, 80),
      '未處理',
      safeText_(data.type, 50),
      safeText_(data.message, MAX_MESSAGE_LENGTH),
      safeText_(data.contact, MAX_CONTACT_LENGTH),
      safeText_(d.project, 100),
      safeText_(d.page, 150),
      safeText_(d.version, 80),
      safeUrl_(d.url),
      d.pwa === true ? '是' : '否',
      d.online === true ? '線上' : '離線',
      safeText_(d.viewport, 40),
      safeText_(d.platform, 100),
      safeText_(d.userAgent, 500),
      safeText_(d.language, 30),
      safeText_(data.createdAt, 60),
      ''
    ]);

    CacheService.getScriptCache().put('feedback:' + data.id, '1', 21600);
    return json_({ ok: true, duplicate: false, id: data.id });
  } catch (error) {
    return json_({ ok: false, error: String(error && error.message ? error.message : error) });
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
}

function doGet() {
  return json_({ ok: true, service: SERVICE_VERSION });
}

function parsePayload_(e) {
  const raw = (e && e.postData && e.postData.contents) || '{}';
  if (raw.length > 15000) throw new Error('Payload too large');
  return JSON.parse(raw);
}

function validatePayload_(data) {
  if (!data || typeof data !== 'object') throw new Error('Invalid payload');
  if (!/^FB-\d{8}-[A-Z0-9]{4,12}$/.test(String(data.id || ''))) throw new Error('Invalid feedback ID');
  const type = String(data.type || '').trim();
  const message = String(data.message || '').trim();
  if (!type) throw new Error('Missing type');
  if (message.length < 5) throw new Error('Message too short');
  if (message.length > MAX_MESSAGE_LENGTH) throw new Error('Message too long');
}

function feedbackExists_(sheet, id) {
  const cache = CacheService.getScriptCache();
  if (cache.get('feedback:' + id)) return true;
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return false;
  const finder = sheet.getRange(2, 2, lastRow - 1, 1)
    .createTextFinder(String(id))
    .matchEntireCell(true)
    .findNext();
  return !!finder;
}

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);

  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
    sheet.getRange('A:A').setNumberFormat('yyyy/mm/dd hh:mm:ss');
    sheet.autoResizeColumns(1, HEADERS.length);
  } else {
    const currentHeaders = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), HEADERS.length)).getValues()[0];
    if (currentHeaders[1] !== '回報 ID') {
      throw new Error('舊版欄位順序不同，請新增一個空白試算表或清空「回報紀錄」工作表後重新測試。');
    }
  }
  return sheet;
}

function safeText_(value, maxLength) {
  let text = String(value == null ? '' : value).trim().slice(0, maxLength);
  if (/^[=+\-@]/.test(text)) text = "'" + text;
  return text;
}

function safeUrl_(value) {
  const text = safeText_(value, 1000);
  return /^https?:\/\//i.test(text) ? text : '';
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
