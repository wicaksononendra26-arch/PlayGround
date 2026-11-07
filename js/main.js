import * as THREE from 'three';

const $ = (id) => document.getElementById(id);
const canvas = $('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.65));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9bb7c8);
scene.fog = new THREE.Fog(0x9bb7c8, 170, 920);
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, .1, 1300);
const clock = new THREE.Clock();
scene.add(new THREE.HemisphereLight(0xc8e6ff, 0x605342, 2.0));
const sun = new THREE.DirectionalLight(0xffd5a0, 3.2);
sun.position.set(-180, 260, 100); sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024); sun.shadow.camera.left = -260; sun.shadow.camera.right = 260;
sun.shadow.camera.top = 260; sun.shadow.camera.bottom = -260; scene.add(sun);

let elapsed = 0, lastUi = 0, toastUntil = 0, playing = false, paused = false;
let selectedEvent = 'free', eventStarted = false, eventTime = 0, finishAt = 0, checkpoint = 0;
let cameraMode = 1, driveMode = 'normal', speed = 0, yaw = 0, lateral = 0, nitro = 100;
let driftScore = 0, driftTime = 0, combo = 1, driftActive = false;
let quality = 'auto', soundOn = true, shakeOn = true;
const input = { left:false, right:false, throttle:false, brake:false, handbrake:false, nitro:false };
const traffic = [], raceCars = [], cityRoute = [], mountainRoute = [];
let player;
const mat = (color, roughness=.8, metalness=0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
const materials = {
  road: mat(0x30363a), sidewalk: mat(0x82877f), grass: mat(0x687a59), line: mat(0xe4d6ad),
  building: [0x9a8f7e,0x69757a,0xb7a58d,0x62676b,0x8c8176,0xc0b398].map(c=>mat(c)),
  glass: new THREE.MeshStandardMaterial({color:0x355263,roughness:.27,metalness:.35}),
  tire: mat(0x17191b),
  car: [0xef632b,0x1e8fb3,0xe5e1d7,0x8c3444,0x4c9a69,0x262b35,0xd7ae39].map(c=>new THREE.MeshStandardMaterial({color:c,roughness:.34,metalness:.28}))
};
function mesh(geometry, material, parent=scene, x=0,y=0,z=0){const m=new THREE.Mesh(geometry,material);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
function box(parent, material, x,y,z, sx,sy,sz){return mesh(new THREE.BoxGeometry(sx,sy,sz),material,parent,x,y,z);}
function showToast(html, duration=1100){const el=$('center-toast');el.innerHTML=html;el.classList.add('show');toastUntil=performance.now()+duration;}
function formatTime(seconds){const m=Math.floor(seconds/60),s=seconds%60;return `${String(m).padStart(2,'0')}:${s.toFixed(2).padStart(5,'0')}`;}
function makeCar(colorIndex=0, scale=1){
  const root=new THREE.Group(), paint=materials.car[colorIndex%materials.car.length], wheels=[];
  const shell=new THREE.Group();root.add(shell);
  box(shell,paint,0,.68,0,1.9,.55,3.8);
  box(shell,paint,0,1.03,-.27,1.52,.55,1.95);
  const cabin=box(shell,materials.glass,0,1.39,-.32,1.34,.62,1.56);cabin.castShadow=false;
  box(shell,mat(0x20272a,.4),0,1.72,-.3,1.4,.08,1.62);
  box(shell,mat(0xffe6aa,.25),-.62,.76,-1.92,.38,.2,.05);box(shell,mat(0xffe6aa,.25),.62,.76,-1.92,.38,.2,.05);
  box(shell,mat(0xe94434,.3),-.62,.75,1.92,.38,.18,.05);box(shell,mat(0xe94434,.3),.62,.75,1.92,.38,.18,.05);
  for(const x of [-.99,.99])for(const z of [-1.22,1.22]){const wheel=new THREE.Group();wheel.position.set(x,.43,z);shell.add(wheel);const tire=mesh(new THREE.CylinderGeometry(.42,.42,.27,12),materials.tire,wheel);tire.rotation.z=Math.PI/2;wheels.push(wheel);}
  root.scale.setScalar(scale);scene.add(root);return {root,wheels,shell};
}

// A broad road grid gives the downtown a readable, drivable layout.
mesh(new THREE.PlaneGeometry(1500,1700),materials.grass).rotation.x=-Math.PI/2;
for(let v=-300;v<=300;v+=100){
  const roadV=mesh(new THREE.PlaneGeometry(1000,18),materials.road);roadV.rotation.x=-Math.PI/2;roadV.position.set(0,.015,v);
  const roadH=mesh(new THREE.PlaneGeometry(18,1000),materials.road);roadH.rotation.x=-Math.PI/2;roadH.position.set(v,.018,0);
  for(let n=-4;n<=4;n++){
    const dash1=box(scene,materials.line,v+n*2.15,.04,-300,.12,.02,6);
    dash1.rotation.y=Math.PI/2;
  }
  for(let n=-4;n<=4;n++)box(scene,materials.line,0,.04,v+n*2.1,6,.02,.12);
  for(const side of [-1,1]){
    const curb=mesh(new THREE.PlaneGeometry(1000,2.4),materials.sidewalk);curb.rotation.x=-Math.PI/2;curb.position.set(0,.025,v+side*11);
    const curb2=mesh(new THREE.PlaneGeometry(2.4,1000),materials.sidewalk);curb2.rotation.x=-Math.PI/2;curb2.position.set(v+side*11,.025,0);
  }
}
// District blocks with varied heights, rooftops, and warm window bands.
let seed=417;
function random(){seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;}
for(let gx=-2;gx<=2;gx++)for(let gz=-2;gz<=2;gz++){
  const x=gx*100,z=gz*100;
  if((gx===0&&gz===0)||(Math.abs(gx)+Math.abs(gz)<2))continue;
  const count=3+Math.floor(random()*4);
  for(let i=0;i<count;i++){
    const bx=x+(random()-.5)*67,bz=z+(random()-.5)*67;
    if(Math.abs(bx-x)<17||Math.abs(bz-z)<17)continue;
    const w=10+random()*15,d=12+random()*17,h=12+random()*58;
    const building=box(scene,materials.building[Math.floor(random()*materials.building.length)],bx,h/2,bz,w,h,d);
    building.castShadow=h<55;
    box(scene,mat(0x42494a),bx,h+.3,bz,w*.86,.6,d*.86);
    if(h>26){for(let floor=4;floor<h-3;floor+=5){
      const windows=mat(random()>.55?0xbca77b:0x34434a,.45,.15);
      box(scene,windows,bx-w*.5-.012,floor,bz,w*.018,1.1,d*.62);
      box(scene,windows,bx+w*.5+.012,floor,bz,w*.018,1.1,d*.62);
    }}
  }
}
// Ridge backdrop and switchback mountain road.
cityRoute.push(...[[0,-35],[0,-100],[100,-100],[100,-200],[0,-200],[-100,-200],[-100,-100],[-200,-100],[-200,0]].map(([x,z])=>({x,z})));
mountainRoute.push(...[[0,-276],[-62,-330],[-122,-374],[-78,-420],[-8,-456],[70,-492],[8,-532],[-66,-574],[-5,-618],[76,-670],[20,-720]].map(([x,z])=>({x,z})));
for(let i=0;i<18;i++){
  const x=-330+i*39,z=-535-(random()*180),h=90+random()*130,r=65+random()*70;
  const hill=mesh(new THREE.ConeGeometry(r,h,7),mat(i%2?0x62765f:0x71816c),scene,x,h/2-7,z);hill.rotation.y=random()*Math.PI;
}
for(let i=0;i<mountainRoute.length-1;i++){
  const a=mountainRoute[i],b=mountainRoute[i+1],dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz),midX=(a.x+b.x)/2,midZ=(a.z+b.z)/2;
  const road=mesh(new THREE.PlaneGeometry(13,len),materials.road,scene,midX,.12,midZ);road.rotation.x=-Math.PI/2;road.rotation.z=Math.atan2(dx,dz);
  const railMat=mat(0xd2c7ae);
  for(const side of [-1,1]){const rail=box(scene,railMat,midX+side*7,.65,midZ,.22,.85,len);rail.rotation.y=Math.atan2(dx,dz);}
}
// Player, traffic and event rivals.
player=makeCar(0);player.root.position.set(0,0,14);
for(let i=0;i<24;i++){
  const t=makeCar(1+i%6,.82),axis=i%4;
  t.root.position.set(axis<2?[-100,100][axis%2]:((i%5)-2)*18,0,axis<2?((i%6)-3)*85:(axis===2?-100:100));
  t.axis=axis;t.speed=8+random()*8;traffic.push(t);
}
for(let i=0;i<3;i++){const c=makeCar(2+i,.9);c.root.position.set(-4+i*4,0,22+i*5);c.speed=28+random()*5;c.progress=0;raceCars.push(c);}
const gateGroup=new THREE.Group();scene.add(gateGroup);
const gateRing=new THREE.Mesh(new THREE.TorusGeometry(8,.42,8,36),new THREE.MeshBasicMaterial({color:0x42eaff}));gateRing.rotation.x=Math.PI/2;gateGroup.add(gateRing);
const gateGlow=new THREE.Mesh(new THREE.TorusGeometry(8,.1,6,36),new THREE.MeshBasicMaterial({color:0xffffff}));gateGlow.rotation.x=Math.PI/2;gateGroup.add(gateGlow);
const mapCanvas=$('minimap'),mapCtx=mapCanvas.getContext('2d');
function activeRoute(){return selectedEvent==='mountain'?mountainRoute:cityRoute;}
function updateGate(){const route=activeRoute(),p=route[checkpoint%route.length];gateGroup.position.set(p.x,1.3,p.z);gateGroup.visible=selectedEvent!=='free'&&!finishAt;}
function updateMinimap(){
 const c=mapCtx,w=mapCanvas.width,h=mapCanvas.height,cx=w/2,cy=h/2;c.clearRect(0,0,w,h);c.fillStyle='rgba(10,18,24,.92)';c.fillRect(0,0,w,h);
 c.save();c.translate(cx,cy);c.rotate(-yaw);const px=player.root.position.x,pz=player.root.position.z,scale=.48;
 c.strokeStyle='rgba(205,218,206,.38)';c.lineWidth=7;
 for(let x=-280;x<=280;x+=100){c.beginPath();c.moveTo((x-px)*scale,-320*scale);c.lineTo((x-px)*scale,320*scale);c.stroke();}
 for(let z=-280;z<=280;z+=100){c.beginPath();c.moveTo(-320*scale,(z-pz)*scale);c.lineTo(320*scale,(z-pz)*scale);c.stroke();}
 if(selectedEvent==='mountain'){c.strokeStyle='rgba(255,157,73,.8)';c.lineWidth=4;c.beginPath();mountainRoute.forEach((p,i)=>{const x=(p.x-px)*scale,y=(p.z-pz)*scale;i?c.lineTo(x,y):c.moveTo(x,y);});c.stroke();}
 traffic.forEach(t=>{const x=(t.root.position.x-px)*scale,y=(t.root.position.z-pz)*scale;if(Math.abs(x)<140&&Math.abs(y)<140){c.fillStyle='#ffcb6b';c.beginPath();c.arc(x,y,4.2,0,Math.PI*2);c.fill();}});
 if(selectedEvent!=='free'){const p=activeRoute()[checkpoint%activeRoute().length];c.fillStyle='#36e6ff';c.beginPath();c.arc((p.x-px)*scale,(p.z-pz)*scale,7,0,Math.PI*2);c.fill();}
 c.restore();c.fillStyle='#ff7a28';c.beginPath();c.moveTo(cx,cy-11);c.lineTo(cx-7,cy+7);c.lineTo(cx+7,cy+7);c.closePath();c.fill();
}
function isOffroad(x,z){const city=Math.abs(x)<285&&Math.abs(z)<285&&(Math.abs(x%100)<10||Math.abs(z%100)<10);return !(city||Math.abs(x)<11&&Math.abs(z)<9||Math.abs(z)>275&&Math.abs(z)<760);}
function drivingTopSpeed(){return driveMode==='drift'?47:58;}
function updatePlayer(dt){
 const steer=(input.right?1:0)-(input.left?1:0),accelerating=input.throttle?1:0,braking=input.brake?1:0,drifting=driveMode==='drift'||input.handbrake;
 if(accelerating)speed+=(drifting?25:32)*dt;if(braking)speed-=speed>1?46*dt:20*dt;if(!accelerating&&!braking)speed*=Math.exp(-.32*dt);
 if(input.nitro&&nitro>0&&speed>3){speed+=34*dt;nitro=Math.max(0,nitro-24*dt);$('speedlines').classList.add('on');}else{nitro=Math.min(100,nitro+3.1*dt);$('speedlines').classList.remove('on');}
 speed=THREE.MathUtils.clamp(speed,-9,drivingTopSpeed());const factor=THREE.MathUtils.clamp(Math.abs(speed)/22,.16,1.2);
 yaw+=steer*(drifting?1.08:.78)*factor*dt*Math.sign(speed||1);
 const fx=-Math.sin(yaw),fz=-Math.cos(yaw);lateral+=steer*speed*dt*(drifting?1.45:.34);lateral*=Math.pow(drifting?.988:.91,dt*60);
 player.root.position.x+=(fx*speed+Math.cos(yaw)*lateral)*dt;player.root.position.z+=(fz*speed-Math.sin(yaw)*lateral)*dt;
 const p=player.root.position,offroad=isOffroad(p.x,p.z);if(offroad){speed*=Math.exp(-.85*dt);$('surface-indicator').textContent='OFFROAD';$('surface-indicator').classList.add('offroad');}else{$('surface-indicator').textContent=Math.abs(p.z)>275?'MOUNTAIN':'ASPHALT';$('surface-indicator').classList.remove('offroad');}
 if(Math.abs(p.x)>320||p.z>320||p.z< -760){speed*=.75;p.x=THREE.MathUtils.clamp(p.x,-320,320);p.z=THREE.MathUtils.clamp(p.z,-760,320);}
 let nearTraffic=false;for(const t of traffic){const dx=p.x-t.root.position.x,dz=p.z-t.root.position.z;if(dx*dx+dz*dz<12){nearTraffic=true;if(dx*dx+dz*dz<5){speed*=.78;p.x+=Math.sign(dx||1)*.12;}}}
 player.root.rotation.y=yaw+THREE.MathUtils.clamp(lateral*.014,-.23,.23)*(drifting?1:0);player.root.rotation.z=THREE.MathUtils.clamp(-steer*speed*.003,-.12,.12);
 player.wheels.forEach((w,i)=>{w.rotation.x+=speed*dt*1.6;if(i<2)w.rotation.y=steer*.36;});
 const angle=Math.atan2(Math.abs(lateral),Math.abs(speed)+.1),sliding=drifting&&Math.abs(speed)>7&&Math.abs(steer)>.04;driftActive=sliding;
 if(sliding){driftTime+=dt;driftScore+=Math.floor(Math.abs(speed)*angle*dt*60);combo=Math.min(5,1+driftTime*.28);}else if(driftTime>.35){driftTime=0;combo=1;}
 $('drift-indicator').textContent=sliding?'SLIDE':'GRIP';$('drift-indicator').classList.toggle('on',sliding);$('drift-score').textContent=Math.floor(driftScore).toLocaleString();$('drift-combo').textContent=`x${combo.toFixed(1)}`;$('drift-combo').classList.toggle('hot',combo>2);
 if(sliding&&driftTime<dt*2)showToast('<span class="accent">DRIFT</span> + SCORE',650);if(nearTraffic&&Math.abs(speed)>25)speed*=.997;
}
function updateTraffic(dt){for(const t of traffic){const p=t.root.position;if(t.axis<2){const sign=t.axis===0?-1:1,target=p.z+sign*t.speed*dt,near=traffic.some(o=>o!==t&&Math.abs(o.root.position.x-p.x)<5&&Math.abs(o.root.position.z-target)<8);t.speed=near?Math.max(0,t.speed-18*dt):Math.min(18,t.speed+7*dt);p.z+=sign*t.speed*dt;if(p.z>295)p.z=-295;if(p.z< -295)p.z=295;}else{const sign=t.axis===2?-1:1,target=p.x+sign*t.speed*dt,near=traffic.some(o=>o!==t&&Math.abs(o.root.position.z-p.z)<5&&Math.abs(o.root.position.x-target)<8);t.speed=near?Math.max(0,t.speed-18*dt):Math.min(18,t.speed+7*dt);p.x+=sign*t.speed*dt;if(p.x>295)p.x=-295;if(p.x< -295)p.x=295;}t.wheels.forEach(w=>w.rotation.x+=t.speed*dt*1.5);}}
function updateRace(dt){if(selectedEvent==='free'||!eventStarted||finishAt)return;eventTime+=dt;const route=activeRoute(),target=route[checkpoint%route.length],dx=target.x-player.root.position.x,dz=target.z-player.root.position.z;if(Math.hypot(dx,dz)<13){checkpoint++;if(checkpoint>=route.length)finishRace();else showToast(`CHECKPOINT <span class="accent">${String(checkpoint).padStart(2,'0')}</span>`,1100);}raceCars.forEach(c=>{const targetAI=route[Math.floor(c.progress/65)%route.length],desired=Math.atan2(-(targetAI.x-c.root.position.x),-(targetAI.z-c.root.position.z));let delta=THREE.MathUtils.euclideanModulo(desired-c.root.rotation.y+Math.PI,Math.PI*2)-Math.PI;c.root.rotation.y+=THREE.MathUtils.clamp(delta,-1.3*dt,1.3*dt);c.progress+=c.speed*dt;c.root.position.x-=Math.sin(c.root.rotation.y)*c.speed*dt;c.root.position.z-=Math.cos(c.root.rotation.y)*c.speed*dt;c.wheels.forEach(w=>w.rotation.x+=c.speed*dt*1.6);});$('race-timer').textContent=formatTime(eventTime);$('cp-count').textContent=`${Math.min(checkpoint+1,route.length)}/${route.length}`;$('race-pos').textContent='1 / 4';updateGate();}
function updateCamera(dt){const p=player.root.position;let targetPos=new THREE.Vector3(),look=new THREE.Vector3(p.x,p.y+1,p.z);if(cameraMode===0){const f=new THREE.Vector3(-Math.sin(yaw),0,-Math.cos(yaw));targetPos.copy(p).add(new THREE.Vector3(0,1.8,0)).addScaledVector(f,1.05);look.addScaledVector(f,24);}else if(cameraMode===1){const f=new THREE.Vector3(-Math.sin(yaw),0,-Math.cos(yaw));targetPos.copy(p).addScaledVector(f,-10).add(new THREE.Vector3(0,5.1,0));look.addScaledVector(f,9);}else{targetPos.set(13,18,36);look.set(0,0,0);}camera.position.lerp(targetPos,cameraMode===2?1:1-Math.exp(-dt*4.4));camera.lookAt(look);}
function updateHud(){const kmh=Math.round(Math.abs(speed)*3.6);$('speed-value').textContent=String(kmh).padStart(2,'0');$('gear-value').textContent=speed<-.5?'R':kmh<5?'N':String(Math.min(6,Math.floor(kmh/32)+1));$('drive-state').textContent=input.nitro&&nitro>0?'BOOST':driftActive?'SLIDING':speed>1?'DRIVE':'READY';$('nitro-pct').textContent=`${Math.round(nitro)}%`;$('nitro-fill').style.width=`${nitro}%`;$('nitro-fill').classList.toggle('low',nitro<22);$('mode-label').innerHTML=`<i>MODE</i><b>${driveMode.toUpperCase()}</b>`;$('mode-label').classList.toggle('drift',driveMode==='drift');$('camera-label').innerHTML=`<i>CAM</i><b>${['HOOD','FOLLOW','FIXED'][cameraMode]}</b>`;}
function finishRace(){finishAt=performance.now();eventStarted=false;$('result-time').textContent=formatTime(eventTime);$('result-best').textContent=formatTime(eventTime);$('result-pos').textContent='1st';$('result-title').textContent='Street king.';$('result').classList.remove('hidden');}
function action(name,down){if(name in input)input[name]=down;else if(down){if(name==='camera')toggleCamera();if(name==='mode')toggleMode();if(name==='reset'){player.root.position.set(0,0,14);speed=0;yaw=0;lateral=0;}if(name==='sound'){soundOn=!soundOn;showToast(`SOUND ${soundOn?'ON':'OFF'}`,700);}}}
function clearInput(){Object.keys(input).forEach(key=>input[key]=false);}
function bindControls(){
 const keyMap={ArrowLeft:'left',KeyA:'left',ArrowRight:'right',KeyD:'right',ArrowUp:'throttle',KeyW:'throttle',ArrowDown:'brake',KeyS:'brake',Space:'handbrake',ShiftLeft:'nitro',ShiftRight:'nitro'};
 window.addEventListener('keydown',e=>{
  if(keyMap[e.code]){e.preventDefault();action(keyMap[e.code],true);return;}
  if(e.repeat)return;
  if(e.code==='Escape'||e.code==='KeyP'){if(playing){setPaused(!paused);clearInput();}return;}
  if(e.code==='KeyC')action('camera',true);if(e.code==='KeyG')action('mode',true);if(e.code==='KeyR')action('reset',true);
 });
 window.addEventListener('keyup',e=>{if(keyMap[e.code]){e.preventDefault();action(keyMap[e.code],false);}});
 window.addEventListener('blur',clearInput);
 document.querySelectorAll('[data-action]').forEach(button=>{
  const name=button.dataset.action;
  button.addEventListener('pointerdown',e=>{e.preventDefault();button.setPointerCapture?.(e.pointerId);action(name,true);});
  for(const type of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(type,e=>{e.preventDefault();if(name in input)action(name,false);});
  button.addEventListener('contextmenu',e=>e.preventDefault());
 });
 $('event-cards').querySelectorAll('[data-event]').forEach(card=>{
  const choose=()=>{selectedEvent=card.dataset.event;$('event-cards').querySelectorAll('.event-card').forEach(item=>item.classList.toggle('selected',item===card));};
  card.addEventListener('click',choose);card.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();choose();}});
 });
 $('start-btn').addEventListener('click',()=>startGame(selectedEvent));
 $('pause-btn').addEventListener('click',()=>{setPaused(true);clearInput();});
 $('resume-btn').addEventListener('click',()=>setPaused(false));
 $('restart-btn').addEventListener('click',()=>startGame(selectedEvent));
 $('freeroam-btn').addEventListener('click',()=>startGame('free'));
 $('menu-btn').addEventListener('click',showMenu);
 $('result-restart').addEventListener('click',()=>startGame(selectedEvent));
 $('result-free').addEventListener('click',()=>startGame('free'));
 $('result-menu').addEventListener('click',showMenu);
 document.querySelectorAll('[data-quality]').forEach(button=>button.addEventListener('click',()=>{
  quality=button.dataset.quality;document.querySelectorAll('[data-quality]').forEach(item=>item.classList.toggle('on',item===button));
  const ratio=quality==='low'?.8:quality==='medium'?1:Math.min(devicePixelRatio||1,quality==='high'?2:1.55);
  renderer.setPixelRatio(ratio);renderer.setSize(innerWidth,innerHeight);renderer.shadowMap.enabled=quality!=='low';
 }));
 document.querySelectorAll('[data-sound]').forEach(button=>button.addEventListener('click',()=>{
  soundOn=button.dataset.sound==='on';document.querySelectorAll('[data-sound]').forEach(item=>item.classList.toggle('on',item===button));
 }));
 document.querySelectorAll('[data-shake]').forEach(button=>button.addEventListener('click',()=>{
  shakeOn=button.dataset.shake==='on';document.querySelectorAll('[data-shake]').forEach(item=>item.classList.toggle('on',item===button));
 }));
}
function startGame(event=selectedEvent){
 selectedEvent=event;playing=true;paused=false;eventStarted=event!=='free';eventTime=0;finishAt=0;checkpoint=0;speed=0;lateral=0;driftScore=0;driftTime=0;combo=1;
 const start=event==='mountain'?mountainRoute[0]:{x:0,z:14};player.root.position.set(start.x,0,start.z);yaw=0;
 raceCars.forEach((car,i)=>{car.root.position.set(start.x+(i-1)*4,0,start.z+13+i*5);car.root.rotation.y=0;car.progress=0;});
 $('event-name').textContent=event==='free'?'FREE ROAM':event==='city'?'CITY SPRINT':'MOUNTAIN PASS';$('minimap-event').textContent=event==='mountain'?'PASS':'CITY';
 $('race-row').classList.toggle('hidden',event==='free');$('free-row').classList.toggle('hidden',event!=='free');$('hud').classList.remove('hidden');$('menu').classList.add('hidden');$('pause').classList.add('hidden');$('result').classList.add('hidden');
 clearInput();updateGate();if(event!=='free')showToast('GET READY',900);
}
function showMenu(){playing=false;paused=false;clearInput();$('hud').classList.add('hidden');$('pause').classList.add('hidden');$('result').classList.add('hidden');$('menu').classList.remove('hidden');}
function setPaused(value){paused=value;clearInput();$('pause').classList.toggle('hidden',!value);}
function toggleCamera(){cameraMode=(cameraMode+1)%3;showToast(['HOOD CAM','FOLLOW CAM','FIXED CAM'][cameraMode],700);}
function toggleMode(){driveMode=driveMode==='normal'?'drift':'normal';showToast(`${driveMode.toUpperCase()} MODE`,700);}
function animate(){requestAnimationFrame(animate);const dt=Math.min(clock.getDelta(),.05);elapsed+=dt;
 if(playing&&!paused){updateTraffic(dt);updatePlayer(dt);updateRace(dt);}
 if(performance.now()>toastUntil)$('center-toast').classList.remove('show');
 updateCamera(dt);if(elapsed-lastUi>.12){updateHud();if(playing)updateMinimap();lastUi=elapsed;}
 renderer.render(scene,camera);
}
function resize(){camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);}
function boot(){
 bindControls();camera.position.set(0,7,30);camera.lookAt(0,0,0);updateGate();updateMinimap();
 const bar=$('load-bar'),status=$('load-status');bar.style.width='100%';status.textContent='READY TO DRIVE';
 window.setTimeout(()=>{$('loader').classList.add('hidden');$('menu').classList.remove('hidden');},650);
 window.addEventListener('resize',resize);animate();
}
boot();
