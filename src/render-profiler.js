// Opt-in diagnostics only. Nothing is drawn and no samples leave the browser.
// GPU queries are polled asynchronously; CPU timings include JS submission,
// not GPU completion. Keep those measures separate from frame intervals.
const noop = () => {};
const disabled = Object.freeze({beginFrame:noop,beginLayout:noop,endLayout:noop,beginRender:noop,endRender:noop,endFrame:noop,reset:noop,dispose:noop});

function summarize(values) {
 const sorted=[...values].sort((a,b)=>a-b);
 return [sorted[Math.floor(sorted.length*.5)],sorted[Math.min(sorted.length-1,Math.floor(sorted.length*.95))]];
}

export function createRenderProfiler(renderer, {
 enabled=typeof location!=='undefined'&&new URLSearchParams(location.search).get('profile')==='1',
 now=()=>performance.now(),
}={}) {
 if(!enabled)return disabled;
 const data=renderer.domElement.dataset;
 let gl=null,ext=null;
 try {
  if(!renderer.isFallback) {
   gl=renderer.getContext?.();
   ext=gl?.getExtension('EXT_disjoint_timer_query_webgl2');
  }
 } catch {gl=null;ext=null;}
 data.profileGpuStatus=ext?'collecting':'unavailable';
 const cpu=[],layout=[],render=[],gpu=[],pending=[];
 let frames=0,windows=0,frameStart=null,layoutStart=null,renderStart=null,layoutMs=0,renderMs=0,active=null,disposed=false;

 function publish(prefix,values) {
  const [median,p95]=summarize(values);
  data[`${prefix}MedianMs`]=median.toFixed(3);
  data[`${prefix}P95Ms`]=p95.toFixed(3);
 }
 function clearGpu(status) {
  if(active){gl.endQuery(ext.TIME_ELAPSED_EXT);gl.deleteQuery(active);active=null;}
  for(const query of pending)gl.deleteQuery(query);
  pending.length=0;gpu.length=0;
  delete data.profileGpuMedianMs;delete data.profileGpuP95Ms;delete data.profileGpuSamples;
  data.profileGpuStatus=status;
 }
 function pollGpu() {
  if(!ext)return;
  if(gl.isContextLost?.()){clearGpu('context-lost');return;}
  if(gl.getParameter(ext.GPU_DISJOINT_EXT)){clearGpu('disjoint');return;}
  for(let i=pending.length-1;i>=0;i--){
   const query=pending[i];
   if(!gl.getQueryParameter(query,gl.QUERY_RESULT_AVAILABLE))continue;
   const milliseconds=gl.getQueryParameter(query,gl.QUERY_RESULT)/1e6;
   gl.deleteQuery(query);pending.splice(i,1);
   if(Number.isFinite(milliseconds)&&milliseconds>=0){
    gpu.push(milliseconds);if(gpu.length>64)gpu.shift();
   }
  }
  if(gpu.length){publish('profileGpu',gpu);data.profileGpuSamples=String(gpu.length);data.profileGpuStatus='ready';}
  else if(data.profileGpuStatus!=='collecting')data.profileGpuStatus='collecting';
 }
 const api={
  beginFrame(){
   if(disposed)return;
   pollGpu();frames++;
   frameStart=now();layoutStart=renderStart=null;layoutMs=renderMs=0;
  },
  beginLayout(){if(!disposed&&frameStart!==null)layoutStart=now();},
  endLayout(){if(layoutStart!==null){layoutMs+=Math.max(0,now()-layoutStart);layoutStart=null;}},
  beginRender(){
   if(disposed||frameStart===null)return;
   renderStart=now();
   if(!ext||frames%30!==0||active||pending.length>=2||gl.isContextLost?.())return;
   if(gl.getParameter(ext.GPU_DISJOINT_EXT))return;
   // Do not replace a query owned by another profiler or renderer.
   if(gl.getQuery?.(ext.TIME_ELAPSED_EXT,gl.CURRENT_QUERY))return;
   active=gl.createQuery();
   if(active)gl.beginQuery(ext.TIME_ELAPSED_EXT,active);
  },
  endRender(){
   if(renderStart!==null){renderMs+=Math.max(0,now()-renderStart);renderStart=null;}
   if(active){gl.endQuery(ext.TIME_ELAPSED_EXT);pending.push(active);active=null;}
  },
  endFrame(){
   if(disposed||frameStart===null)return;
   api.endLayout();api.endRender();
   const elapsed=now()-frameStart;frameStart=null;
   if(!Number.isFinite(elapsed)||elapsed<0)return;
   cpu.push(elapsed);layout.push(layoutMs);render.push(renderMs);
   if(cpu.length===120){
    publish('profileCpu',cpu);publish('profileLayout',layout);publish('profileRender',render);
    data.profileCpuSamples='120';data.profileWindow=String(++windows);
    cpu.length=layout.length=render.length=0;
   }
  },
  reset(){
   frameStart=layoutStart=renderStart=null;cpu.length=layout.length=render.length=0;
   if(ext)clearGpu('collecting');
  },
  dispose(){
   if(disposed)return;
   api.reset();disposed=true;
  },
 };
 return api;
}
