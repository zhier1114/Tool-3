const pad = (n: number) => String(n).padStart(2, '0');

/** 本地時間 YYYY/MM/DD */
export function formatDay(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
}

/** 本地時間 YYYY/MM/DD HH:mm */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${formatDay(iso)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
