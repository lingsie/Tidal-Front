/* Physical launch continuity, rigid lids, ammo depletion and reload regressions. */
import assert from 'node:assert/strict';
import {Renderer,launcherCell,launcherLidMatrix,launcherRoundOffset,missileFlightSample} from '../src/render.js';
import {Battle,BUILD,rocketTubeCount,missileTubeCount} from '../src/core.js';
const close=(a,b,message)=>assert.ok(Math.abs(a-b)<1e-5,`${message}: ${a} != ${b}`),length=a=>Math.hypot(...a),norm=a=>{let l=length(a);return a.map(v=>v/l)};
const ok={},gl=new Proxy({createShader:()=>ok,createProgram:()=>ok,createVertexArray:()=>ok,createBuffer:()=>ok,getShaderParameter:()=>true,getProgramParameter:()=>true,getUniformLocation:()=>0},{get:(t,k)=>k in t?t[k]:typeof k==='string'&&k.toUpperCase()===k?1:()=>{}});
const canvas={getContext:()=>gl,clientWidth:1100,clientHeight:820,getBoundingClientRect:()=>({left:0,top:0,width:1100,height:820})};
globalThis.devicePixelRatio=1;const view=new Renderer(canvas);
for(let type of ['missile','rocket'])for(let level=1;level<=10;level++){
 let count=type==='missile'?missileTubeCount(level):rocketTubeCount(level),b={id:22,type,lvl:level,x:1,z:2,hp:100,heading:.7},tick=0;
 for(let lane=0;lane<count;lane++){
  let cell=launcherCell(type,level,lane);assert.equal(cell.count,count);assert.ok(cell.caliber>0);
  if(type==='missile'&&level<=2){assert.ok(cell.caliber<.24,'early missile diameter must shrink');assert.ok(cell.bodyLength+cell.noseLength<1.8,'early missile must not overhang like the former three-meter round')}
  if(level>=6){let dimensions=null;for(let open of [0,.2,.5,.8,1]){let m=launcherLidMatrix(cell,open,.7,1,2),dims=[length([...m.slice(0,3)]),length([...m.slice(4,7)]),length([...m.slice(8,11)])];if(!dimensions)dimensions=dims;dims.forEach((v,i)=>close(v,dimensions[i],'opening must rotate a rigid plate without changing its dimensions'));assert.ok(dims[1]<=.009,'cover must stay paper thin')}}
  assert.equal(launcherRoundOffset(b,cell,tick),0,'full rack must start loaded');
 }
 b.rackShot={tick:0,lane:count-1,count,reload:150,spent:Array.from({length:count},(_,i)=>i*3)};
 for(let lane=0;lane<count;lane++){let cell=launcherCell(type,level,lane);assert.equal(launcherRoundOffset(b,cell,30),null,'every fired lane must remain physically empty');assert.ok(launcherRoundOffset(b,cell,125)>0,'rounds must slide along their launch axis while reloading');assert.equal(launcherRoundOffset(b,cell,150),0,'completed reload must restore the original loaded pose')}
 if(type==='missile'&&count>1){b.rackShot={tick:0,lane:0,count,reload:270,spent:[0]};assert.equal(launcherRoundOffset(b,launcherCell(type,level,0),1000),null,'spent first missile cannot refill while other cells are still loaded');for(let lane=1;lane<count;lane++)assert.equal(launcherRoundOffset(b,launcherCell(type,level,lane),1000),0,'unfired missile cells must retain their rounds')}
}
for(let type of ['missile','rocket'])for(let level of [1,2,3,5,6,7,10]){
 let fight=new Battle([{id:1,type:'hq',x:18,z:-13,lvl:10},{id:2,type,x:0,z:0,lvl:level}],789,'defense'),b=fight.base[1];fight.deploy('tank',0,false,10,6.5);let target=fight.units[0];target.cool=Infinity;b.heading=0;b.lockReady=true;b.lockStart=-100;b.targetId=target.id;
 fight.step();let shell=fight.projectiles[0];assert.ok(shell);assert.equal(shell.level,level);assert.equal(shell.heading,b.heading);assert.equal(b.rackShot.count,shell.tubeCount);assert.equal(b.rackShot.spent.length,shell.tubeCount===1||type==='rocket'?shell.tubeCount:1);
 let cell=launcherCell(type,level,shell.lane,shell.tubeCount),loaded=[],flying=[],round=view.launcherRound;view.currentBattle=fight;
 view.launcherRound=(cell,tail,axis,motor)=>flying.push({cell,tail,axis,motor});view.launcherFlight(shell,{...fight,tick:shell.start},b);view.launcherRound=round;
 let rotated=cell.tail;close(flying[0].tail[0],rotated[0],'flight starts from the actual lane');close(flying[0].tail[1],rotated[1],'flight starts at the same height as the loaded round');close(flying[0].tail[2],rotated[2],'flight starts on the actual rail');assert.equal(flying[0].cell.caliber,cell.caliber,'airborne round cannot change caliber');
 // Turning/destroying the source after launch must not teleport an airborne missile.
 b.heading=2;b.x=9;b.z=-7;view.launcherRound=(cell,tail,axis)=>loaded.push(tail);view.launcherFlight(shell,{...fight,tick:shell.start},b);view.launcherRound=round;flying[0].tail.forEach((v,i)=>close(v,loaded[0][i],'launch origin must stay fixed after source traverse'));
 let endCapture=[];view.launcherRound=(cell,tail,axis)=>endCapture.push({cell,tail,axis});view.launcherFlight(shell,{...fight,tick:shell.land},b);view.launcherRound=round;let end=endCapture[0],nose=end.tail.map((v,i)=>v+end.axis[i]*(end.cell.bodyLength+end.cell.noseLength));close(nose[0],type==='rocket'?shell.x:target.x,'projectile nose must meet target x at impact');close(nose[1],type==='rocket'?.20:.72,'projectile nose must meet the tank armor at impact');close(nose[2],type==='rocket'?shell.z:target.z,'projectile nose must meet target z at impact');
}
// A moving target may adjust guidance, but old smoke points cannot be pulled along with it.
{let source={id:2,type:'missile',x:0,z:0,lvl:7,heading:0},shell={weapon:'missile',source:2,level:7,lane:0,tubeCount:4,heading:0,fromX:0,fromZ:0,x:0,z:7,targetId:99,start:0,land:40},target={id:99,type:'rifle',x:0,z:7,hp:100},battle={tick:15,units:[target]};view.launcherFlight(shell,battle,source);let state=view.flightStates.get(shell),first={...state.points[0]};target.x=2;battle.tick=16;view.launcherFlight(shell,battle,source);assert.deepEqual(state.points[0],first,'previous exhaust must remain where the missile actually passed');let count=state.points.length;view.launcherFlight(shell,battle,source);assert.equal(state.points.length,count,'paused frames cannot accumulate smoke')}
{let cell=launcherCell('missile',1),origin=cell.tail,target=[0,.87,7],heights=Array.from({length:101},(_,i)=>missileFlightSample(origin,cell.axis,target,i/100).y);assert.ok(Math.max(...heights)<2.5,'guided missiles must not make the old mortar-height lob')}
// Old spent caps must not be re-ejected when a later missile is fired.
{let b={id:91,type:'missile',x:0,z:0,lvl:3,hp:100,heading:0,targetId:2,rackShot:{tick:300,lane:1,count:2,reload:270,spent:[0,300]}},caps=[],draw=view.drawMatrix;view.currentBattle={tick:303};view.drawMatrix=function(mesh,m,...args){if(mesh==='cyl'&&Math.abs(Math.hypot(m[4],m[5],m[6])-.008)<1e-5)caps.push(m);return draw.call(this,mesh,m,...args)};view.building(b);view.drawMatrix=draw;assert.equal(caps.length,1,'only the newly fired cell may throw a cap');assert.ok(caps[0][12]>0,'the second cap must come from the right-hand cell')}
console.log('Launcher geometry, compact rounds, rigid caps, empty racks, reload, muzzle continuity, guidance and smoke: OK');
