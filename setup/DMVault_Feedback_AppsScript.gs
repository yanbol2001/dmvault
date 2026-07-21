const SHEET_NAME = '回報紀錄';
const HEADERS = ['收到時間','類型','內容','聯絡方式','作品','頁面','版本','網址','PWA','網路狀態','視窗大小','平台','瀏覽器','語言','回報建立時間','回報 ID','處理狀態','備註'];

function doPost(e) {
  try {
    const data = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const d = data.diagnostics || {};
    const sheet = getSheet_();
    sheet.appendRow([
      new Date(), data.type || '', data.message || '', data.contact || '',
      d.project || '', d.page || '', d.version || '', d.url || '',
      d.pwa === true ? '是' : '否', d.online === true ? '線上' : '離線',
      d.viewport || '', d.platform || '', d.userAgent || '', d.language || '',
      data.createdAt || '', data.id || '', '未處理', ''
    ]);
    return json_({ok:true});
  } catch (error) {
    return json_({ok:false,error:String(error)});
  }
}

function doGet() {
  return json_({ok:true,service:'DMVault Feedback v1'});
}

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1,1,1,HEADERS.length).setValues([HEADERS]);
    sheet.setFrozenRows(1);
    sheet.getRange(1,1,1,HEADERS.length).setFontWeight('bold');
  }
  return sheet;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
