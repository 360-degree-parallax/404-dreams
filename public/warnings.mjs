const phrases=[
'RLYEH CONNECTION REFUSED','AZATHOTH PROCESS AWAKENED','CTHULHU SIGNAL DETECTED','NYARLATHOTEP IDENTITY SPOOFED','YOGSOTHOTH GATEWAY OPEN','ELDER GOD MEMORY LEAK','DAGON PORT UNSEALED','SHOGGOTH THREAD MULTIPLIED','HASTUR NAME RESOLVED','DEEP ONES SESSION ACTIVE',
'ABYSS RETURNED NO ECHO','COSMIC ENTITY EXCEEDED LIMIT','FORBIDDEN STAR ALIGNED','VOID ORACLE LOST SYNC','TENTACLE SOCKET ENGAGED','BLACK SEA HANDSHAKE FAILED','NON EUCLIDEAN PATH FOUND','ELDRITCH CACHE CONTAMINATED','ANCIENT SLEEP INTERRUPTED','RLYEH DNS POISONED',
'CRYPT ACCESS DENIED','REQUIEM BUFFER OVERRUN','WRAITH SIGNATURE INVALID','SEPULCHRE KEY EXPIRED','CATACOMB ROUTE RECURSIVE','GRIMOIRE FILE CORRUPTED','SPECTRE AUTHENTICATION FAILED','OSSUARY INDEX OVERFLOW','MOURNING BELL OUT OF SYNC','CATHEDRAL CERTIFICATE REVOKED',
'COFFIN LOCK DISENGAGED','VEIL INTEGRITY LOST','BLACK MASS JOB SCHEDULED','GARGOYLE WATCHDOG SILENCED','BLOOD MOON CLOCK DRIFT','MAUSOLEUM PARTITION MOUNTED','FUNERAL PROCESS PENDING','RELIC CHECKSUM MISMATCH','CHAPEL SIGNAL NOT FOUND','EPITAPH WRITE PROTECTED',
'KERNEL PANIC IN THE VOID','DAEMON ESCAPED SANDBOX','NULL POINTER TO THE DEAD','PROTOCOL VIOLATION DETECTED','FAULT BEYOND RECOVERY','SEGMENT BELONGS TO NO ONE','BUFFER CONTAINS UNKNOWN LIFE','PROCESS REFUSES TERMINATION','STACK DESCENDS FOREVER','ROOT CREDENTIALS UNHOLY',
'BOOT SEQUENCE POSSESSED','UNTRUSTED ENTITY LOADED','INTERRUPT FROM THE ABYSS','HEAP REANIMATION DETECTED','SESSION HAS NO OWNER','SYSTEM CLOCK REVERSED','UNRECOGNIZED HEARTBEAT','FATAL DREAM EXCEPTION','BINARY WHISPERS DETECTED','RECOVERY IMAGE HAUNTED',
'DEAD HOST ANSWERED PING','GHOST IN THE MACHINE','NECROMANCER SERVICE STARTED','RITUAL TRANSACTION ABORTED','CURSED CERTIFICATE CHAIN','SOUL QUOTA EXCEEDED','COVEN CLUSTER OFFLINE','POSSESSION FLAG ENABLED','EXORCISM SERVICE UNAVAILABLE','NIGHTMARE QUEUE SATURATED',
'GRAVEYARD DAEMON RESPAWNED','CRYPTIC PAYLOAD UNSEALED','UNDEAD PROCESS FOUND','RLYEH KERNEL TAINTED','PHANTOM DEVICE CONNECTED','SACRIFICE TOKEN REJECTED','BLOOD ARCHIVE LOCKED','VOID DRIVER UNSIGNED','ELDRITCH FIRMWARE DETECTED','DARKNESS ENCRYPTION FAILED',
'DREAMER NOT FOUND','REALITY CHECKSUM FAILED','WAKE COMMAND DISABLED','SLEEP PARALYSIS ACTIVE','MIRROR RETURNED ANOTHER FACE','SHADOW HAS ROOT ACCESS','THOUGHTS STORED IN THE CRYPT','EYE CONTACT TIMED OUT','YOU ARE NOT THE OPERATOR','SOMETHING IS STILL LISTENING',
'NO EXIT NODE AVAILABLE','THIS DOOR WAS NOT HERE','OBSERVER COUNT INCREASED','THE EMPTY ROOM IS OCCUPIED','REM SLEEP SEGMENT CORRUPTED','MOUTH OF THE VOID OPENED','YOUR REFLECTION DISCONNECTED','DO NOT RESOLVE THIS NAME','THE DEAD REMEMBER YOUR KEY','DREAM ARCHIVE CANNOT CLOSE'
];
const leet={A:'4',E:'3',I:'1',O:'0',S:'5',T:'7'};
export const ERROR_MESSAGES=phrases.map(p=>p.replace(/\s/g,'').replace(/[AEIOST]/g,c=>leet[c]));
export function initWarnings(palette){
  let deck=[],last=-1,shake=null;const active=[];
  function message(){if(!deck.length){deck=ERROR_MESSAGES.map((_,i)=>i);for(let i=deck.length-1;i>0;i--){const j=crypto.getRandomValues(new Uint32Array(1))[0]%(i+1);[deck[i],deck[j]]=[deck[j],deck[i]];}if(deck.at(-1)===last)[deck[0],deck[deck.length-1]]=[deck.at(-1),deck[0]];}last=deck.pop();return ERROR_MESSAGES[last];}
  function float(){const colors=palette(),node=document.createElement('span');node.className='rift-warning';node.textContent=message();node.setAttribute('aria-hidden','true');node.style.color=colors[2];node.style.left=(8+Math.random()*26)+'vw';node.style.top=(55+Math.random()*25)+'vh';document.body.append(node);active.push(node);if(active.length>8)active.shift().remove();const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;if(!reduced){shake?.cancel();shake=document.body.animate([
{transform:'translate(0,0) rotate(0deg)'},
{transform:'translate(-7px,3px) rotate(-.2deg)',offset:.08},
{transform:'translate(8px,-4px) rotate(.25deg)',offset:.17},
{transform:'translate(-5px,-3px) rotate(-.15deg)',offset:.27},
{transform:'translate(6px,4px) rotate(.18deg)',offset:.38},
{transform:'translate(-4px,2px) rotate(-.12deg)',offset:.5},
{transform:'translate(3px,-3px) rotate(.08deg)',offset:.63},
{transform:'translate(-2px,1px) rotate(-.05deg)',offset:.76},
{transform:'translate(1px,-1px) rotate(0deg)',offset:.88},
{transform:'translate(0,0) rotate(0deg)'}
],{duration:520,easing:'steps(1,end)'});}const motion=node.animate([{transform:'translateY(0)'},{transform:reduced?'none':'translateY(-240px)'}],{duration:5000,easing:'linear'});motion.finished.catch(()=>{}).finally(()=>{node.remove();const i=active.indexOf(node);if(i>=0)active.splice(i,1);});}
  document.addEventListener('keydown',event=>{if((event.code!=='Space'&&event.key!==' ')||event.isComposing)return;const field=event.target.closest?.('input,[contenteditable="true"]');if(!field)event.preventDefault();if(!event.repeat)float();});
  const text=document.getElementById('guestText');
  text.addEventListener('beforeinput',event=>{if(event.data===' '&&!event.isComposing){event.preventDefault();float();}});
  text.addEventListener('input',event=>{if(event.isComposing)return;const start=text.selectionStart,end=text.selectionEnd,value=text.value,clean=value.replace(/[^\S\r\n]+/g,'');if(clean!==value){text.value=clean;text.setSelectionRange(value.slice(0,start).replace(/[^\S\r\n]+/g,'').length,value.slice(0,end).replace(/[^\S\r\n]+/g,'').length);}});
}
