export const TREND_RESULT_HOLD_HOURS = 24;
export const TREND_RESULT_HOLD_MS = TREND_RESULT_HOLD_HOURS * 60 * 60 * 1000;

export type TrendTiming = {
  deadline_at?: string | null;
};

export function trendHoldCutoffIso(now = new Date()) {
  return new Date(now.getTime() - TREND_RESULT_HOLD_MS).toISOString();
}

export function isTrendClosed(trend?: TrendTiming | null, now = new Date()) {
  if (!trend?.deadline_at) return false;
  const deadline = new Date(trend.deadline_at).getTime();
  return Number.isFinite(deadline) && deadline <= now.getTime();
}

export function isTrendVisibleInResultWindow(trend?: TrendTiming | null, now = new Date()) {
  if (!trend?.deadline_at) return true;
  const deadline = new Date(trend.deadline_at).getTime();
  if (!Number.isFinite(deadline)) return true;
  return deadline > now.getTime() - TREND_RESULT_HOLD_MS;
}
