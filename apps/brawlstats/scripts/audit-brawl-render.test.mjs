import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeRGBA, duplicatePairs, sampleTimes, shardIncludes, signatureDistance, referenceSample } from './audit-brawl-render.mjs';
const image = (width = 32, height = 32) => ({ width, height, data: new Uint8Array(width * height * 4) });
function fill(a, color, x0 = 4, y0 = 4, x1 = 27, y1 = 27) {
  for (let y=y0;y<=y1;y++) for(let x=x0;x<=x1;x++) a.data.set(color,(y*a.width+x)*4); return a;
}
test('one-based shards partition without gaps or overlap and sampling excludes wrap point', () => {
  for (let i=0;i<100;i++) assert.equal([1,2,3].filter(s=>shardIncludes(i,`${s}/3`)).length,1);
  for (const invalid of ['0/2','3/2','1/0','x','-1/2']) assert.throws(()=>shardIncludes(0,invalid));
  assert.deepEqual(sampleTimes(2),[0,.25,.5,.75,1,1.25,1.5,1.75]); assert.throws(()=>sampleTimes(NaN));
});
test('alpha defines silhouette, exact whites are counted, and flicker ignores the edge', () => {
  const a=fill(image(),[255,255,255,255]), b=fill(image(),[255,255,255,255]);
  let m=analyzeRGBA(a,b);assert.deepEqual(m.bbox,{x:4,y:4,width:24,height:24});assert.equal(m.whitePixels,576);assert.equal(m.interiorPixels,484);assert.equal(m.flickerScore,0);
  b.data.set([0,0,0,255],(10*32+10)*4);m=analyzeRGBA(a,b);assert.equal(m.changedPixels,1);assert.equal(m.flickerScore,1/484);
  b.data.set([0,0,0,255],(4*32+4)*4);assert.equal(analyzeRGBA(a,b).changedPixels,1);
  assert.equal(analyzeRGBA(image()).bbox,null);assert.throws(()=>analyzeRGBA(a,image(16,16)));
});
test('motion comparison requires eight valid poses and detects luma/silhouette changes', () => {
  const a=analyzeRGBA(fill(image(),[100,100,100,255])),b=analyzeRGBA(fill(image(),[200,200,200,255]));
  const option=(key,m)=>({key,frames:Array.from({length:8},()=>m)});
  assert.equal(signatureDistance(a.signature,a.signature),0);assert.ok(signatureDistance(a.signature,b.signature)>.008);
  assert.deepEqual(duplicatePairs([option('win',a),option('hero',a),option('idle',b)]).map(p=>[p.a,p.b]),[['win','hero']]);
  assert.equal(duplicatePairs([option('empty',analyzeRGBA(image())),option('empty2',analyzeRGBA(image()))]).length,0);
});
test('reference sample is stable and approximately ten percent',()=>{
  const selections=Array.from({length:10000},(_,i)=>referenceSample(`skin${i}`,'seed'));
  const n=selections.filter(Boolean).length;assert.ok(n>900&&n<1100);assert.equal(referenceSample('a','seed'),referenceSample('a','seed'));
});
