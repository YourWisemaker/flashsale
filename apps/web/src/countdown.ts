export interface CountdownParts {
  hours: string;
  minutes: string;
  seconds: string;
}

/** Pure, no I/O: `now` is a parameter so this is trivially testable. Hours don't wrap at 24. */
export function countdownParts(targetIso: string, now: number = Date.now()): CountdownParts {
  const totalSeconds = Math.max(0, Math.floor((new Date(targetIso).getTime() - now) / 1000));
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    hours: pad(Math.floor(totalSeconds / 3600)),
    minutes: pad(Math.floor((totalSeconds % 3600) / 60)),
    seconds: pad(totalSeconds % 60),
  };
}
