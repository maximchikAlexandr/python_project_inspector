export const COMMIT_DATE_FORMAT = "YYYY-MM-DD HH:mm";

export function formatCommitDate(timestamp: string | number | Date | null | undefined): string | null {
  if (timestamp === null || timestamp === undefined || timestamp === "") {
    return null;
  }
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return formatLocal(date);
}

function formatLocal(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const h = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${d} ${h}:${min}`;
}
