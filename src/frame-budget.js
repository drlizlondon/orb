// DOM diagnostics stay out of the interface. Sample only visible, settled frames.
export function createFrameBudget(renderer, composer, onScale, adaptive = false) {
  const samples = [];
  const initialScale = renderer.getPixelRatio();
  const minimumScale = Math.min(1, initialScale);
  let warmup = 45, windows = 0, slowWindows = 0, healthyWindows = 0, budget = 1, frames = 0;
  if(typeof document!=='undefined')document.addEventListener('visibilitychange',()=>{samples.length=0;warmup=15;slowWindows=0;healthyWindows=0;});
  return function record(milliseconds) {
    const canvas=renderer.domElement;
    if(++frames%30===0){canvas.dataset.frameCount=String(frames);canvas.dataset.frameLastMs=Number(milliseconds).toFixed(2);}
    if (warmup-- > 0 || !Number.isFinite(milliseconds) || milliseconds <= 0) return;
    samples.push(milliseconds);
    if (samples.length < 120) return;
    const sorted = [...samples].sort((a,b)=>a-b);
    const median = sorted[60], p95 = sorted[114];
    canvas.dataset.frameMedianMs = median.toFixed(2);
    canvas.dataset.frameP95Ms = p95.toFixed(2);
    canvas.dataset.renderer = renderer.isFallback ? 'canvas' : 'webgl';
    canvas.dataset.renderScale = renderer.getPixelRatio().toFixed(2);
    canvas.dataset.sampleWindow = String(++windows);
    slowWindows = median > 25 && p95 > 30 ? slowWindows + 1 : 0;
    healthyWindows = median < 18 && p95 < 22 ? healthyWindows + 1 : 0;
    const current = renderer.getPixelRatio();
    let next = current, changed = false;
    if (adaptive && !renderer.isFallback && slowWindows >= 2 && (current > minimumScale || budget > .7)) {
      next = Math.max(minimumScale, current - .2);
      if (current <= minimumScale) budget = Math.max(.7, Number((budget-.15).toFixed(2)));
      changed = true;
    } else if (adaptive && !renderer.isFallback && healthyWindows >= 8 && (budget < 1 || current < initialScale)) {
      // Restore detail gradually after a sustained recovery, before raising pixel density.
      if (budget < 1) budget = Math.min(1, Number((budget+.15).toFixed(2)));
      else next = Math.min(initialScale, Number((current+.1).toFixed(4)));
      changed = true;
    }
    if (changed) {
      if (next !== current) {
        renderer.setPixelRatio(next);
        composer?.setPixelRatio(next);
      }
      onScale(next,budget);
      canvas.dataset.particleBudget=budget.toFixed(2);
      slowWindows=0;
      healthyWindows=0;
      warmup=45;
    }
    samples.length = 0;
  };
}
