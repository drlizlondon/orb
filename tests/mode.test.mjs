import {test} from 'node:test';
import assert from 'node:assert/strict';
import {modeFor} from '../src/mode.js';
test('T1 modeFor: /app, /app/ and ?app are personal; everything else is public',()=>{
 assert.equal(modeFor('/app',''),'mine');
 assert.equal(modeFor('/app/',''),'mine');
 assert.equal(modeFor('/orb/app/',''),'mine');
 assert.equal(modeFor('/orb/',''),'public');
 assert.equal(modeFor('/orb/apps/',''),'public');
 assert.equal(modeFor('/','?app'),'mine');
 assert.equal(modeFor('/',''),'public');
 assert.equal(modeFor('/anything',''),'public');
 assert.equal(modeFor('/application',''),'public');
});
