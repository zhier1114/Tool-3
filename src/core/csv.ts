import { activeEntries, type VaultData } from './model';

export const CSV_HEADERS = ['標題', '網站', '帳號', '密碼', '備註', '標籤', '更新日期'];

function cell(value: string): string {
  return /[",\r\n]|^\s|\s$/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** 匯出垃圾桶以外的項目。開頭加 BOM，讓 Excel 正確辨識 UTF-8。 */
export function exportCsv(data: VaultData): string {
  const rows = activeEntries(data).map((e) => [
    e.title, e.url, e.username, e.password, e.notes, e.tags.join(';'), e.updatedAt,
  ]);
  return '\uFEFF' + [CSV_HEADERS, ...rows].map((r) => r.map(cell).join(',') + '\r\n').join('');
}
