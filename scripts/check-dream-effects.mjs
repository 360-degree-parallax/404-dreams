import assert from 'node:assert/strict';
import {dreamEffects,applyDreamEffect,applyHalo} from '../public/dream-effects.mjs';
const w=64,h=48,n=w*h,a=Float32Array.from({length:n},(_,k)=>((k%w)*11+Math.floor(k/w)*17)%256),colors=[[25,25,112],[175,238,238],[255,105,180]];
function image(){const data=new Uint8ClampedArray(n*4);for(let k=0;k<n;k++){const c=colors[Math.floor(a[k]/86)%3];data.set([...c,255],k*4);}return {data};}
for(const effect of dreamEffects){const one=image(),two=image(),original=image();applyDreamEffect(one,a,w,h,effect,54321,0,k=>k%w<w/2,colors);applyDreamEffect(two,a,w,h,effect,54321,0,k=>k%w<w/2,colors);assert.deepEqual(one,two,effect+' must keep its seeded pattern');assert.notDeepEqual(one,original,effect+' must modify pixels');for(let k=0;k<n;k++){assert.equal(one.data[k*4+3],255);if(k%w>=w/2)assert.deepEqual(one.data.slice(k*4,k*4+4),original.data.slice(k*4,k*4+4),effect+' leaked outside mask');}}
const zero=image(),copy=image(),marks=new Uint8Array(n);marks[Math.floor(n/2)]=3;applyHalo(zero,a,marks,w,h,0,colors);assert.deepEqual(zero,copy);
const glow=image();applyHalo(glow,a,marks,w,h,100,colors,k=>k%w<w/2);assert.notDeepEqual(glow,copy);for(let k=0;k<n;k++){assert.equal(glow.data[k*4+3],255);if(k%w>=w/2)assert.deepEqual(glow.data.slice(k*4,k*4+4),copy.data.slice(k*4,k*4+4));}
const tiny={data:new Uint8ClampedArray([25,25,112,255])};applyHalo(tiny,new Float32Array([255]),new Uint8Array([3]),1,1,100,colors);assert.equal(tiny.data[3],255);
console.log('PASS: all 13 effects change pixels deterministically, respect target masks, and preserve alpha; HALO off, strong, solid-background mask and tiny images work.');
