const DURATION=6,FPS=24;
let encoderLibrary;
function cancelled(signal){if(signal?.aborted)throw new DOMException('Export cancelled','AbortError');}
function nativeMime(){if(typeof MediaRecorder==='undefined')return null;return ['video/mp4;codecs=avc1.42E01E','video/mp4;codecs=avc1.42001f','video/mp4;codecs=avc1','video/mp4'].find(mime=>MediaRecorder.isTypeSupported(mime))||null;}
function library(){if(!encoderLibrary)encoderLibrary=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=new URL('./vendor/h264-mp4-encoder.web.js',import.meta.url).href;script.onload=()=>resolve(window.HME);script.onerror=()=>{encoderLibrary=null;script.remove();reject(new Error('MP4 ENCODER LOAD FAILED. RETRY.'));};document.head.append(script)});return encoderLibrary;}
function nativeExport(canvas,mime,{signal,onProgress}){return new Promise((resolve,reject)=>{
  const copy=document.createElement('canvas');copy.width=canvas.width+(canvas.width%2);copy.height=canvas.height+(canvas.height%2);const context=copy.getContext('2d');context.imageSmoothingEnabled=false;
  const draw=()=>{context.drawImage(canvas,0,0,copy.width,copy.height)};draw();
  const stream=copy.captureStream(FPS),parts=[];let recorder,pump=0,timer=0,done=false,began=performance.now();
  const cleanup=()=>{clearTimeout(timer);cancelAnimationFrame(pump);signal?.removeEventListener('abort',abort);stream.getTracks().forEach(t=>t.stop())};
  const fail=error=>{if(done)return;done=true;cleanup();if(recorder?.state==='recording')recorder.stop();reject(error)};
  const abort=()=>fail(new DOMException('Export cancelled','AbortError'));
  try{cancelled(signal);recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:6000000});recorder.ondataavailable=e=>{if(e.data.size)parts.push(e.data)};recorder.onerror=()=>fail(new Error('NATIVE MP4 ENCODING FAILED'));
  recorder.onstop=()=>{if(done)return;done=true;cleanup();if(parts.length)resolve(new Blob(parts,{type:'video/mp4'}));else reject(new Error('EMPTY MP4 OUTPUT'));};
  signal?.addEventListener('abort',abort,{once:true});recorder.start();stream.getVideoTracks()[0]?.requestFrame?.();
  const update=()=>{if(done)return;draw();onProgress?.(Math.min(1,(performance.now()-began)/(DURATION*1000)));pump=requestAnimationFrame(update)};pump=requestAnimationFrame(update);
  timer=setTimeout(()=>{if(recorder.state==='recording')recorder.stop()},DURATION*1000);
  }catch(error){fail(error)}
});}
export async function softwareExport(canvas,{signal,renderFrame,onProgress}){
  const HME=await library();cancelled(signal);const encoder=await HME.createH264MP4Encoder();
  const copy=document.createElement('canvas');copy.width=canvas.width+(canvas.width%2);copy.height=canvas.height+(canvas.height%2);const context=copy.getContext('2d',{willReadFrequently:true});context.imageSmoothingEnabled=false;
  try{encoder.width=copy.width;encoder.height=copy.height;encoder.frameRate=FPS;encoder.quantizationParameter=18;encoder.speed=5;encoder.initialize();
    for(let frame=0;frame<DURATION*FPS;frame++){cancelled(signal);await renderFrame(frame/FPS);context.drawImage(canvas,0,0,copy.width,copy.height);encoder.addFrameRgba(context.getImageData(0,0,copy.width,copy.height).data);onProgress?.((frame+1)/(DURATION*FPS));if(frame%3===0)await new Promise(resolve=>setTimeout(resolve,0));}
    cancelled(signal);encoder.finalize();return new Blob([encoder.FS.readFile(encoder.outputFilename)],{type:'video/mp4'});
  }finally{encoder.delete();}
}
export async function exportMp4(canvas,options){
  const mime=nativeMime();
  if(mime&&canvas.captureStream){try{return await nativeExport(canvas,mime,options)}catch(error){if(error.name==='AbortError')throw error;}}
  await options.onSoftwareStart?.();return softwareExport(canvas,options);
}
