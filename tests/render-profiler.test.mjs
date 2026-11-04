import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRenderProfiler} from '../src/render-profiler.js';

function harness({extension=true}={}) {
 let clock=0;
 const calls=[],queries=[];
 const ext={TIME_ELAPSED_EXT:1,GPU_DISJOINT_EXT:2};
 const gl={
  QUERY_RESULT_AVAILABLE:3,QUERY_RESULT:4,CURRENT_QUERY:5,disjoint:false,
  getExtension(){calls.push('extension');return extension?ext:null;},
  getParameter(){return this.disjoint;},getQuery(){return null;},isContextLost(){return false;},
  createQuery(){const query={ready:false,result:4000000};queries.push(query);return query;},
  beginQuery(_target,query){calls.push(['begin',query]);},endQuery(){calls.push('end');},
  deleteQuery(query){query.deleted=true;calls.push(['delete',query]);},
  getQueryParameter(query,type){if(type===3)return query.ready;assert.ok(query.ready,'never read unavailable GPU results');return query.result;},
 };
 const renderer={domElement:{dataset:{}},getContext:()=>gl};
 const profiler=createRenderProfiler(renderer,{enabled:true,now:()=>clock});
 function frame(){profiler.beginFrame();clock+=1;profiler.beginLayout();clock+=2;profiler.endLayout();profiler.beginRender();clock+=3;profiler.endRender();clock+=1;profiler.endFrame();}
 return {profiler,frame,gl,calls,queries,data:renderer.domElement.dataset};
}

test('disabled profiling does not request a GL context or alter the page',()=>{
 const data={};const profiler=createRenderProfiler({domElement:{dataset:data},getContext(){assert.fail('disabled profiler touched GL');}},{enabled:false});
 for(const method of Object.values(profiler))method();
 assert.deepEqual(data,{});
});

test('CPU stages remain measurable when GPU timer queries are unavailable',()=>{
 const h=harness({extension:false});
 for(let i=0;i<120;i++)h.frame();
 assert.equal(h.data.profileGpuStatus,'unavailable');
 assert.equal(h.data.profileCpuMedianMs,'7.000');
 assert.equal(h.data.profileLayoutMedianMs,'2.000');
 assert.equal(h.data.profileRenderP95Ms,'3.000');
 assert.equal(h.queries.length,0);
});

test('GPU timing never blocks and keeps at most two pending queries',()=>{
 const h=harness();for(let i=0;i<120;i++)h.frame();
 assert.equal(h.queries.length,2);
 assert.equal(h.data.profileGpuSamples,undefined);
 h.queries[0].ready=true;h.frame();
 assert.equal(h.data.profileGpuMedianMs,'4.000');
 assert.equal(h.queries[0].deleted,true);
 h.profiler.dispose();assert.ok(h.queries.every(query=>query.deleted));
});

test('a disjoint GPU interval discards pending queries and earlier samples',()=>{
 const h=harness();for(let i=0;i<30;i++)h.frame();
 h.queries[0].ready=true;h.frame();
 assert.equal(h.data.profileGpuSamples,'1');
 for(let i=0;i<29;i++)h.frame();
 h.gl.disjoint=true;h.frame();
 assert.ok(h.queries.every(query=>query.deleted));
 assert.equal(h.data.profileGpuStatus,'disjoint');
 assert.equal(h.data.profileGpuMedianMs,undefined);
 h.gl.disjoint=false;h.frame();
 assert.equal(h.data.profileGpuStatus,'collecting');
 h.profiler.dispose();
});
