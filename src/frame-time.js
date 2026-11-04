// Camera springs are analytic and consume actual elapsed time. Decorative
// simulation stays capped so a stalled frame cannot advance a stellar event.
export function createFrameClock(initial = null) {
 let last = Number.isFinite(initial) ? initial : null;
 return {
  reset() {last = null;},
  step(now) {
   if (!Number.isFinite(now)) return {elapsed:0, decorative:0};
   const elapsed = last === null ? 0 : Math.max(0, (now-last)/1000);
   last = now;
   return {elapsed, decorative:Math.min(elapsed,.15)};
  },
 };
}
