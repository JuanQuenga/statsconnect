import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { analyzeRGBA, duplicatePairs, sampleTimes, shardIncludes, signatureDistance, referenceSample, referenceVertexIndices } from './audit-brawl-render.mjs';
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
test('reference framing skins only indexed vertices in a shared buffer', () => {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([0,0,0, 1,0,0, 0,1,0, 1000,1000,1000], 3));
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute([0,0,0,0, 0,0,0,0, 0,0,0,0, 9,0,0,0], 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute([1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0], 4));
  geometry.setIndex([0,1,2,2,1,0]);
  const bone = new THREE.Bone(), material = new THREE.MeshBasicMaterial();
  const mesh = new THREE.SkinnedMesh(geometry, material);
  mesh.add(bone); mesh.bind(new THREE.Skeleton([bone])); mesh.updateMatrixWorld(true);
  assert.throws(() => mesh.getVertexPosition(3, new THREE.Vector3()), TypeError);
  const bounds = new THREE.Box3();
  for (const index of referenceVertexIndices(geometry)) bounds.expandByPoint(mesh.getVertexPosition(index, new THREE.Vector3()));
  assert.deepEqual([...referenceVertexIndices(geometry)], [0,1,2]);
  assert.deepEqual(bounds.min.toArray(), [0,0,0]); assert.deepEqual(bounds.max.toArray(), [1,1,0]);
  mesh.skeleton.dispose(); geometry.dispose(); material.dispose();
});
test('reference framing respects draw ranges and nonindexed geometry', () => {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(18), 3));
  geometry.setIndex([5,4,3,2,1,0]); geometry.setDrawRange(1,3);
  assert.deepEqual([...referenceVertexIndices(geometry)], [4,3,2]);
  geometry.setIndex(null); assert.deepEqual([...referenceVertexIndices(geometry)], [1,2,3]);
  geometry.setDrawRange(4,Infinity); assert.deepEqual([...referenceVertexIndices(geometry)], [4,5]);
  geometry.dispose();
});

import { compareFaces, faceOptions, faceTemporal, faceLuma, lumaSSIM, projectedFaceBounds, projectedStencilBounds, referenceSkinSlug, strokeNoise } from './audit-brawl-render.mjs';
test('reference names use public defaults when displayName is absent',()=>{
  assert.equal(referenceSkinSlug({skinId:'AttractorDefault',publicCharacter:'Cosmo'}),'Cosmo_(Default)');
  assert.equal(referenceSkinSlug({skinId:'GeishaDefault',displayName:'Kaze (Default)'}),'Kaze_(Default)');
});
test('headless stencil projection follows alpha-bearing UV triangles only',()=>{
  const root=new THREE.Group(),g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute([-1,-1,0,1,-1,0,0,1,0,30,-30,0,40,-30,0,30,-40,0],3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute([.2,.2,.6,.2,.2,.6,.8,.8,.9,.8,.8,.9],2));g.setIndex([0,1,2,3,4,5]);
  const m=new THREE.ShaderMaterial({defines:{USE_STENCIL:1},uniforms:{stencilUvTransform:{value:new THREE.Vector4(1,1,0,0)}}});
  root.add(new THREE.Mesh(g,m));const camera=new THREE.PerspectiveCamera(40,1,.1,100);camera.position.z=10;camera.lookAt(0,0,0);
  const renderer={readRenderTargetPixels(t,x,y,w,h,p){for(let yy=4;yy<8;yy++)for(let xx=4;xx<8;xx++)p[(yy*w+xx)*4+3]=255;}};
  const b=projectedStencilBounds(root,camera,1024,renderer,{width:16,height:16});
  assert.equal(b.valid,true);assert.equal(b.source,'stencil-uv-triangles');assert.equal(b.meshes[0].vertices,3);assert.ok(b.width<400);
  assert.equal(projectedStencilBounds(root,camera,1024,{readRenderTargetPixels(){}},{width:16,height:16}).source,'empty-stencil');
  g.dispose();m.dispose();
});
test('face candidates include menu-deduped Hero Screen and require atlas plus binary',()=>{
  const ready={kind:'ready'},entry={animations:{IdleAnim:{exported:ready},HappyAnim:{exported:ready},HeroScreenAnim:{exported:ready},WalkAnim:{exported:ready}},faces:{IdleFace:{atlas:ready,binary:ready},HappyFace:{atlas:ready,binary:{kind:'missing'}},HeroScreenFace:{atlas:ready,binary:ready}}};
  assert.deepEqual(faceOptions(entry).map(o=>o.key),['IdleAnim','HeroScreenAnim']);
});
test('face metrics preserve clean matches and detect extra dark strokes',()=>{
  const clean=fill(image(256,256),[210,175,140,255],0,0,255,255);
  fill(clean,[10,10,10,255],70,140,90,148);fill(clean,[10,10,10,255],165,140,185,148);
  const noisy={...clean,data:clean.data.slice()};
  for(let y=105;y<195;y+=3)for(let x=40;x<215;x+=3)noisy.data.set([0,0,0,255],(y*256+x)*4);
  const equal=compareFaces(clean,clean),bad=compareFaces(noisy,clean);
  assert.equal(equal.ssim,1);assert.equal(equal.edgeIoU,1);assert.equal(equal.flagged,false);
  assert.ok(bad.localNoise>bad.referenceNoise);assert.ok(bad.noiseRatio>1.65);assert.equal(bad.flagged,true);
  assert.ok(strokeNoise(faceLuma(noisy),256)>strokeNoise(faceLuma(clean),256));
  assert.equal(faceTemporal(clean,fill(image(256,256),[0,0,0,255],0,0,255,255),0).flagged,true);assert.equal(faceTemporal(clean,noisy,.2).flagged,false);
});
test('alignment compensates small translation and reports it',()=>{
  const a=fill(image(256,256),[200,200,200,255],0,0,255,255),b=fill(image(256,256),[200,200,200,255],0,0,255,255);
  fill(a,[0,0,0,255],70,85,90,105);fill(b,[0,0,0,255],74,89,94,109);
  const aligned=compareFaces(a,b);
  assert.deepEqual(aligned.alignment,{dx:4,dy:4,scale:1});assert.ok(aligned.ssim>1-1e-10);assert.equal(aligned.flagged,false);
  assert.throws(()=>lumaSSIM(new Float32Array(3),new Float32Array(4),2));
});
test('projected face bounds follow head-weighted skinned geometry, never silhouette top',()=>{
  const root=new THREE.Group(),g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute([-1,-1,0,1,-1,0,0,1,0,0,-20,0],3));
  g.setAttribute('skinIndex',new THREE.Uint16BufferAttribute([0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0],4));
  g.setAttribute('skinWeight',new THREE.Float32BufferAttribute([1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0],4));g.setIndex([0,1,2,3]);
  const head=new THREE.Bone(),body=new THREE.Bone();head.name='Head';body.name='Body';
  const m=new THREE.SkinnedMesh(g,new THREE.MeshBasicMaterial());m.add(head,body);m.bind(new THREE.Skeleton([head,body]));root.add(m);
  const camera=new THREE.PerspectiveCamera(40,1,.1,100);camera.position.z=10;camera.lookAt(0,0,0);
  const bounds=projectedFaceBounds(root,camera,1024);
  assert.equal(bounds.valid,true);assert.equal(bounds.source,'head-bone-vertices');assert.equal(bounds.meshes[0].vertices,3);assert.ok(bounds.height<400);
  m.material.name='face';body.name='head_s_hc';
  const rider=projectedFaceBounds(root,camera,1024);
  assert.equal(rider.source,'head-bone-vertices');assert.equal(rider.meshes[0].vertices,3);
  m.material.name='';body.name='Body';
  head.position.x=1;const moved=projectedFaceBounds(root,camera,1024);assert.ok(moved.x>bounds.x);
  for(const name of ['head_fixed_s','head_no_turn_s','head_joint_s','head_special_s','HeadBone','head_s_hc','head_s_transform']){head.name=name;assert.equal(projectedFaceBounds(root,camera,1024).valid,true,name);}
  head.name='dog_head_s';assert.equal(projectedFaceBounds(root,camera,1024).valid,false);
  m.name='faceGeo';assert.equal(projectedFaceBounds(root,camera,1024).source,'face-mesh');
  m.material.visible=false;assert.equal(projectedFaceBounds(root,camera,1024).valid,false);
  m.skeleton.dispose();g.dispose();m.material.dispose();
});

import { bodyMotionDifference } from './audit-brawl-render.mjs';
test('temporal body motion normalizes model coverage, including small silhouettes',()=>{
  const a=fill(image(64,64),[100,100,100,255],28,28,35,35),b=fill(image(64,64),[240,240,240,255],28,28,35,35);
  assert.equal(bodyMotionDifference(a,a).difference,0);
  const motion=bodyMotionDifference(a,b);
  assert.ok(motion.raw<.025);assert.ok(motion.difference>.025);
  assert.equal(motion.coverage,64/4096);
});
