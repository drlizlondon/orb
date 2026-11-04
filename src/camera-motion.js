const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const smoothstep = (min, max, value) => {
 const t = clamp((value - min) / (max - min), 0, 1);
 return t * t * (3 - 2 * t);
};

// One exact, critically damped response per camera parameter. Derive the final
// camera pose from state directly; another position/look lerp would add lag.
export function createCameraMotion(initial = {}) {
 const state = {
  progress:initial.progress ?? 0, focus:0, transition:1,
  yaw:initial.yaw ?? 0, tilt:initial.tilt ?? 0,
  fitDistance:initial.fitDistance ?? 20, compact:initial.compact ?? 0,
 };
 const targets = {...state};
 const channels = Object.keys(state).filter(key => key !== 'focus');
 const velocity = Object.fromEntries(channels.map(key => [key, 0]));
 const rates = {progress:12, transition:5.5, yaw:14, tilt:14, fitDistance:10, compact:10};
 let pendingPixels = 0, inputDirection = 0, reversePending = false, focusOrigin = 0;

 function flushInput() {
  if (!pendingPixels) return;
  // A genuine direction change replaces the unrendered tail of the previous
  // gesture. It never makes the camera continue outward against new input.
  if (reversePending) {
   targets.progress = state.progress;
   velocity.progress = 0;
  }
  targets.progress = clamp(targets.progress + pendingPixels / 2400, 0, 1);
  pendingPixels = 0;
  reversePending = false;
 }
 function settle() {
  flushInput();
  for (const key of channels) {
   state[key] = targets[key];
   velocity[key] = 0;
  }
  state.focus = targets.focus;
  focusOrigin = state.focus;
  return state;
 }
 function setProgress(value, immediate = false) {
  if (!Number.isFinite(value)) return;
  pendingPixels = 0; inputDirection = 0; reversePending = false;
  targets.progress = clamp(value, 0, 1);
  if (velocity.progress * (targets.progress - state.progress) < 0) velocity.progress = 0;
  if (immediate) {state.progress = targets.progress; velocity.progress = 0;}
 }
 function queueScroll(pixels) {
  if (!Number.isFinite(pixels) || pixels === 0) return;
  const direction = Math.sign(pixels);
  if (inputDirection && direction !== inputDirection) {
   pendingPixels = 0;
   reversePending = true;
  }
  inputDirection = direction;
  pendingPixels += pixels;
 }
 function setInspection(open, immediate = false) {
  if (open) {
   // Return to the framing actually visible at selection, not a wheel target
   // that was still approaching when the visitor chose a world.
   pendingPixels = 0; inputDirection = 0; reversePending = false;
   targets.progress = state.progress;
   velocity.progress = 0;
  }
  // The caller captures its actual camera and look pose here, then blends that
  // anchor to the new destination with state.transition. Resetting only the
  // blend allows another world to be selected during return without a jump.
  focusOrigin = state.focus;
  targets.focus = open ? 1 : 0;
  state.transition = immediate ? 1 : 0;
  targets.transition = 1;
  velocity.transition = 0;
  rates.transition = open ? 5.5 : 6.2;
  if (immediate) state.focus = targets.focus;
 }
 function setOrbit(yaw, tilt, immediate = false) {
  if (Number.isFinite(yaw)) targets.yaw = yaw;
  if (Number.isFinite(tilt)) targets.tilt = clamp(tilt, -.35, .35);
  if (immediate) for (const key of ['yaw','tilt']) {state[key] = targets[key]; velocity[key] = 0;}
 }
 function setFraming(distance, compact, immediate = false) {
  if (Number.isFinite(distance) && distance > 0) targets.fitDistance = distance;
  if (Number.isFinite(compact)) targets.compact = clamp(compact, 0, 1);
  if (immediate) for (const key of ['fitDistance','compact']) {state[key] = targets[key]; velocity[key] = 0;}
 }
 function step(seconds, reduced = false) {
  flushInput();
  if (reduced) return settle();
  if (!Number.isFinite(seconds) || seconds <= 0) return state;
  for (const key of channels) {
   const omega = rates[key], displacement = state[key] - targets[key];
   const impulse = velocity[key] + omega * displacement;
   const decay = Math.exp(-omega * seconds);
   state[key] = targets[key] + (displacement + impulse * seconds) * decay;
   velocity[key] = (velocity[key] - omega * impulse * seconds) * decay;
   if (Math.abs(state[key] - targets[key]) < 1e-6 && Math.abs(velocity[key]) < 1e-5) {
    state[key] = targets[key]; velocity[key] = 0;
   }
  }
  // Clamp only physical endpoints, retaining velocity through the interior.
  for (const key of ['progress','transition','compact']) {
   if (state[key] < 0 || state[key] > 1) {state[key] = clamp(state[key], 0, 1); velocity[key] = 0;}
  }
  state.focus = focusOrigin + (targets.focus - focusOrigin) * state.transition;
  return state;
 }
 return {state,targets,queueScroll,setProgress,setInspection,setOrbit,setFraming,step,settle};
}

// Fade the phone's close-up lift continuously instead of switching at p=.75.
export function compactFramingWeight(progress, compact = 1) {
 return clamp(compact, 0, 1) * (1 - smoothstep(.5, .86, progress));
}
