/** Pure, no I/O: `now` is a parameter so this is trivially testable. */
export function formatCountdown(targetIso: string, now: number = Date.now()): string {
  const diffMs = new Date(targetIso).getTime() - now;
  if (diffMs <= 0) return "00:00";

  const totalSeconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
