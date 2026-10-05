/* Compare rendered hardware to actual shot origins, all levels and lanes. */
import assert from 'node:assert/strict';
import {Renderer,launcherCell,launcherRack,defenseMuzzle,unitMuzzle,muzzleWorld,gunboatMuzzle} from '../src/render.js';
import {Battle,BUILD,machineGunBarrelCount,cannonBarrelCount,impactLifetime} from '../src/core.js';
const close=(a,b,message)=>assert.ok(Math.abs(a-b)<1e-5,`${message}: ${a} != ${b}`),norm=a=>{let l=Math.hypot(...a);return a.map(v=>v/l)};
const ok={},gl=new Proxy({createShader:()=>ok,createProgram:()=>ok,createVertexArray:()=>ok,createBuffer:()=>ok,getShaderParameter:()=>true,getProgramParameter:()=>true,getUniformLocation:()=>0},{get:(t,k)=>k in t?t[k]:typeof k==='string'&&k.toUpperCase()===k?1:()=>{}});
globalThis.devicePixelRatio=1;const view=new Renderer({getContext:()=>gl,clientWidth:1100,clientHeight:820,getBoundingClientRect:()=>({left:0,top:0,width:1100,height:820})});
const capture=(draw)=>{let calls=[],original=view.segment;view.segment=function(...args){calls.push(args);return original.apply(this,args)};try{draw()}finally{view.segment=original}return calls};
const isColor=(c,w)=>w.every((v,i)=>c?.[i]===v),pointMatches=(a,b)=>a.every((q,i)=>Math.abs(q-b[i])<1e-5);
let minRailGap=Infinity;
for(let type of ['missile','rocket'])for(let level=1;level<=10;level++){
 let rack=launcherRack(type,level),calls=capture(()=>view.building({id:2,type,lvl:level,x:0,z:0,heading:0,hp:100})),color=type==='missile'?[.07,.50,.50]:[.15,.21,.23],rails=calls.filter(a=>a[0]==='box'&&a[7]===.10&&a[8]===.12&&isColor(a[9],color));assert.equal(rails.length,2,`${type} ${level}: both actual outer rails must exist`);
 for(let rail of rails)for(let cell of rack.cells){
  let dx=Math.abs(rail[1]-cell.dx),roundRadius=cell.exposed?cell.caliber*.90:cell.cellWidth*.57,railRadius=rail[7]/2,gap=dx-roundRadius-railRadius;assert.ok(gap>.06,`${type} ${level}: support rail must clear every tube, band and fin, got ${gap}`);minRailGap=Math.min(minRailGap,gap);
 }
 if(type==='rocket')for(let cell of rack.cells){assert.ok(cell.bodyLength+cell.noseLength<1.06,'rocket must fit a compact flight silhouette');assert.ok(cell.caliber<.13,'rocket diameter must shrink along with the body')}
 // Sample the actual moving rocket model, including its nose, throughout the entire flight.
 if(type==='rocket')for(let lane=0;lane<rack.cells.length;lane++){
  let cell=rack.cells[lane],shell={weapon:type,source:2,level,lane,tubeCount:cell.count,heading:.63,fromX:2,fromZ:-1,x:3.2,z:6.5,start:0,land:30};
  for(let step=0;step<=100;step++){
   let rendered=null,original=view.launcherRound;view.launcherRound=(c,tail,axis)=>rendered={c,tail,axis};view.launcherFlight(shell,{tick:step*.30,units:[]},null);view.launcherRound=original;
   let nose=rendered.tail.map((q,i)=>q+rendered.axis[i]*(rendered.c.bodyLength+rendered.c.noseLength));assert.ok(nose[1]>=.20-1e-6,'rocket nose cannot touch/bury into the ground before its landing tick');
   if(step===0){let loaded=muzzleWorld({point:cell.tip,axis:cell.axis},shell.heading,2,-1);nose.forEach((q,i)=>close(q,loaded.point[i],'rocket must start inside its own actual tube/rail'))}
   if(step===100)nose.forEach((q,i)=>close(q,[shell.x,.20,shell.z][i],'rocket nose must finish exactly at the scattered impact point'));
  }
 }
}
for(let type of ['sniper','mg','mortar','cannon'])for(let level=1;level<=10;level++)for(let heading of [0,.71,-1.42]){
 let count=type==='mg'?machineGunBarrelCount(level):type==='cannon'?cannonBarrelCount(level):1,b={id:2,type,lvl:level,x:2,z:-1,heading,hp:100},hardware=capture(()=>view.building(b));
 for(let lane=0;lane<count;lane++){
  let muzzle=muzzleWorld(defenseMuzzle(type,level,lane,count),heading,b.x,b.z),end=hardware.find(a=>a[0]==='cyl'&&pointMatches(a.slice(4,7),muzzle.point));assert.ok(end,`${type} Lv.${level} lane ${lane}: launch helper must match a rendered barrel endpoint`);
  let direction=norm(end.slice(4,7).map((q,i)=>q-end[1+i]));direction.forEach((q,i)=>close(q,muzzle.axis[i],`${type} muzzle direction must follow the real barrel`));
  let origin=null;
  if(type==='sniper'||type==='mg'){
   const segment=view.segment;view.segment=(...a)=>{if(a[0]==='cyl'&&a[9]?.[0]===1)origin=a.slice(4,7)};view.effects([{kind:'hit',weapon:type,fromX:b.x,fromZ:b.z,x:4,z:6,at:0,ttl:8,heading,level,lane,tubeCount:count,targetY:.72}],{tick:0,base:[b]});view.segment=segment;
  }else{
   const ordnance=view.ordnance;view.ordnance=(kind,x,y,z,dx,dy,dz,scale)=>origin=[x+dx*.34*scale,y+dy*.34*scale,z+dz*.34*scale];view.defenseFlight({weapon:type,source:2,heading,level,lane,tubeCount:count,fromX:b.x,fromZ:b.z,x:4,z:6,start:0,land:60},{tick:0,units:[]},b);view.ordnance=ordnance;
  }
  assert.ok(origin);origin.forEach((q,i)=>close(q,muzzle.point[i],`${type} animation must start at that same rendered muzzle`));
 }
}
for(let type of ['rifle','heavy','rocket','tank'])for(let heading of [0,.71,-1.42]){
 let u={id:22,type,x:2,z:-1,aimX:2+Math.sin(heading)*6,aimZ:-1+Math.cos(heading)*6,hp:100,maxHp:100,walk:0,runUntil:0},muzzle=muzzleWorld(unitMuzzle(type),heading,u.x,u.z),hardware=capture(()=>view.unit(u,0));assert.ok(hardware.some(a=>a[0]===(type==='rocket'?'cone':'cyl')&&pointMatches(a.slice(4,7),muzzle.point)),`${type}: unit muzzle must follow scaled weapon geometry`);
 let origin=null,segment=view.segment,ordnance=view.ordnance,round=view.launcherRound;
 view.segment=(...a)=>{if(a[0]==='cyl'&&a[9]?.[0]===1)origin=a.slice(4,7)};view.ordnance=(kind,x,y,z,dx,dy,dz,scale)=>origin=[x+dx*.34*scale,y+dy*.34*scale,z+dz*.34*scale];view.launcherRound=(cell,tail,axis)=>origin=tail.map((q,i)=>q+axis[i]*(cell.bodyLength+cell.noseLength));view.effects([{kind:'shot',weapon:type,fromX:u.x,fromZ:u.z,x:u.aimX,z:u.aimZ,heading,at:0,ttl:type==='heavy'?9:6}],{tick:0,base:[]});view.segment=segment;view.ordnance=ordnance;view.launcherRound=round;assert.ok(origin);origin.forEach((q,i)=>close(q,muzzle.point[i],`${type}: tracer/projectile must originate from its actual weapon`));
}
for(let heading of [0,.71,-1.42]){
 const source={x:2,z:-1,heading},time=4.5,aim=.34;view.time=time;const hardware=capture(()=>view.ship(2,-1,true,0,'rifle',0,heading,false,{heading:aim},10));
 for(let kind of ['fire','barrage'])for(let lane=0;lane<(kind==='fire'?2:10);lane++){
  let muzzle=gunboatMuzzle(source,kind,lane,aim,time);assert.ok(hardware.some(a=>a[0]==='cyl'&&pointMatches(a.slice(4,7),muzzle.point)),`${kind} lane ${lane}: ship muzzle must match actual visible tube/barrel`);
 }
}
// Real landing removes the flying round and creates a flash at exactly the same coordinate/tick.
for(let type of ['rocket','mortar','missile','cannon']){
 let fight=new Battle([{id:1,type:'hq',x:18,z:-13,lvl:10},{id:2,type,x:0,z:0,lvl:4}],789,'defense'),b=fight.base[1];fight.deploy('tank',0,false,10,6.5);let target=fight.units[0];target.cool=Infinity;b.heading=0;b.lockReady=true;b.lockStart=-100;b.targetId=target.id;fight.step();let shell=fight.projectiles[0];assert.ok(shell);b.cool=Infinity;while(fight.tick<shell.land)fight.step();assert.ok(!fight.projectiles.includes(shell));let event=fight.events.find(e=>e.kind==='blast'&&e.at===shell.land&&e.weapon===type);assert.ok(event);close(event.x,shell.x,'blast x must be the physical projectile impact x');close(event.z,shell.z,'blast z must be the physical projectile impact z');assert.equal(event.ttl,impactLifetime(type)-1);let flash=null,sphere=view.sphere;view.sphere=(...args)=>{if(args[4]?.[0]===1&&!flash)flash=args};view.effects([event],fight);view.sphere=sphere;assert.ok(flash,'impact must flash immediately on the landing tick');close(flash[0],event.x,'flash starts at impact x');close(flash[1],event.y,'flash starts at impact height');close(flash[2],event.z,'flash starts at impact z');
}

{let unit={id:2,type:'rocket',x:0,z:0,hp:100,maxHp:100,aimX:0,aimZ:6,walk:0,runUntil:0},round=view.launcherRound,loaded=0;view.launcherRound=()=>loaded++;unit.cool=0;view.unit(unit,0);assert.equal(loaded,1);unit.cool=38;view.unit(unit,1);assert.equal(loaded,1,'RPG cannot retain a dummy rocket after firing');unit.cool=0;view.unit(unit,39);assert.equal(loaded,2,'RPG ammunition returns after reload');view.launcherRound=round}
// A target killed by another weapon must leave a matching last-position impact, rather than return to its launch-time location.
for(let type of ['missile','cannon']){
 let fight=new Battle([{id:1,type:'hq',x:18,z:-13,lvl:10},{id:2,type,x:0,z:0,lvl:7}],789,'defense'),b=fight.base[1];fight.deploy('tank',0,false,10,6.5);let target=fight.units[0];target.cool=Infinity;b.heading=0;b.lockReady=true;b.lockStart=-100;b.targetId=target.id;fight.step();let shell=fight.projectiles[0];b.cool=Infinity;target.x=1.2;target.z=6.0;fight.step();const last=[shell.lastX,shell.lastY,shell.lastZ];assert.ok(last[0]>.9);target.hp=0;
 while(fight.tick<shell.land)fight.step();const event=fight.events.find(e=>e.weapon===type&&e.kind==='blast'&&e.at===shell.land);assert.ok(event);[event.x,event.y,event.z].forEach((q,i)=>close(q,last[i],'lost target must impact the last tracked position'));
}
console.log(`All Lv.1–10 defense barrels, troops and ship launchers align; rocket tips and immediate impacts align; minimum rail clearance ${minRailGap.toFixed(3)}: OK`);

// Smoke must survive after the initial flash, fade out fully, and stay deterministic across renders.
for(let weapon of ['missile','rocket','shipRocket']){
 let event={kind:'blast',weapon,x:2,z:3,y:weapon==='missile'?.72:.20,at:50,ttl:impactLifetime(weapon),fromX:-2,fromZ:-3},draw=view.drawMatrix;
 const sample=age=>{let calls=[];view.drawMatrix=(kind,matrix,color,emission=0,water=0,alpha=1,particle=0)=>calls.push({kind,matrix:[...matrix],color,emission,alpha,particle});try{view.effects([event],{tick:event.at+age})}finally{view.drawMatrix=draw}for(let a of calls){assert.ok(a.matrix.every(Number.isFinite),'all impact geometry must remain finite');assert.ok(a.alpha>=0&&a.alpha<=1,'particle alpha must stay valid')}return calls};
 let early=sample(0),late=sample(22);assert.ok(early.some(a=>a.color[0]===1&&a.emission>0),'flash starts on contact');assert.ok(late.some(a=>a.kind==='particle'&&a.particle===1&&a.alpha>0),'smoke persists after the fire');assert.ok(late.every(a=>a.emission===0),'late smoke cannot become a lingering fireball');assert.deepEqual(sample(22),late,'impact debris must not jitter or use simulation RNG');assert.equal(sample(impactLifetime(weapon)).length,0,'impact clears when its visual lifetime ends');
}
{
 let fight=new Battle([{id:1,type:'hq',x:0,z:0,lvl:10}],14,'attack');fight.deploy('rocket',0,false,10,4);let unit=fight.units[0];unit.x=0;unit.z=4;fight.step();let shot=fight.events.find(e=>e.kind==='shot');assert.ok(shot);unit.cool=Infinity;let life=fight.base[0].hp;for(let i=0;i<20;i++)fight.step();assert.equal(fight.base[0].hp,life,'lingering rocket smoke must not apply damage again');assert.ok(fight.events.includes(shot),'RPG impact must remain visible after its flight');
}
console.log('Layered impacts persist, fade, repeat deterministically and never repeat damage: OK');
