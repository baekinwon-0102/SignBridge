import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {extractFeatures,SignSequence,predictionText} from '../web/sign_features.mjs';

const cases=JSON.parse(readFileSync(new URL('./fixtures/sign_features.json',import.meta.url)));
for(const c of cases) test(`Python feature parity: ${c.name}`,()=> {
  const hands=[],sides=[];
  // Reverse detector order to verify that handedness, not array position, is used.
  if(c.left) { hands.push(c.left); sides.push([{categoryName:'Left'}]); }
  if(c.right) { hands.push(c.right); sides.push([{categoryName:'Right'}]); }
  const actual=extractFeatures(hands,sides,c.pose,c.width,c.height);
  assert.equal(actual.length,150);
  // acos near pi amplifies float32/float64 rounding; allow 0.0001 radians.
  actual.forEach((v,i)=>assert.ok(Math.abs(v-c.expected[i])<1e-4,`${c.name}[${i}]: ${v} vs ${c.expected[i]}`));
});
test('Only full sequences infer, at most once per second, with a bounded window',()=> {
  const sequence=new SignSequence();
  for(let i=0;i<29;i++) assert.equal(sequence.add(new Float32Array(150).fill(i),i*67),null);
  const input=sequence.add(new Float32Array(150).fill(29),29*67);
  assert.equal(input.length,4500); assert.equal(input[0],0); assert.equal(input[4499],29);
  assert.equal(sequence.add(new Float32Array(150),30*67),null);
  for(let i=31;i<44;i++) sequence.add(new Float32Array(150),i*67);
  assert.ok(sequence.add(new Float32Array(150),44*67));
  assert.equal(sequence.frames.length,30);
  assert.equal(sequence.add(new Float32Array(150),5000),null);
  assert.equal(sequence.frames.length,1);
  sequence.reset(); assert.equal(sequence.frames.length,0);
});
test('Korean labels follow the class index and uncertain predictions are rejected',()=> {
  const map=JSON.parse(readFileSync(new URL('../assets/data/core_label_map.json',import.meta.url)));
  const words=JSON.parse(readFileSync(new URL('../assets/data/core_ksl_word_dictionary.json',import.meta.url)));
  const labels=[];
  for(const [word,index] of Object.entries(map)) labels[index]=words[word];
  const logits=new Float32Array(112); logits[49]=20;
  assert.equal(predictionText(logits,labels),'감사 · 100%');
  assert.match(predictionText(new Float32Array(112),labels),/불확실/);
  logits[0]=NaN;
  assert.throws(()=>predictionText(logits,labels),/Invalid/);
});
