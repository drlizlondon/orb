// A check that cannot fail proves nothing: break a copy of the launcher data and tools code in four ways; the shared asserts must fail each time.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {runToolChecks} from './tidy-checks.mjs';
const root=path.join(path.dirname(fileURLToPath(import.meta.url)),'..');
const PROJ=readFileSync(path.join(root,'dist/projects.js'),'utf8'),TOOLS=readFileSync(path.join(root,'src/tools.js'),'utf8');
let n=0;
async function load(projectsSrc,toolsSrc){
 const d=mkdtempSync(path.join(tmpdir(),'orb-tidy-'+(n++)+'-'));mkdirSync(path.join(d,'dist'));mkdirSync(path.join(d,'src'));
 writeFileSync(path.join(d,'package.json'),'{"type":"module"}');
 writeFileSync(path.join(d,'dist/projects.js'),projectsSrc);writeFileSync(path.join(d,'src/tools.js'),toolsSrc);
 const t=await import(pathToFileURL(path.join(d,'src/tools.js')).href),p=await import(pathToFileURL(path.join(d,'dist/projects.js')).href);
 return {...t,projects:p.projects};
}
const COVER=",\n {id:'cover',title:'Cover Series',url:'https://drlizlondon.github.io/orb/cover-series/',description:'old',category:'x',color:'#fff',position:[0,0,0]}\n];";
const rep=(s,a,b)=>{assert.ok(s.includes(a),'mutation target missing: '+a);return s.replace(a,b);};
test('TIDY-M0 the unbroken copy passes the shared asserts',async()=>{runToolChecks(await load(PROJ,TOOLS));});
test('TIDY-M1 a Cover Series tile back in the launcher fails',async()=>{
 const m=await load(PROJ.replace(/,?\s*\];\s*$/,COVER),TOOLS);assert.throws(()=>runToolChecks(m));});
test('TIDY-M2 no migration of stored tools fails',async()=>{
 const m=await load(PROJ,rep(TOOLS,"export const RETIRED_IDS = ['cover'];","export const RETIRED_IDS = [];"));assert.throws(()=>runToolChecks(m));});
test('TIDY-M3 the old Instagram Carousel name fails',async()=>{
 const m=await load(rep(PROJ,"title:'Instagram'","title:'Instagram Carousel'"),TOOLS);assert.throws(()=>runToolChecks(m));});
test('TIDY-M4 migration that is never applied on load fails',async()=>{
 const m=await load(PROJ,rep(TOOLS,"const migrated = migrateSaved(saved);","const migrated = saved;"));assert.throws(()=>runToolChecks(m));});
