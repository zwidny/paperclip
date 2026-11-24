import { t } from "../i18n";

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const MONTH = 30 * DAY;

export function timeAgo(date: Date | string, now: number = Date.now()): string {
  const then = new Date(date).getTime();
  const seconds = Math.round((now - then) / 1000);

  if (seconds < MINUTE) return t("relativeTime.justNow", { defaultValue: "just now" });
  if (seconds < HOUR) {
    const m = Math.floor(seconds / MINUTE);
    return t("relativeTime.minutesAgo", { value: m, defaultValue: `${m}m ago` });
  }
  if (seconds < DAY) {
    const h = Math.floor(seconds / HOUR);
    return t("relativeTime.hoursAgo", { value: h, defaultValue: `${h}h ago` });
  }
  if (seconds < WEEK) {
    const d = Math.floor(seconds / DAY);
    return t("relativeTime.daysAgo", { value: d, defaultValue: `${d}d ago` });
  }
  if (seconds < MONTH) {
    const w = Math.floor(seconds / WEEK);
    return t("relativeTime.weeksAgo", { value: w, defaultValue: `${w}w ago` });
  }
  const mo = Math.floor(seconds / MONTH);
  return t("relativeTime.monthsAgo", { value: mo, defaultValue: `${mo}mo ago` });
}
