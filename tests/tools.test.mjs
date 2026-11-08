import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {addTool,removeTool,exportTools,importTools,loadTools,saveTools,seedTools,domainOf,titleFromDomain,TOOLS_KEY} from '../src/tools.js';
import {iconCandidates} from '../src/icons.js';
import {publicTools} from '../src/public-tools.js';
import {projects} from '../dist/projects.js';
const memory=(initial)=>{const m=new Map(initial?Object.entries(initial):[]);return {getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v)),m};};
test('T3 empty storage loads the five-tool seed and persists it',()=>{
 const s=memory();const tools=loadTools(s,1000);
 assert.equal(tools.length,5);
 assert.deepEqual(tools.map(t=>t.id),['bpp','gp','sms','ppd','da']);
 assert.deepEqual(tools.map(t=>t.url),projects.map(p=>p.url));
 assert.deepEqual(tools.map(t=>t.desc),projects.map(p=>p.description));
 assert.ok(s.m.has(TOOLS_KEY));
 assert.equal(loadTools(s,2000)[0].addedAt,1000);
});
test('T3 corrupt storage falls back to the seed',()=>{
 assert.equal(loadTools(memory({[TOOLS_KEY]:'{oops'})).length,5);
 assert.equal(loadTools(memory({[TOOLS_KEY]:'{"version":2}'})).length,5);
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
 const t=seedTools(0);assert.equal(removeTool(t,'gp').length,4);
 const s=memory();assert.equal(saveTools(s,t),true);assert.equal(loadTools(s).length,5);
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
