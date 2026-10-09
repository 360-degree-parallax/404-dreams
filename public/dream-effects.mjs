export const dreamEffects=['DECAY','GHOST','BLEED','BLOCK','SCAN','ETCH','ECHO','VOID','CIPHER','GLYPH','HEX','STRIPE','SHRED'];
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
function random(seed){return()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t^=t+Math.imul(t^t>>>7,61|t);return((t^t>>>14)>>>0)/4294967296};}
const runes=['00100011101010111111001000010000100','10001101010111000100011101010110001','00100001001111100100111110010000100','11111100001010000100010100001000001','00100010101000100100100010101000100','11111100011010110101101011000111111'];
const hexGlyphs=['01110100011001110101110011000101110','00100011000010000100001000010001110','01110100010000100010001000100011111','11110000010000101110000010000111110','00010001100101010010111110001000010','11111100001111000001000011000101110','00110010001000011110100011000101110','11111000010001000100010000100001000','01110100011000101110100011000101110','01110100011000101111000010001001100','01110100011000111111100011000110001','11110100011000111110100011000111110','01111100001000010000100001000001111','11110100011000110001100011000111110','11111100001000011110100001000011111','11111100001000011110100001000010000'];
export function applyDreamEffect(im,a,w,h,type,seed,time,target,colors){
  if(!dreamEffects.includes(type))return;
  const data=im.data,original=data.slice(),r=random(seed+731),sample=(x,y)=>clamp(Math.floor(y),0,h-1)*w+clamp(Math.floor(x),0,w-1),cell=Math.max(4,Math.round(w/55));
  const paint=(k,role)=>{for(let c=0;c<3;c++)data[k*4+c]=colors[role][c];},copy=(k,j)=>{for(let c=0;c<3;c++)data[k*4+c]=original[j*4+c];};
  const gradient=(x,y)=>Math.abs(a[sample(x+1,y)]-a[sample(x-1,y)])+Math.abs(a[sample(x,y+1)]-a[sample(x,y-1)]);
  if(['CIPHER','GLYPH','HEX','STRIPE'].includes(type)){
    const scale=Math.max(1,Math.round(w/300)),cw=6*scale,ch=8*scale;
    for(let y=0;y<h;y+=ch)for(let x=0;x<w;x+=cw){let sum=0,count=0;for(let yy=y;yy<Math.min(h,y+ch);yy++)for(let xx=x;xx<Math.min(w,x+cw);xx++){sum+=a[yy*w+xx];count++;}const tone=sum/count,q=r(),bits=type==='GLYPH'?runes[Math.floor(q*runes.length)]:type==='HEX'?hexGlyphs[Math.min(15,Math.floor(tone/16))]:q<.5?hexGlyphs[0]:hexGlyphs[1];
      for(let yy=y;yy<Math.min(h,y+ch);yy++)for(let xx=x;xx<Math.min(w,x+cw);xx++){const k=yy*w+xx;if(!target(k))continue;const gx=Math.floor((xx-x)/scale),gy=Math.floor((yy-y)/scale),on=type==='STRIPE'?gx<Math.max(1,Math.round((255-tone)/255*5))&&gy<7:gx<5&&gy<7&&bits[gy*5+gx]==='1';paint(k,on?(tone>150?2:1):0);}
    }return;
  }
  if(type==='BLOCK'||type==='SHRED'||type==='DECAY'){
    const step=type==='SHRED'?Math.max(3,Math.round(w/90)):cell*2;
    for(let y=0;y<h;y+=type==='SHRED'?h:step)for(let x=0;x<w;x+=step){const q=r(),dx=(r()-.5)*w*.12,dy=(r()-.5)*h*.04,cx=Math.min(w-1,x+Math.floor(step/2)),cy=Math.min(h-1,y+Math.floor(step/2)),anchor=sample(cx,cy);
      for(let yy=y;yy<Math.min(h,y+(type==='SHRED'?h:step));yy++)for(let xx=x;xx<Math.min(w,x+step);xx++){const k=yy*w+xx;if(!target(k))continue;if(type==='SHRED'){if(q<.55)copy(k,sample(xx+dx,yy+dy));}else if(type==='BLOCK'){if(q<.6)copy(k,anchor);}else if(q<.1+a[k]/255*.16&&((xx+yy+seed)%5!==0))paint(k,0);}
    }return;
  }
  const shift=Math.max(2,Math.round(w*.014)),phase=seed%97,pulse=1+.12*Math.sin(time*.7+phase),voids=Array.from({length:4},()=>({x:r()*w,y:r()*h,rad:cell*(2+r()*4)}));
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const k=y*w+x;if(!target(k))continue;
    if(type==='GHOST'){const j=sample(x-shift*pulse,y-2),j2=sample(x-shift*2,y+2);for(let c=0;c<3;c++)data[k*4+c]=Math.round(original[k*4+c]*.58+original[j*4+c]*.28+original[j2*4+c]*.14);}
    if(type==='BLEED'){const trail=3+Math.floor((Math.sin(Math.floor(x/cell)*7+phase)+1)*h*.025);if(a[k]<170)copy(k,sample(x,y-trail));}
    if(type==='SCAN'){const band=Math.floor(y/(cell*3)),q=random(seed+band*137)();if(q<.35)copy(k,sample(x+(q-.5)*w*.09*pulse,y));if(y%cell===0)for(let c=0;c<3;c++)data[k*4+c]=Math.round(data[k*4+c]*.8+colors[0][c]*.2);}
    if(type==='ETCH'){const g=gradient(x,y);paint(k,g>40||((x+y)%7<2&&a[k]<135)?1:0);}
    if(type==='ECHO'){const near=gradient(x-shift,y),far=gradient(x-shift*2,y);if(near>65||far>90)paint(k,2);}
    if(type==='VOID'){if(voids.some(v=>Math.hypot(x-v.x,(y-v.y)*.8)<v.rad*(1+.12*Math.sin(x*.2+y*.3))))paint(k,0);}
  }
}
export function blurField(field,w,h,radius){
  const tmp=new Float32Array(field.length),out=new Float32Array(field.length),span=radius*2+1;
  for(let y=0;y<h;y++){let sum=0;for(let d=-radius;d<=radius;d++)sum+=field[y*w+clamp(d,0,w-1)];for(let x=0;x<w;x++){tmp[y*w+x]=sum/span;sum+=field[y*w+clamp(x+radius+1,0,w-1)]-field[y*w+clamp(x-radius,0,w-1)];}}
  for(let x=0;x<w;x++){let sum=0;for(let d=-radius;d<=radius;d++)sum+=tmp[clamp(d,0,h-1)*w+x];for(let y=0;y<h;y++){out[y*w+x]=sum/span;sum+=tmp[clamp(y+radius+1,0,h-1)*w+x]-tmp[clamp(y-radius,0,h-1)*w+x];}}return out;
}
export function applyHalo(im,a,marks,w,h,amount,colors,allowed=()=>true){
  if(amount<=0)return;
  const field=new Float32Array(a.length),strength=clamp(amount,0,100)/100,histogram=new Uint32Array(256);for(const v of a)histogram[clamp(Math.round(v),0,255)]++;let cumulative=0,cutoff=145;for(let i=0;i<256;i++){cumulative+=histogram[i];if(cumulative>=a.length*.85){cutoff=clamp(i,145,210);break;}}
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const k=y*w+x;if(!allowed(k))continue;const g=Math.abs(a[y*w+Math.min(w-1,x+1)]-a[y*w+Math.max(0,x-1)])+Math.abs(a[Math.min(h-1,y+1)*w+x]-a[Math.max(0,y-1)*w+x]);field[k]=Math.max((Math.max(0,a[k]-cutoff)/(255-cutoff))**2*(.12+Math.min(1,g/60)*.88),marks[k]===3?1:marks[k]===2?.55:0);}
  const near=blurField(field,w,h,Math.max(1,Math.round(w*.008))),far=blurField(field,w,h,Math.max(2,Math.round(w*(.018+strength*.025))));
  const luminance=c=>c[0]*.2126+c[1]*.7152+c[2]*.0722,bright=colors.reduce((best,c)=>luminance(c)>luminance(best)?c:best,colors[0]),glow=colors[2].map((v,c)=>v*.7+bright[c]*.3);
  for(let k=0;k<a.length;k++){if(!allowed(k))continue;const opacity=Math.min(.8,(near[k]*1.5+far[k]*3.5)*strength);for(let c=0;c<3;c++)im.data[k*4+c]=Math.round(im.data[k*4+c]*(1-opacity)+Math.max(im.data[k*4+c],glow[c])*opacity);}
}
