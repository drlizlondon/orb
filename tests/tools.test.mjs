import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mergeDefaults,SEEN_KEY,LEGACY_SEEN,addTool,removeTool,exportTools,importTools,loadTools,saveTools,seedTools,domainOf,titleFromDomain,TOOLS_KEY} from '../src/tools.js';
import {iconCandidates} from '../src/icons.js';
import {publicTools} from '../src/public-tools.js';
import {projects} from '../dist/projects.js';
const memory=(initial)=>{const m=new Map(initial?Object.entries(initial):[]);return {getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v)),m};};
test('T3 empty storage loads the nine-tool seed and persists it',()=>{
 const s=memory();const tools=loadTools(s,1000);
 assert.equal(tools.length,9);
 assert.deepEqual(tools.map(t=>t.id),['bpp','gp','sms','ppd','da','cards','igc','nl','ideas']);
 assert.deepEqual(tools.map(t=>t.url),projects.map(p=>p.url));
 assert.deepEqual(tools.map(t=>t.desc),projects.map(p=>p.description));
 assert.ok(s.m.has(TOOLS_KEY));
 assert.equal(loadTools(s,2000)[0].addedAt,1000);
});
test('T3 corrupt storage falls back to the seed',()=>{
 assert.equal(loadTools(memory({[TOOLS_KEY]:'{oops'})).length,9);
 assert.equal(loadTools(memory({[TOOLS_KEY]:'{"version":2}'})).length,9);
});
test('T3 addTool rejects non-URLs, dedupes by hostname, defaults the title',()=>{
 assert.throws(()=>addTool([],{url:'not a url'}));
 assert.throws(()=>addTool([],{url:''}));
 const one=addTool([],{url:'https://x.com'},1);
 assert.equal(one.length,1);
 assert.equal(addTool(one,{url:'x.com/'},2).length,1);
 assert.equal(addTool(one,{url:'https://www.x.com/page'},2).length,1);
 const named=addTool([],{url:'my-cool-site.io'},3);
 assert.equal(named[0].title,'My Cool Site');
 assert.equal(named[0].url,'https://my-cool-site.io');
 assert.equal(addTool([],{url:'a.com',title:'  Mine '},4)[0].title,'Mine');
 const ids=addTool(addTool([],{url:'a.com'},5),{url:'b.com'},5).map(t=>t.id);
 assert.equal(new Set(ids).size,2);
});
test('G1 a tool added with only a URL has an empty description and no icon',()=>{
 const [t]=addTool([],{url:'https://x.com'},1);
 assert.equal(t.desc,'');assert.equal(t.icon,'');
});
test('T3 export then import round-trips; bad files throw and never merge',()=>{
 const tools=seedTools(5);
 assert.deepEqual(importTools(exportTools(tools)),tools);
 assert.deepEqual(JSON.parse(exportTools(tools)).version,1);
 assert.throws(()=>importTools('{"version":2}'));
 assert.throws(()=>importTools('{"version":2,"tools":[]}'));
 assert.throws(()=>importTools('not json'));
 assert.throws(()=>importTools('{"version":1}'));
 assert.throws(()=>importTools(JSON.stringify({version:1,tools:[{id:'a',title:'A',url:'javascript:alert(1)',desc:'',icon:'',addedAt:1}]})));
 assert.throws(()=>importTools(JSON.stringify({version:1,tools:[{id:'a',title:'A'}]})));
 const dup=seedTools(0);dup[1].id=dup[0].id;
 assert.throws(()=>importTools(exportTools(dup)));
 assert.deepEqual(importTools(exportTools([])),[]);
});
test('removeTool and saveTools',()=>{
 const t=seedTools(0);assert.equal(removeTool(t,'gp').length,8);
 const s=memory();assert.equal(saveTools(s,t),true);assert.equal(loadTools(s).length,9);
 assert.equal(saveTools({setItem(){throw new Error('full');}},t),false);
});
test('domainOf and titleFromDomain match galaxycloud',()=>{
 assert.equal(domainOf('nope'),null);assert.equal(domainOf('x.com/a'),'x.com');
 assert.equal(titleFromDomain('www.big-picture.app'),'Big Picture');
});
test('T4 iconCandidates order',()=>{
 const withIcon=iconCandidates({title:'Big',url:'https://x.com/p',icon:'https://x.com/i.svg'});
 assert.equal(withIcon.length,4);
 assert.deepEqual(withIcon.map(c=>c.src??c.type),['https://x.com/i.svg','https://x.com/apple-touch-icon.png','https://x.com/favicon.ico','monogram']);
 const none=iconCandidates({title:'big',url:'https://x.com/p',icon:''});
 assert.equal(none.length,3);
 assert.equal(none.at(-1).type,'monogram');assert.equal(none.at(-1).letter,'B');
 assert.ok(none.slice(0,-1).every(c=>c.src.startsWith('https://x.com/')));
});
test('T6 public list is bpp, gp, sms and carries no We Build For Good link',()=>{
 const src=readFileSync(new URL('../src/public-tools.js',import.meta.url),'utf8');
 assert.ok(!/webuildforgood/i.test(src));
 const personal=seedTools(0).map(t=>t.id);
 assert.ok(publicTools.every(t=>personal.includes(t.id)));
 for(const id of personal.filter(id=>!['bpp','gp','sms'].includes(id)))assert.ok(!src.includes(`'${id}'`)&&!src.includes(`"${id}"`),id);
 assert.deepEqual(publicTools.map(t=>t.id),['bpp','gp','sms']);
 assert.ok(publicTools.every(t=>!/webuildforgood/i.test(JSON.stringify(t))));
});

const ids=l=>l.map(t=>t.id);
test('A1 mergeDefaults: a saved list missing a new default gains it',()=>{
 const defaults=seedTools(9);const saved=defaults.slice(0,6);
 const m=mergeDefaults(saved,defaults,LEGACY_SEEN);
 assert.deepEqual(ids(m.tools),['bpp','gp','sms','ppd','da','cards','igc','nl','ideas']);
 assert.equal(m.added,3);
 assert.ok(m.seen.includes('igc'));
});
test('A1 mergeDefaults: a default the user removed is NOT re-added',()=>{
 const defaults=seedTools(9);
 const saved=defaults.filter(t=>t.id!=='gp');
 const m=mergeDefaults(saved,defaults,defaults.map(t=>t.id));
 assert.ok(!ids(m.tools).includes('gp'));
 assert.equal(m.added,0);
 assert.equal(m.tools,saved);
});
test('A1 mergeDefaults: user-added tools, order and customisations are preserved',()=>{
 const defaults=seedTools(9);
 const custom=addTool([],{url:'https://mine.example',title:'Mine'},7)[0];
 const edited={...defaults[2],title:'Renamed',desc:'my words'};
 const saved=[custom,defaults[3],edited,defaults[0]];
 const m=mergeDefaults(saved,defaults,['bpp','sms','ppd']);
 assert.deepEqual(m.tools.slice(0,4),saved,'existing entries keep order and edits');
 assert.equal(m.tools[1].id,defaults[3].id);
 assert.equal(m.tools[2].title,'Renamed');
 assert.deepEqual(ids(m.tools).slice(4),['gp','da','cards','igc','nl','ideas']);
 assert.equal(m.tools.filter(t=>t.id===custom.id).length,1);
});
test('A1 loadTools: stale 6-tool list upgrades once; a removal survives later loads',()=>{
 const defaults=seedTools(1);
 const s=memory({[TOOLS_KEY]:exportTools(defaults.slice(0,6))});
 assert.deepEqual(ids(loadTools(s,5)),ids(defaults));
 assert.deepEqual(ids(JSON.parse(s.m.get(TOOLS_KEY)).tools),ids(defaults),'merged list persisted');
 assert.ok(JSON.parse(s.m.get(SEEN_KEY)).includes('igc'));
 s.setItem(TOOLS_KEY,exportTools(removeTool(loadTools(s,6),'igc')));
 assert.ok(!ids(loadTools(s,7)).includes('igc'),'removed default stays removed');
 assert.equal(ids(loadTools(s,8)).length,8);
});
test('A1 loadTools: fresh seed records every default as seen; corrupt seen key falls back safely',()=>{
 const s=memory();loadTools(s,1);
 assert.deepEqual(JSON.parse(s.m.get(SEEN_KEY)).sort(),ids(projects).sort());
 const bad=memory({[TOOLS_KEY]:exportTools(seedTools(0).slice(0,6)),[SEEN_KEY]:'{oops'});
 assert.equal(loadTools(bad,2).length,9);
});

// Orb Instagram tidy-up: shared asserts (tests/tidy-checks.mjs); tests/tidy-mutations.test.mjs proves they can fail.
import {runToolChecks} from './tidy-checks.mjs';
test('TIDY launcher has no Cover Series tile, one Instagram name, and a stored cover-series tile is dropped on load',()=>{
 runToolChecks({loadTools,seedTools,projects,TOOLS_KEY,SEEN_KEY,exportTools});
});
test('TIDY a title the user changed is not overwritten by the rename',()=>{
 const defaults=seedTools(1).map(t=>t.id==='igc'?{...t,title:'My Insta'}:t);
 const s=memory({[TOOLS_KEY]:exportTools(defaults)});
 assert.equal(loadTools(s,2).find(t=>t.id==='igc').title,'My Insta');
});
test('TIDY the built pages carry no Cover Series label, and the old URL still redirects to Instagram',()=>{
 for(const f of ['dist/index.html','dist/app/index.html','dist/projects.js','dist/app.js'])assert.ok(!/cover\s*series/i.test(readFileSync(new URL('../'+f,import.meta.url),'utf8')),f);
 const r=readFileSync(new URL('../dist/cover-series/index.html',import.meta.url),'utf8');
 assert.ok(r.includes('url=../carousel-insta/#series')&&!/<script/i.test(r));
});
test('TIDY LinkedIn editor says first card, not cover',()=>{
 const src=readFileSync(new URL('../dist/carousel/index.html',import.meta.url),'utf8');
 assert.ok(!/\bcover\b/i.test(src.replace(/object-fit:\s*cover/g,'')),'the word cover is still in the LinkedIn editor');
 assert.ok(/first-card/.test(src));
});
