// DOM diagnostics stay out of the interface. Sample only visible, settled frames.
export function createFrameBudget(renderer, composer, onScale, adaptive = false) {
  const samples = [];
  const minimumScale = Math.min(1, renderer.getPixelRatio());
  let warmup = 45, windows = 0, slowWindows = 0, budget = 1, frames = 0;
  if(typeof document!=='undefined')document.addEventListener('visibilitychange',()=>{samples.length=0;warmup=15;});
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
    if (adaptive && !renderer.isFallback && slowWindows >= 2 && (renderer.getPixelRatio() > minimumScale || budget > .7)) {
      const next = Math.max(minimumScale, renderer.getPixelRatio() - .2);
      if (renderer.getPixelRatio() <= minimumScale) budget = Math.max(.7,budget-.15);
      renderer.setPixelRatio(next);
      composer?.setPixelRatio(next);
      onScale(next,budget);
      canvas.dataset.particleBudget=budget.toFixed(2);
      slowWindows = 0;
      warmup = 45;
    }
    samples.length = 0;
  };
}
