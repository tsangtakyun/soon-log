import { ScheduleType } from '@/types';

export const scheduleTypes: Record<ScheduleType, { label: string; color: string; short: string }> = {
  shoot: { label: '🎬 拍攝', color: '#E8614A', short: '🎬' },
  meeting: { label: '🤝 會議', color: '#7c3aed', short: '🤝' },
  deadline: { label: '⚡ 截止', color: '#CC4444', short: '⚡' },
  publish: { label: '📢 發布', color: '#4ACC7A', short: '📢' },
  other: { label: '📌 其他', color: '#888880', short: '📌' }
};

export function formatScheduleTime(value: string) {
  return new Intl.DateTimeFormat('zh-HK', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value));
}

export function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

export function endOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
}

export function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function startOfWeek(date: Date) {
  const next = startOfDay(date);
  const day = next.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  next.setDate(next.getDate() + mondayOffset);
  return next;
}
