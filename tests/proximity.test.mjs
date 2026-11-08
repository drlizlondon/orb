import {test} from 'node:test';
import assert from 'node:assert/strict';
import {proximityWeight} from '../src/proximity.js';
test('T7 proximityWeight falls linearly to zero at the radius',()=>{
 assert.equal(proximityWeight(0,0),1);
 assert.equal(proximityWeight(220,0),0);
 assert.equal(proximityWeight(110,0),.5);
 assert.equal(proximityWeight(500,500),0);
});
