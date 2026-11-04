// Lenis supplies normalized deltas but also repeats the last delta on touchend.
// Keep lifecycle tracking separate from movement so release never adds travel.
export function createTouchGestureGate() {
 let multiTouch = false, orbitId = null, orbitX = 0;
 function trackedTouch(touches) {
  for (let i = 0; i < touches.length; i++) if (touches[i].identifier === orbitId) return touches[i];
  return null;
 }
 function update(event) {
  if (!['touchstart','touchend','touchcancel'].includes(event.type)) return;
  const touches = event.touches || [];
  if (touches.length > 1) multiTouch = true;
  if (!touches.length) {
   multiTouch = false; orbitId = null; orbitX = 0;
   return;
  }
  // Rebase when fingers join or leave, including a change of leading finger.
  const touch = trackedTouch(touches) || touches[0];
  orbitId = touch.identifier; orbitX = touch.clientX;
 }
 function shouldZoom(event) {
  if (!event.type.startsWith('touch')) return true;
  return event.type === 'touchmove' && event.touches?.length === 1 && !multiTouch;
 }
 function orbitDelta(event) {
  const touches = event.touches || [];
  if (event.type !== 'touchmove' || touches.length < 2) return 0;
  const tracked = trackedTouch(touches), touch = tracked || touches[0];
  const delta = tracked ? touch.clientX - orbitX : 0;
  orbitId = touch.identifier; orbitX = touch.clientX;
  return Number.isFinite(delta) ? delta : 0;
 }
 return {update,shouldZoom,orbitDelta};
}
