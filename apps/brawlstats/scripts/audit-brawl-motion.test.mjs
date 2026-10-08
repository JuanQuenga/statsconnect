import test from 'node:test';
import assert from 'node:assert/strict';
import { compareMotion, selectionReasons, latestTerminalResults, largestSilhouetteComponent } from './audit-brawl-motion.mjs';
const sequence = () => Array.from({length:16}, (_,i) => [127+100*Math.sin(i*Math.PI/8),127+100*Math.cos(i*Math.PI/8)]);
test('identical poses pass, duration mismatch identifies physical speed even with normalized match', () => {
  const a = sequence(), same = compareMotion(a,a,2,2), fast = compareMotion(a,a,2,8);
  assert.deepEqual(same.flags, []); assert.equal(same.mean,0); assert.equal(same.alignment.scale,1);
  assert.ok(fast.flags.includes('duration')); assert.equal(fast.alignment.physicalSpeed,4);
});
test('phase and double speed are recovered; static intervals are reported', () => {
  const reference=sequence(), shifted=reference.map((_,i)=>reference[(i+4)%16]);
  assert.equal(compareMotion(shifted,reference,1,1).alignment.phase,.25);
  const doubled=reference.map((_,i)=>reference[i*2%16]);
  assert.equal(compareMotion(doubled,reference,1,1).alignment.scale,2);
  const still=reference.map(()=>reference[0]);
  assert.equal(compareMotion(still,reference,1,1).staticLocal.length,16);
  assert.equal(compareMotion(reference,still,1,1).staticReference.length,16);
  assert.throws(()=>compareMotion([],reference,1,1));
  assert.throws(()=>compareMotion(reference,reference.map((v,i)=>i===7?[NaN]:v),1,1));
  assert.throws(()=>compareMotion(reference,reference,NaN,1));
});
test('selection covers metadata hazards and a stable fifteen percent sample', () => {
  assert.ok(selectionReasons({skinId:'a',animations:{HappyAnim:{fps:120,startFrame:0,endFrame:100}}}).includes('fps'));
  assert.ok(selectionReasons({skinId:'a',animations:{HappyAnim:{fps:30,startFrame:0,endFrame:300}}}).includes('long-window'));
  assert.ok(selectionReasons({skinId:'a',animations:{HeroScreenLoopAnim:{fps:30,startFrame:0,endFrame:10}}}).includes('hero-screen'));
  const n=Array.from({length:10000},(_,i)=>selectionReasons({skinId:`s${i}`}).includes('sample')).filter(Boolean).length;
  assert.ok(n>1400&&n<1600);
  assert.deepEqual(selectionReasons({skinId:'same'}),selectionReasons({skinId:'same'}));
});
test('alignment reaches both search extremes and endpoint rounding is tolerated', () => {
  const reference=sequence();
  const slow=reference.map((_,i)=>{
    const position=i/4,low=Math.floor(position),fraction=position-low;
    return reference[low].map((v,k)=>v*(1-fraction)+reference[(low+1)%16][k]*fraction);
  });
  const fast=reference.map((_,i)=>reference[i*4%16]);
  assert.equal(compareMotion(slow,reference,1,1).alignment.scale,.25);
  assert.equal(compareMotion(fast,reference,1,1).alignment.scale,4);
  assert.ok(!compareMotion(reference,reference,.7,2/3).flags.includes('duration'));
});
test('speed search uses elapsed seconds when loop durations differ', () => {
  const a=sequence(),result=compareMotion(a,a,2,8);
  assert.equal(result.alignment.scale,4);
  assert.equal(result.alignment.normalizedScale,1);
  assert.equal(result.alignment.mean,0);
});
import * as THREE from 'three';
import { referencePoseVertex, nonDegeneratePoseVertices } from './audit-brawl-motion.mjs';
test('reference bounds recover GPU-visible bind geometry when CPU skinning is non-finite', () => {
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute([1,2,3,NaN,NaN,NaN],3));
  const mesh={geometry,matrixWorld:new THREE.Matrix4().makeTranslation(2,3,4),getVertexPosition:(i,v)=>v.set(NaN,NaN,NaN)};
  assert.deepEqual(referencePoseVertex(mesh,0,new THREE.Vector3()).toArray(),[3,5,7]);
  assert.equal(referencePoseVertex(mesh,1,new THREE.Vector3()),null);
  mesh.getVertexPosition=(i,v)=>v.set(0,1,2);
  assert.deepEqual(referencePoseVertex(mesh,0,new THREE.Vector3()).toArray(),[2,4,6]);geometry.dispose();
});
test('collapsed offstage triangles cannot pull the camera away from the drawn body', () => {
  const points=[[0,0,0],[1,0,0],[0,1,0],[0,4000,0],[0,4000,0],[0,4000,0]].map(p=>new THREE.Vector3(...p));
  const geometry={attributes:{position:{count:6}},drawRange:{start:0,count:6}};
  assert.deepEqual([...nonDegeneratePoseVertices(geometry,i=>points[i])],points.slice(0,3));
  geometry.drawRange.start=3;geometry.drawRange.count=3;
  assert.deepEqual([...nonDegeneratePoseVertices(geometry,i=>points[i])],[]);
});
test('a later unavailable capture cannot be resurrected by offline alignment', () => {
  const first={kind:'option',skinId:'a',key:'HappyAnim'},last={...first,kind:'unavailable'};
  assert.deepEqual(latestTerminalResults([first,{kind:'failure',skinId:'b'},last]),[last]);
});
test('rendered framing follows the body despite distant staged pixels', () => {
  const image={width:32,height:32,data:new Uint8Array(32*32*4)};
  for(const [x,y] of [[10,10],[11,10],[10,11],[11,11],[31,31]])image.data[(y*32+x)*4+3]=255;
  assert.deepEqual(largestSilhouetteComponent(image),{x:10,y:10,width:2,height:2,pixels:4});
  image.data.fill(0);assert.equal(largestSilhouetteComponent(image),null);
});
