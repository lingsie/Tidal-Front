/* WebGL2 original procedural 3D renderer. Geometry, materials, scene, camera and animation are local. */
import {BUILD,SKILLS,MAP,idleWeaponHeading,rocketTubeCount,missileTubeCount,machineGunBarrelCount,cannonBarrelCount,impactLifetime,MAX_LANDING_CRAFT,shortestAngle} from './core.js?v=0.6.8.5';
const vertex=`#version 300 es
precision highp float;layout(location=0) in vec3 a_pos;layout(location=1) in vec3 a_normal;uniform mat4 u_view,u_model;uniform float u_time,u_water;out vec3 v_world,v_normal,v_local;void main(){v_local=a_pos;vec4 p=u_model*vec4(a_pos,1.);if(u_water>0.5)p.y+=.07*sin(p.x*1.7+u_time*1.6)+.07*sin(p.z*2.4-u_time*.9);v_world=p.xyz;v_normal=transpose(inverse(mat3(u_model)))*a_normal;gl_Position=u_view*p;}`;
const fragment=`#version 300 es
precision highp float;
in vec3 v_world,v_normal,v_local;
uniform vec3 u_color,u_eye;
uniform float u_water,u_emission,u_time,u_alpha,u_daylight,u_night,u_warm,u_sunlight,u_particle;
uniform int u_lightCount;
uniform vec4 u_lightPosRadius[24];
uniform vec4 u_lightColorStrength[24];
out vec4 outColor;
void main(){
 // Soft procedural particles use an irregular fading edge instead of opaque sphere silhouettes.
 if(u_particle>.5){
  vec2 p=v_local.xy*2.;float a=atan(p.y,p.x),r=length(p);
  float edge=r*(1.+.095*sin(a*5.+u_time*.8)+.065*sin(a*9.-u_time*.7));
  float density=(1.-smoothstep(.18,.98,edge))*(.84+.16*sin(p.x*11.+u_time)*sin(p.y*13.-u_time));
  if(density<.012)discard;
  vec3 color=u_color;
  if(u_particle>1.5){float core=pow(max(0.,1.-edge),2.4);color=mix(u_color,vec3(1.,.80,.36),core*.72);color*=.84+u_emission*.45;}
  else color*=mix(.62,1.,u_daylight);
  outColor=vec4(pow(max(color,vec3(0.)),vec3(.94)),density*u_alpha);return;
 }
 vec3 viewDir=normalize(u_eye-v_world),sun=normalize(vec3(-.42,.88,.48)),n=normalize(v_normal),col;
 if(u_water>.5){
  float x=v_world.x,z=v_world.z,t=u_time;
  float w1=sin(x*1.18+z*.28+t*1.15),w2=sin(z*1.72-x*.22-t*.82),w3=sin((x+z)*.53+t*.46);
  float wave=w1*.48+w2*.34+w3*.18;
  float dx=cos(x*1.18+z*.28+t*1.15)*.566+cos(z*1.72-x*.22-t*.82)*-.075+cos((x+z)*.53+t*.46)*.095;
  float dz=cos(x*1.18+z*.28+t*1.15)*.134+cos(z*1.72-x*.22-t*.82)*.585+cos((x+z)*.53+t*.46)*.095;
  n=normalize(vec3(-dx,.95,-dz));
  float fresnel=pow(1.-max(0.,dot(n,viewDir)),3.),sunGlint=pow(max(0.,dot(reflect(-sun,n),viewDir)),72.);
  float bands=.5+.5*sin(z*.22+x*.07+t*.18);
  col=mix(vec3(.018,.25,.39),vec3(.035,.61,.68),.38+.22*bands+.13*wave);
  col=mix(col,vec3(.43,.82,.91),fresnel*.56);
  col+=vec3(1.,.88,.58)*sunGlint*1.25*u_sunlight;
  float crest=smoothstep(.62,1.0,wave)*(.35+.65*fresnel);
  col=mix(col,vec3(.78,.96,.92),crest*.38);
 }else{
  float diffuse=max(0.,dot(n,sun)),hemi=.5+.5*n.y,rim=pow(1.-max(0.,dot(n,viewDir)),3.);
  col=u_color*(.32+.67*diffuse*u_sunlight+.11*hemi)+vec3(.30,.24,.12)*pow(max(0.,dot(reflect(-sun,n),viewDir)),42.)*u_sunlight+u_color*rim*.055;
  float grain=.975+.025*sin(v_world.x*31.+v_world.y*19.+v_world.z*23.);
  col*=grain;
 }
 // Night keeps the coast, terrain and water readable: cool ambient fill replaces the old double blackout.
 col*=mix(.60,1.,u_daylight);
 if(u_water>.5)col+=vec3(.01,.04,.07)*u_night;
 else col+=u_color*.10*u_night;
 col*=mix(1.,u_water>.5?.94:.98,u_night);
 col=mix(col,col*vec3(.52,.72,1.12),u_night*.58);
 col=mix(col,col*vec3(1.16,.88,.67),u_warm*.48);
 if(u_water<.5){
 vec3 sunsetDir=normalize(vec3(-.72,.24,.54));
  float sunsetFacing=.20+.80*max(0.,dot(n,sunsetDir));
  float raisedSurface=smoothstep(.18,.72,v_world.y);
  float groundWarm=1.-smoothstep(.16,.42,v_world.y);
  col+=vec3(.88,.25,.035)*u_warm*(groundWarm*.48+raisedSurface*sunsetFacing*.88);
 }
 vec3 localLight=vec3(0.);
 for(int i=0;i<24;i++){
  if(i>=u_lightCount)break;
  vec3 delta=u_lightPosRadius[i].xyz-v_world;
  float radius=max(.01,u_lightPosRadius[i].w),dist=length(delta),falloff=1.-smoothstep(0.,1.,dist/radius);
  falloff*=falloff;
  vec3 lightDir=delta/max(dist,.001);
  float facing=.20+.80*max(0.,dot(n,lightDir));
  float waterShimmer=u_water>.5?.70+.30*sin(v_world.x*2.1+v_world.z*.8+u_time*2.):1.;
  localLight+=u_lightColorStrength[i].rgb*falloff*facing*u_lightColorStrength[i].a*u_night*waterShimmer;
 }
 col+=localLight/(vec3(1.)+localLight);
 // Shoulder-only night tone mapping contains overlapping lamps without crushing midtones.
 col=mix(col,col/(vec3(.82)+col*.18),u_night*.65);
 float fog=clamp(length(u_eye-v_world)/145.,0.,.25);
 float fogDay=smoothstep(.38,1.,u_daylight);
 vec3 fogColor=mix(vec3(.018,.05,.13),vec3(.57,.84,.88),fogDay);
 fogColor=mix(fogColor,vec3(.82,.48,.31),u_warm*.28);
 col=mix(col,fogColor,fog);
 vec3 emitted=u_color*u_emission,nightEmission=emitted*1.5;
 nightEmission=nightEmission/(vec3(.55)+nightEmission);
 col+=mix(emitted,nightEmission,u_night);
 outColor=vec4(pow(max(col,vec3(0.)),vec3(.94)),u_alpha);
}`;
function shader(gl,type,src){let s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));return s}
function vec(a,b,c){return [a,b,c]}function normalize(a){let n=Math.hypot(...a)||1;return a.map(v=>v/n)}function cross(a,b){return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]}function sub(a,b){return a.map((v,i)=>v-b[i])}function dot(a,b){return a.reduce((n,v,i)=>n+v*b[i],0)}
const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t)},lerp=(a,b,t)=>a+(b-a)*t,lerp3=(a,b,t)=>a.map((v,i)=>lerp(v,b[i],t));
export function fixtureLightLevel(phase='noon',progress=.5,key=0){let p=Math.max(0,Math.min(.999,progress??.5)),seed=Math.sin((Number(key)||0)*12.9898+78.233)*43758.5453,stagger=seed-Math.floor(seed);if(phase==='afternoon'){let on=.56+stagger*.28;return smooth((p-on)/.09)}if(phase==='night'){if(p<.62)return 1;let off=.69+stagger*.23;return 1-smooth((p-off)/.075)}return 0}
export function lightingAt(phase='noon',progress=.5){
 progress=Math.max(0,Math.min(.999,progress??.5));let q=smooth(progress),daylight=1,nightGlow=0,warmth=0;
 const day=[.63,.88,.95],dawn=[.20,.46,.66],sunset=[.48,.30,.25],deep=[.018,.05,.12];let sky=day;
 if(phase==='morning'){
  daylight=lerp(.50,1,q);nightGlow=lerp(.62,0,q);warmth=lerp(.10,0,q);sky=lerp3(dawn,day,q);
 }else if(phase==='afternoon'){
  daylight=lerp(1,.40,q);nightGlow=lerp(0,.78,q);warmth=lerp(0,.62,q);sky=lerp3(day,sunset,q);
 }else if(phase==='night'){
  if(progress<.35){let t=smooth(progress/.35);daylight=lerp(.40,.27,t);nightGlow=lerp(.78,1,t);warmth=lerp(.62,0,t);sky=lerp3(sunset,deep,t)}
  else if(progress<.65){daylight=.27;nightGlow=1;warmth=0;sky=deep}
  else{let t=smooth((progress-.65)/.35);daylight=lerp(.27,.50,t);nightGlow=lerp(1,.62,t);warmth=lerp(0,.10,t);sky=lerp3(deep,dawn,t)}
 }
 return {daylight,nightGlow,warmth,sky};
}
function mult(a,b){let out=new Float32Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++)for(let k=0;k<4;k++)out[c*4+r]+=a[k*4+r]*b[c*4+k];return out}
function perspective(fov,aspect,near,far){let f=1/Math.tan(fov/2),o=new Float32Array(16);o[0]=f/aspect;o[5]=f;o[10]=(far+near)/(near-far);o[11]=-1;o[14]=2*far*near/(near-far);return o}
function lookAt(eye,target){let z=normalize(sub(eye,target)),x=normalize(cross([0,1,0],z)),y=cross(z,x),o=new Float32Array(16);o[0]=x[0];o[1]=y[0];o[2]=z[0];o[4]=x[1];o[5]=y[1];o[6]=z[1];o[8]=x[2];o[9]=y[2];o[10]=z[2];o[12]=-dot(x,eye);o[13]=-dot(y,eye);o[14]=-dot(z,eye);o[15]=1;return {matrix:o,x,y,z}}
function model(x,y,z,sx,sy,sz,rot=0){let c=Math.cos(rot),s=Math.sin(rot),m=new Float32Array(16);m[0]=c*sx;m[2]=-s*sx;m[5]=sy;m[8]=s*sz;m[10]=c*sz;m[12]=x;m[13]=y;m[14]=z;m[15]=1;return m}
function segmentModel(ax,ay,az,bx,by,bz,sx,sz=sx){let mid=[(ax+bx)/2,(ay+by)/2,(az+bz)/2],axis=[bx-ax,by-ay,bz-az],length=Math.hypot(...axis)||.001,y=axis.map(v=>v/length),reference=Math.abs(y[1])<.94?[0,1,0]:[1,0,0],x=normalize(cross(reference,y)),z=normalize(cross(x,y)),m=new Float32Array(16);m[0]=x[0]*sx;m[1]=x[1]*sx;m[2]=x[2]*sx;m[4]=y[0]*length;m[5]=y[1]*length;m[6]=y[2]*length;m[8]=z[0]*sz;m[9]=z[1]*sz;m[10]=z[2]*sz;m[12]=mid[0];m[13]=mid[1];m[14]=mid[2];m[15]=1;return m}
function flightSample(ax,ay,az,bx,by,bz,t,arc=0){t=Math.max(0,Math.min(1,t));return {x:ax+(bx-ax)*t,y:ay+(by-ay)*t+arc*Math.sin(Math.PI*t),z:az+(bz-az)*t,dx:bx-ax,dy:by-ay+arc*Math.PI*Math.cos(Math.PI*t),dz:bz-az}}
// Rack and airborne rounds share their dimensions, colors and launch axis.
export function launcherCell(type,level,lane=0,count=null){
 let missile=type==='missile',exposed=level<=2,boxed=level>=6;
 count=Math.max(1,count??(missile?missileTubeCount(level):rocketTubeCount(level)));
 let columns=missile?(count===4?2:count):count===1?1:count===4?2:count===6?3:4,rows=Math.ceil(count/columns),row=Math.floor(lane/columns),column=lane%columns;
 let spacing=missile?(exposed?.48:columns===2?.58:.46):exposed?.43:boxed?.42:.44,dx=(column-(columns-1)/2)*spacing,lift=rows===1?0:(row-(rows-1)/2)*(missile||boxed?.34:.32);
 let y0=missile?(exposed?1.78:1.74+lift):1.56+lift,z0=missile?(exposed?-.15:-.43):-.35,y1=missile?2.41+lift:2.46+lift,z1=missile?.88:1.05,axis=normalize([0,missile?.67:.90,missile?1.31:1.40]);
 let width=missile?(boxed?.23:.19):count===1?.26:exposed?.14:boxed?.17:.16,cellWidth=missile?width:width*(boxed?1.42:1.30),cellDepth=missile?(boxed?.21:.19):width*(boxed?1.32:1.30);
 let scale=missile?(level===1?.58:.52):exposed?.48:.66,bodyLength=missile?(exposed?Math.hypot(.76,1.46)*scale:.76):(exposed?Math.hypot(.90,1.40):.94)*scale,noseLength=missile?(exposed?Math.hypot(.56,1.09)*scale:.18):(exposed?Math.hypot(.28,.44):.18)*scale,caliber=missile?(exposed?.39*scale:.13):(exposed?width:width*.91)*scale;
 if(exposed&&missile)axis=normalize([0,.76,1.46]);
 let length=bodyLength+noseLength,tail=exposed?[dx,y0,z0]:[dx,y1-axis[1]*(length+.012),z1-axis[2]*(length+.012)],tip=tail.map((v,i)=>v+axis[i]*length);
 return {type,level,lane,count,columns,row,column,dx,lift,y0,z0,y1:exposed?tip[1]:y1,z1:exposed?tip[2]:z1,axis,tail,tip,bodyLength,noseLength,caliber,exposed,boxed,cellWidth,cellDepth,side:column<columns/2?-1:1};
}
export function launcherRack(type,level){
 let count=type==='missile'?missileTubeCount(level):rocketTubeCount(level),cells=Array.from({length:count},(_,i)=>launcherCell(type,level,i,count)),axis=cells[0].axis,up=[0,axis[2],-axis[1]],radius=cell=>cell.exposed?cell.caliber*.90:cell.cellDepth*.57;
 let halfWidth=Math.max(...cells.map(cell=>Math.abs(cell.dx)+(cell.exposed?cell.caliber*.90:cell.cellWidth*.57))),bottom=Math.min(...cells.map(cell=>dot(cell.tail,up)-radius(cell))),rear=Math.min(...cells.map(cell=>dot([cell.dx,cell.y0,cell.z0],axis))),front=Math.min(...cells.map(cell=>dot(cell.tip,axis)));
 return {cells,axis,up,halfWidth,railX:halfWidth+.13,bottom,rear,front,point:(dx,along,vertical)=>[dx,axis[1]*along+up[1]*vertical,axis[2]*along+up[2]*vertical]};
}
export function defenseMuzzle(type,level=1,lane=0,count=null){
 if(type==='missile'||type==='rocket'){let cell=launcherCell(type,level,lane,count);return {point:cell.tip,axis:cell.axis}}
 if(type==='sniper')return {point:[0,1.98,1.72],axis:normalize([0,.01,.30])};
 if(type==='mortar')return {point:[0,2.35,1.06],axis:normalize([0,.15,.12])};
 if(type==='mg'){count=Math.max(1,count??machineGunBarrelCount(level));let columns=count>=4?2:count,rows=Math.ceil(count/columns),row=Math.floor(lane/columns),column=lane%columns;return {point:[(column-(columns-1)/2)*(count>=4?.52:.56),1.34+(rows-1)*.13-row*.26,1.83],axis:[0,0,1]}}
 count=Math.max(1,count??cannonBarrelCount(level));let span=count===1?0:count===2?.40:.60;return {point:[count===1?0:-span/2+span*lane/(count-1),1.22,2.24],axis:normalize([0,.01,.38])};
}
export function unitMuzzle(type){
 let scale=type==='tank'?.70:.62,local={rifle:[.43,1.02,1.16],heavy:[-.02,1.05,1.55],rocket:[-.30,1.39,1.52],tank:[0,1.10,2.19]}[type]||[0,1.02,.8],axis=type==='rifle'?normalize([.17,0,.32]):type==='rocket'?normalize([0,.01,.34]):normalize([0,type==='tank'?.01:0,1]);
 return {point:[local[0]*scale,.08+(local[1]-.08)*scale,local[2]*scale],axis};
}
export function unitRocketRound(){return {type:'rocket',exposed:false,caliber:.086,bodyLength:.38,noseLength:.15}}
export function muzzleWorld(muzzle,heading=0,x=0,z=0){let c=Math.cos(heading),s=Math.sin(heading),rotate=p=>[p[0]*c+p[2]*s,p[1],-p[0]*s+p[2]*c],point=rotate(muzzle.point);return {point:[x+point[0],point[1],z+point[2]],axis:rotate(muzzle.axis)}}
export function gunboatMuzzle(source,kind='fire',lane=0,turretHeading=0,time=0){
 let bob=Math.sin(time*1.55+source.x*.45)*.027;
 if(kind==='barrage'){let side=lane%2?1:-1,row=Math.floor(lane/2);return muzzleWorld({point:[side*1.27,.87+bob,-.59+row*.27],axis:normalize([side*.16,.09,-.17])},source.heading||0,source.x,source.z)}
 let turret=muzzleWorld({point:[0,0,-2.35],axis:[0,0,-1]},source.heading||0,source.x,source.z);return muzzleWorld({point:[lane%2?.18:-.18,.88+bob,-1.36],axis:[0,0,-1]},turretHeading,turret.point[0],turret.point[2]);
}
export function launcherRoundOffset(building,cell,tick){
 let shot=building.rackShot;if(!shot||shot.count!==cell.count)return 0;
 let age=tick-shot.tick,launchAge=cell.type==='rocket'?cell.lane*3:0;
 if(age<launchAge||cell.type==='missile'&&cell.lane>shot.lane)return 0;
 if(cell.type==='missile'&&shot.lane<cell.count-1)return null;
 let reload=Math.max(1,shot.reload),begin=reload*.72;
 if(age<begin)return null;
 return (1-smooth((age-begin)/Math.max(1,reload-begin)))*(cell.bodyLength+cell.noseLength);
}
export function launcherLidMatrix(cell,open=0,heading=0,x=0,z=0){
 let n=cell.axis,u=[1,0,0],v=[0,n[2],-n[1]],angle=smooth(open)*Math.PI*.62,c=Math.cos(angle),s=Math.sin(angle),side=cell.side,w=cell.cellWidth*1.06,d=cell.cellDepth*1.06,thickness=.008;
 let across=u.map((q,i)=>q*c-side*n[i]*s),normal=n.map((q,i)=>q*c+side*u[i]*s),center=[cell.dx+side*w/2,cell.y1+n[1]*.014,cell.z1+n[2]*.014].map((q,i)=>q-side*across[i]*w/2);
 let rotate=a=>[a[0]*Math.cos(heading)+a[2]*Math.sin(heading),a[1],-a[0]*Math.sin(heading)+a[2]*Math.cos(heading)],a=rotate(across),b=rotate(normal),e=rotate(v),p=rotate(center),m=new Float32Array(16);
 for(let i=0;i<3;i++){m[i]=a[i]*w;m[4+i]=b[i]*thickness;m[8+i]=e[i]*d}m[12]=x+p[0];m[13]=p[1];m[14]=z+p[2];m[15]=1;return m;
}
function makeSleeve(square=false){
 let vertices=[],points=square?[[-.5,-.5],[.5,-.5],[.5,.5],[-.5,.5]]:Array.from({length:20},(_,i)=>[Math.cos(i*Math.PI/10)*.5,Math.sin(i*Math.PI/10)*.5]),inner=square?.72:.77;
 for(let i=0;i<points.length;i++){let a=points[i],b=points[(i+1)%points.length],n=normalize([b[1]-a[1],0,a[0]-b[0]]),A=[a[0],-.5,a[1]],B=[b[0],-.5,b[1]],C=[b[0],.5,b[1]],D=[a[0],.5,a[1]],E=[a[0]*inner,-.5,a[1]*inner],F=[b[0]*inner,-.5,b[1]*inner],G=[b[0]*inner,.5,b[1]*inner],H=[a[0]*inner,.5,a[1]*inner];
  addFace(vertices,[A,B,C,A,C,D],n);addFace(vertices,[F,E,H,F,H,G],n.map(q=>-q));addFace(vertices,[D,C,G,D,G,H],[0,1,0]);addFace(vertices,[B,A,E,B,E,F],[0,-1,0]);
 }return vertices;
}
export function missileFlightSample(origin,axis,target,t,loft=0){
 // Accelerate along the actual rail, then bend gently toward the target without a mortar lob.
 t=Math.max(0,Math.min(1,t));let travel=.32*t+.68*t*t,range=Math.hypot(target[0]-origin[0],target[2]-origin[2]),reach=Math.min(2.8,Math.max(.65,range*.30)),endSlope=normalize(sub(target,origin)),finish=Math.min(1.1,range*.18),a=origin,b=origin.map((q,i)=>q+axis[i]*reach),d=target,c=d.map((q,i)=>q-endSlope[i]*finish),u=1-travel;
 let point=a.map((q,i)=>u*u*u*q+3*u*u*travel*b[i]+3*u*travel*travel*c[i]+travel**3*d[i]),direction=a.map((q,i)=>3*u*u*(b[i]-q)+6*u*travel*(c[i]-b[i])+3*travel*travel*(d[i]-c[i]));
 point[1]+=loft*Math.sin(Math.PI*travel)**2;direction[1]+=loft*Math.PI*Math.sin(2*Math.PI*travel);
 return {x:point[0],y:point[1],z:point[2],dx:direction[0],dy:direction[1],dz:direction[2]};
}
function makeBox(){let vertices=[],faces=[[[0,0,1],[[-.5,-.5,.5],[.5,-.5,.5],[.5,.5,.5],[-.5,.5,.5]]],[[0,0,-1],[[.5,-.5,-.5],[-.5,-.5,-.5],[-.5,.5,-.5],[.5,.5,-.5]]],[[1,0,0],[[.5,-.5,.5],[.5,-.5,-.5],[.5,.5,-.5],[.5,.5,.5]]],[[-1,0,0],[[-.5,-.5,-.5],[-.5,-.5,.5],[-.5,.5,.5],[-.5,.5,-.5]]],[[0,1,0],[[-.5,.5,.5],[.5,.5,.5],[.5,.5,-.5],[-.5,.5,-.5]]],[[0,-1,0],[[-.5,-.5,-.5],[.5,-.5,-.5],[.5,-.5,.5],[-.5,-.5,.5]]]];for(let [n,p] of faces)for(let i of [0,1,2,0,2,3])vertices.push(...p[i],...n);return vertices}
function makeCylinder(n=12,taper=1){let v=[];for(let i=0;i<n;i++){let a=i*2*Math.PI/n,b=(i+1)*2*Math.PI/n,ca=Math.cos(a),sa=Math.sin(a),cb=Math.cos(b),sb=Math.sin(b),na=normalize([ca,(1-taper)*.4,sa]),nb=normalize([cb,(1-taper)*.4,sb]);let A=[ca*.5,-.5,sa*.5],B=[cb*.5,-.5,sb*.5],C=[cb*.5*taper,.5,sb*.5*taper],D=[ca*.5*taper,.5,sa*.5*taper];for(let [p,no] of [[A,na],[B,nb],[C,nb],[A,na],[C,nb],[D,na]])v.push(...p,...no);for(let p of [[0,-.5,0],B,A])v.push(...p,0,-1,0);for(let p of [[0,.5,0],D,C])v.push(...p,0,1,0)}return v}
function makeSphere(){let v=[],rings=12,cols=20;for(let a=0;a<rings;a++)for(let j=0;j<cols;j++){let pts=[[a,j],[a+1,j],[a+1,j+1],[a,j],[a+1,j+1],[a,j+1]];for(let [i,k] of pts){let t=i*Math.PI/rings,p=k*2*Math.PI/cols,n=[Math.sin(t)*Math.cos(p),Math.cos(t),Math.sin(t)*Math.sin(p)];v.push(...n.map(q=>q*.5),...n)}}return v}
function makeParticle(){let v=[];for(let [x,y] of [[-.5,-.5],[.5,-.5],[.5,.5],[-.5,-.5],[.5,.5],[-.5,.5]])v.push(x,y,0,0,0,1);return v}
function coastPoint(a,rx,rz,cz){let c=Math.cos(a),t=Math.sin(a),irregular=1+.012*Math.sin(a*5+.7)+.008*Math.cos(a*9);return [rx*Math.sign(c)*Math.pow(Math.abs(c),.63)*irregular,cz+rz*Math.sign(t)*Math.pow(Math.abs(t),.63)*irregular]}
function addFace(vertices,points,normal){for(let p of points)vertices.push(...p,...normal)}
function islandDisc(rx,rz,cz,y){let v=[],N=64;for(let i=0;i<N;i++){let a=coastPoint(i*2*Math.PI/N,rx,rz,cz),b=coastPoint((i+1)*2*Math.PI/N,rx,rz,cz);addFace(v,[[0,y,cz],[a[0],y,a[1]],[b[0],y,b[1]]],[0,1,0])}return v}
function islandRing(innerX,innerZ,outerX,outerZ,cz,innerY,outerY){let v=[],N=64;for(let i=0;i<N;i++){let a=i*2*Math.PI/N,b=(i+1)*2*Math.PI/N,ia=coastPoint(a,innerX,innerZ,cz),ib=coastPoint(b,innerX,innerZ,cz),oa=coastPoint(a,outerX,outerZ,cz),ob=coastPoint(b,outerX,outerZ,cz),n=[0,1,0];addFace(v,[[ia[0],innerY,ia[1]],[oa[0],outerY,oa[1]],[ob[0],outerY,ob[1]]],n);addFace(v,[[ia[0],innerY,ia[1]],[ob[0],outerY,ob[1]],[ib[0],innerY,ib[1]]],n)}return v}
const ISLAND={sandX:22,sandZ:17.65,centerZ:-2.65,grassX:21,grassZ:16.2,beachInset:3.9,outerX:22.9,outerZ:18.4};
function grassPoint(a){let south=Math.max(0,Math.sin(a));return coastPoint(a,ISLAND.grassX,ISLAND.grassZ-ISLAND.beachInset*south,ISLAND.centerZ)}
function grassDisc(){let v=[],N=64;for(let i=0;i<N;i++){let a=grassPoint(i*2*Math.PI/N),b=grassPoint((i+1)*2*Math.PI/N);addFace(v,[[0,.145,-.3],[a[0],.145,a[1]],[b[0],.145,b[1]]],[0,1,0])}return v}
function coastBand(cliff,inner,outer,innerY,outerY){let v=[],N=64;for(let i=0;i<N;i++){let a=i*2*Math.PI/N,b=(i+1)*2*Math.PI/N;if((Math.sin((a+b)/2)<=.45)!==cliff)continue;let ia=inner(a),ib=inner(b),oa=outer(a),ob=outer(b);addFace(v,[[ia[0],innerY,ia[1]],[oa[0],outerY,oa[1]],[ob[0],outerY,ob[1]]],[0,1,0]);addFace(v,[[ia[0],innerY,ia[1]],[ob[0],outerY,ob[1]],[ib[0],innerY,ib[1]]],[0,1,0])}return v}
function rangeMesh(){let v=[],N=96;for(let i=0;i<N;i++){let a=i*2*Math.PI/N,b=(i+1)*2*Math.PI/N;addFace(v,[[Math.cos(a)*.945,0,Math.sin(a)*.945],[Math.cos(a),0,Math.sin(a)],[Math.cos(b),0,Math.sin(b)]],[0,1,0]);addFace(v,[[Math.cos(a)*.945,0,Math.sin(a)*.945],[Math.cos(b),0,Math.sin(b)],[Math.cos(b)*.945,0,Math.sin(b)*.945]],[0,1,0])}return v}
function makeHull(sections=[[-.5,.20],[-.34,.43],[.46,.50],[.5,.44]]){let v=[],bottom=.79;for(let i=0;i<sections.length-1;i++){let [za,wa]=sections[i],[zb,wb]=sections[i+1];for(let side of [-1,1]){let A=[side*wa,.35,za],B=[side*wb,.35,zb],C=[side*wb*bottom,-.35,zb],D=[side*wa*bottom,-.35,za],n=normalize([side,.22,za-zb]);addFace(v,[A,B,C],n);addFace(v,[A,C,D],n)}let tl=[-wa,.35,za],tr=[wa,.35,za],br=[wb,.35,zb],bl=[-wb,.35,zb],ul=[-wa*bottom,-.35,za],ur=[wa*bottom,-.35,za],vr=[wb*bottom,-.35,zb],vl=[-wb*bottom,-.35,zb];addFace(v,[tl,bl,br],[0,1,0]);addFace(v,[tl,br,tr],[0,1,0]);addFace(v,[ul,vr,vl],[0,-1,0]);addFace(v,[ul,ur,vr],[0,-1,0])}let [frontZ,frontW]=sections[0],[backZ,backW]=sections.at(-1),front=[[-frontW,.35,frontZ],[frontW,.35,frontZ],[frontW*bottom,-.35,frontZ],[-frontW*bottom,-.35,frontZ]],back=[[backW,.35,backZ],[-backW,.35,backZ],[-backW*bottom,-.35,backZ],[backW*bottom,-.35,backZ]];addFace(v,[front[0],front[1],front[2]],[0,0,-1]);addFace(v,[front[0],front[2],front[3]],[0,0,-1]);addFace(v,[back[0],back[1],back[2]],[0,0,1]);addFace(v,[back[0],back[2],back[3]],[0,0,1]);return v}
export const droneEra=level=>level<=2?'rough':level<=5?'industrial':level<=8?'modern':'future';
export function droneRotorSpec(level){let guarded=level>=6;return {guarded,x:guarded?.69:.60,z:guarded?.64:.56,guardDiameter:level>=9?.91:.86,guardHeight:level>=9?.17:.10,bladeDiameter:.64,innerRatio:.84}}
export function makeRotorGuard(n=48,innerRatio=.84){let v=[],outer=.5,inner=outer*innerRatio;for(let i=0;i<n;i++){let a=i*2*Math.PI/n,b=(i+1)*2*Math.PI/n,ca=Math.cos(a),sa=Math.sin(a),cb=Math.cos(b),sb=Math.sin(b);let A=[ca*outer,-.5,sa*outer],B=[cb*outer,-.5,sb*outer],C=[cb*outer,.5,sb*outer],D=[ca*outer,.5,sa*outer],E=[ca*inner,-.5,sa*inner],F=[cb*inner,-.5,sb*inner],G=[cb*inner,.5,sb*inner],H=[ca*inner,.5,sa*inner];for(let [point,normal] of [[A,[ca,0,sa]],[B,[cb,0,sb]],[C,[cb,0,sb]],[A,[ca,0,sa]],[C,[cb,0,sb]],[D,[ca,0,sa]],[E,[-ca,0,-sa]],[H,[-ca,0,-sa]],[G,[-cb,0,-sb]],[E,[-ca,0,-sa]],[G,[-cb,0,-sb]],[F,[-cb,0,-sb]]])v.push(...point,...normal);for(let face of [[D,C,G],[D,G,H]])addFace(v,face,[0,1,0]);for(let face of [[A,F,B],[A,E,F]])addFace(v,face,[0,-1,0])}return v}
export class Renderer{
	 constructor(canvas){this.canvas=canvas;this.gl=canvas.getContext('webgl2',{antialias:true,alpha:false});if(!this.gl)throw new Error('需要支持 WebGL2 的浏览器与显卡');let gl=this.gl,p=gl.createProgram();gl.attachShader(p,shader(gl,gl.VERTEX_SHADER,vertex));gl.attachShader(p,shader(gl,gl.FRAGMENT_SHADER,fragment));gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(p));this.p=p;this.loc=Object.fromEntries(['u_view','u_model','u_time','u_water','u_color','u_eye','u_emission','u_alpha','u_daylight','u_night','u_warm','u_sunlight','u_particle'].map(k=>[k,gl.getUniformLocation(p,k)]));this.meshes={rotorGuard:this.mesh(makeRotorGuard()),particle:this.mesh(makeParticle()),box:this.mesh(makeBox()),cyl:this.mesh(makeCylinder(20)),roof:this.mesh(makeCylinder(4,.08)),cone:this.mesh(makeCylinder(18,.05)),roundCell:this.mesh(makeSleeve()),boxCell:this.mesh(makeSleeve(true)),sphere:this.mesh(makeSphere()),oct:this.mesh(makeCylinder(10,.85)),sand:this.mesh(islandDisc(ISLAND.sandX,ISLAND.sandZ,ISLAND.centerZ,.035)),grass:this.mesh(grassDisc()),cliffTop:this.mesh(coastBand(true,grassPoint,a=>coastPoint(a,ISLAND.sandX,ISLAND.sandZ,ISLAND.centerZ),.145,.055)),rimBeach:this.mesh(coastBand(false,a=>coastPoint(a,ISLAND.sandX,ISLAND.sandZ,ISLAND.centerZ),a=>coastPoint(a,ISLAND.outerX,ISLAND.outerZ,ISLAND.centerZ),.035,-.49)),rimCliff:this.mesh(coastBand(true,a=>coastPoint(a,ISLAND.sandX,ISLAND.sandZ,ISLAND.centerZ),a=>coastPoint(a,ISLAND.outerX,ISLAND.outerZ,ISLAND.centerZ),.035,-.49)),range:this.mesh(rangeMesh()),hull:this.mesh(makeHull()),landingHull:this.mesh(makeHull([[-.5,.43],[-.36,.50],[.39,.50],[.5,.44]]))};let portrait=canvas.clientWidth<620&&canvas.clientWidth<canvas.clientHeight;this.angle=portrait?.08:.42;this.targetAngle=this.angle;this.pitch=.70;this.zoom=portrait?90:56;this.targetZoom=this.zoom;this.focusX=portrait?13:0;this.focusZ=portrait?1.0:1.2;this.targetFocusX=this.focusX;this.targetFocusZ=this.focusZ;this.cam=[0,0,0];this.time=0;this.launcherCovers=new Map;this.flightStates=new WeakMap;this.currentBattle=null;this.simulationAlpha=0;this.environmentPeriod='noon';this.environmentProgress=.5;this.environmentMinutes=12*60;this.daylight=1;this.nightGlow=0;this.warmth=0;this.sunlight=1;this.sky=[.63,.88,.95];gl.enable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);}
 mesh(data){let gl=this.gl,vao=gl.createVertexArray(),buf=gl.createBuffer();gl.bindVertexArray(vao);gl.bindBuffer(gl.ARRAY_BUFFER,buf);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),gl.STATIC_DRAW);gl.vertexAttribPointer(0,3,gl.FLOAT,false,24,0);gl.vertexAttribPointer(1,3,gl.FLOAT,false,24,12);gl.enableVertexAttribArray(0);gl.enableVertexAttribArray(1);gl.bindVertexArray(null);return {vao,count:data.length/6}}
 box(x,y,z,sx,sy,sz,col,rot=0,emission=0){this.draw('box',x,y,z,sx,sy,sz,col,rot,emission)}
 cyl(x,y,z,sx,sy,sz,col,rot=0,emission=0){this.draw('cyl',x,y,z,sx,sy,sz,col,rot,emission)}
 sphere(x,y,z,s,col,emission=0,alpha=1){this.draw('sphere',x,y,z,s,s,s,col,0,emission,0,alpha)}
 drawMatrix(which,matrix,col,emission=0,water=0,alpha=1,particle=0){let gl=this.gl,m=this.meshes[which];gl.uniformMatrix4fv(this.loc.u_model,false,matrix);gl.uniform3fv(this.loc.u_color,col);gl.uniform1f(this.loc.u_water,water);gl.uniform1f(this.loc.u_emission,emission);gl.uniform1f(this.loc.u_alpha,alpha);gl.uniform1f(this.loc.u_particle,particle);gl.bindVertexArray(m.vao);gl.drawArrays(gl.TRIANGLES,0,m.count)}
 draw(which,x,y,z,sx,sy,sz,col,rot=0,emission=0,water=0,alpha=1){this.drawMatrix(which,model(x,y,z,sx,sy,sz,rot),col,emission,water,alpha)}
 particle(x,y,z,width,height,col,alpha=1,fire=false,rot=0,ground=false){
  let basis=this.basis||{x:[1,0,0],y:[0,1,0],z:[0,0,1]},c=Math.cos(rot),s=Math.sin(rot),right=ground?[c,0,s]:basis.x.map((q,i)=>q*c+basis.y[i]*s),up=ground?[-s,0,c]:basis.y.map((q,i)=>q*c-basis.x[i]*s),normal=ground?[0,1,0]:basis.z,m=new Float32Array(16);
  for(let i=0;i<3;i++){m[i]=right[i]*width;m[4+i]=up[i]*height;m[8+i]=normal[i]}m[12]=x;m[13]=y;m[14]=z;m[15]=1;this.drawMatrix('particle',m,col,fire?.70:0,0,alpha,fire?2:1);
 }
	 segment(which,ax,ay,az,bx,by,bz,width,depth,col,emission=0,alpha=1){this.drawMatrix(which,segmentModel(ax,ay,az,bx,by,bz,width,depth??width),col,emission,0,alpha)}
 beam(ax,ay,az,bx,by,bz,width,col,depth=width,emission=0){this.segment('box',ax,ay,az,bx,by,bz,width,depth,col,emission)}
	 tube(ax,ay,az,bx,by,bz,width,col,emission=0){this.segment('cyl',ax,ay,az,bx,by,bz,width,width,col,emission)}
	 lampLevel(key=0){return fixtureLightLevel(this.environmentPeriod||'noon',this.environmentProgress??.5,key)}
	 spotlight(lampX,lampY,lampZ,farX,farY,farZ,spread=.78,intensity=1){let glow=Math.max(0,Math.min(1,intensity));if(glow<=.01)return;this.sphere(lampX,lampY,lampZ,.105,[1,.94,.72],1.08*glow);let gl=this.gl,haze=glow*(.12+.88*this.nightGlow),poolGlow=glow*(.34+.66*this.nightGlow),heading=Math.atan2(farX-lampX,farZ-lampZ);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE);gl.depthMask(false);this.segment('cone',farX,farY,farZ,lampX,lampY,lampZ,spread*1.04,spread*1.04,[1,.88,.60],.026*haze,.004+.007*haze);this.segment('cone',farX,farY,farZ,lampX,lampY,lampZ,spread*.34,spread*.34,[1,.95,.76],.052*haze,.006+.010*haze);for(let [scale,alpha] of [[1.08,.014],[.67,.026],[.31,.044]])this.draw('cyl',farX,.19,farZ,spread*scale*.68,.012,spread*scale*1.38,[1,.80,.43],heading,.08*poolGlow,0,alpha*poolGlow);gl.depthMask(true);gl.disable(gl.BLEND)}
	 ground(){let t=this.time;this.draw('box',0,-.86,0,160,.42,160,[.04,.52,.66],0,0,1);this.draw('rimBeach',0,0,0,1,1,1,[.94,.79,.55]);this.draw('rimCliff',0,0,0,1,1,1,[.31,.43,.42]);this.draw('sand',0,0,0,1,1,1,[.97,.82,.58]);this.draw('cliffTop',0,0,0,1,1,1,[.35,.50,.34]);this.draw('grass',0,0,0,1,1,1,[.36,.68,.29]);for(let i=0;i<34;i++){let a=i*6.283/34;if(Math.sin(a)>.45)continue;let p=coastPoint(a,21.35,17.05,ISLAND.centerZ);this.draw('oct',p[0],.26,p[1],.78+(i%3)*.17,.50,.66,[.40,.48,.45],a)}for(let i=0;i<52;i++){let x=Math.sin(i*7.7)*16.4,z=-12.2+Math.cos(i*8.3)*7.1;this.draw('oct',x,.19,z,.36+(i%3)*.06,.07,.34,[.30+(i%2)*.05,.70,.29])}for(let i=0;i<16;i++){let x=-17.5+i*2.34,z=-15.8+(i%3)*.52;this.palm(x,z,i*.6)}for(let i=0;i<18;i++){let x=-18.4+i*2.17,z=14.35+.14*Math.sin(i*1.5+t*.7);this.draw('oct',x,-.28,z,1.68,.045,.14,[.84,.99,.94],0,.23)}for(let i=0;i<17;i++){let x=-17.3+i*2.17,z=16.05+.13*Math.sin(i*1.9+t*.8);this.draw('oct',x,-.40,z,1.34,.035,.11,[.66,.96,.94],0,.11)}for(let i=0;i<15;i++){let x=Math.sin(i*5.1)*24,z=19.2+(i%4)*2.4+.2*Math.sin(t+i);this.draw('oct',x,-.50,z,.55+(i%3)*.28,.025,.10,[.78,.96,.94],i*.31,.09)} }
	 sunAmount(phase=this.environmentPeriod||'noon',p=Math.max(0,Math.min(.999,this.environmentProgress??.5))){if(phase==='night')return 0;if(phase==='afternoon')return 1-smooth((p-.55)/.40);if(phase==='morning')return smooth(p/.45);return 1}
	 skyLight(){let phase=this.environmentPeriod||'noon',p=Math.max(0,Math.min(.999,this.environmentProgress??.5)),visibility=this.sunAmount(phase,p),height=28,x=-27;if(visibility<=.005)return;if(phase==='morning'){height=-3+31*p;x=-31+8*p}else if(phase==='noon'){height=28;x=-23+4*p}else if(phase==='afternoon'){height=28-38*p;x=-19+12*p}else return;if(height<=.4)return;this.sphere(x,height,-67,6.4,[1,.50+.20*this.daylight,.12],2.2*visibility)}
 droneCraft(x,y,z,heading=0,level=1,loaded=true,flying=false,motion=null){
  let era=droneEra(level),spec=droneRotorSpec(level),c=Math.cos(heading),s=Math.sin(heading),point=(dx,dz)=>[x+dx*c+dz*s,z-dx*s+dz*c],body=era==='future'?[.16,.35,.40]:era==='modern'?[.35,.46,.39]:era==='industrial'?[.68,.43,.15]:[.47,.55,.34],trim=era==='future'?[.88,.91,.84]:[.89,.86,.66],metal=[.18,.25,.25],accent=era==='future'?[.28,.83,.86]:[.90,.67,.26];
  const box=(dx,dy,dz,sx,sy,sz,color,rot=0)=>{let [px,pz]=point(dx,dz);this.box(px,y+dy,pz,sx,sy,sz,color,heading+rot)};
  if(era==='future')this.draw('oct',x,y,z,.57,.23,.82,body,heading);else box(0,0,0,.55,.22,.79,body);
  box(0,.13,-.06,.38,.07,.54,trim);box(0,.01,.43,.26,.13,.16,[.08,.20,.24]);box(0,.015,.52,.12,.07,.05,era==='rough'?[.35,.49,.40]:[.27,.81,.82]);
  let alpha=this.simulationAlpha||0,rotorAngle=motion?.rotorAngle===undefined?(flying?((this.currentBattle?.tick??this.time*30)+alpha)*.85:0):(motion.previousRotorAngle??motion.rotorAngle)*(1-alpha)+motion.rotorAngle*alpha;
  for(let dx of [-spec.x,spec.x])for(let dz of [-spec.z,spec.z]){let [ax,az]=point(dx*.27,dz*.28),[px,pz]=point(dx,dz);this.segment('box',ax,y+.04,az,px,y+.07,pz,era==='future'?.075:.055,.07,metal);this.cyl(px,y+.13,pz,.16,.14,.16,body);if(spec.guarded){this.draw('rotorGuard',px,y+.21,pz,spec.guardDiameter,spec.guardHeight,spec.guardDiameter,body,heading);if(era==='future')this.draw('rotorGuard',px,y+.30,pz,spec.guardDiameter,.023,spec.guardDiameter,accent,heading,.15)}let rotor=heading+rotorAngle*(dx*dz>0?1:-1);this.box(px,y+.22,pz,spec.bladeDiameter,.025,.055,metal,rotor);this.box(px,y+.225,pz,.055,.025,spec.bladeDiameter,metal,rotor);this.cyl(px,y+.23,pz,.09,.04,.09,trim);box(dx*.50,-.20,dz*.55,.05,.29,.05,metal)}
  for(let side of [-1,1])box(side*.30,-.34,0,.05,.05,.56,metal);
  if(loaded){let [px,pz]=point(0,.09);this.draw('oct',px,y-.28,pz,.16,.23,.16,[.39,.46,.23]);this.cyl(px,y-.14,pz,.08,.07,.08,[.64,.62,.43])}
  for(let tier=2;tier<=level;tier++){let side=tier%2?1:-1;box(side*.28,.055,-.30+Math.floor((tier-2)/2)*.12,.045,.035,.06,accent)}
  if(era==='industrial')for(let dx of [-.20,.20])for(let dz of [-.24,.21]){let [px,pz]=point(dx,dz);this.cyl(px,y+.18,pz,.025,.025,.025,[.83,.68,.34])}
  if(era==='modern'){box(0,.17,-.28,.16,.035,.12,body);box(0,-.02,.53,.09,.055,.04,[.17,.23,.22])}
  if(era==='future')for(let side of [-1,1])box(side*.25,.10,-.10,.035,.025,.40,accent);
  if(level>=10){for(let side of [-1,1]){box(side*.23,.065,0,.07,.16,.63,trim);box(side*.19,.22,-.27,.045,.18,.25,body);box(side*.16,.175,.10,.045,.025,.28,accent);box(side*.20,.025,.47,.07,.085,.07,trim)}box(0,.17,.29,.26,.045,.13,body);box(0,-.14,0,.45,.025,.62,accent)}
 }

	 fleetDock(craftCount=3){
	  let count=Math.max(1,Math.min(MAX_LANDING_CRAFT,craftCount)),center=-2.65,length=Math.max(18,(count-1)*5.35+7.2),wood=[.49,.36,.23],edge=[.72,.58,.35],steel=[.25,.34,.34],rubber=[.10,.15,.16],lamp=[1,.70,.25];
	  // Shore access, long landing-craft quay and a separate deep-water warship berth.
	  this.box(20.15,.20,center,5.0,.28,2.05,wood);this.box(22.48,.20,center,1.36,.28,length,wood);this.box(26.08,.18,center,1.05,.25,10.7,wood);
	  this.box(22.48,.37,center,1.52,.07,length+.18,edge);this.box(26.08,.35,center,1.20,.07,10.88,edge);
	  for(let z=center-length/2+.65;z<=center+length/2-.4;z+=1.15){this.box(22.48,.41,z,1.42,.035,.055,[.84,.70,.44]);if(Math.round((z-center)*10)%3===0)this.cyl(22.48,-.13,z,.09,1.02,.09,steel)}
	  for(let side of [-1,1])for(let z=center-length/2+.55;z<=center+length/2-.35;z+=2.65){let x=22.48+side*.76;this.cyl(x,.23,z,.15,.52,.15,steel);this.draw('oct',x,.51,z,.25,.12,.25,edge);if(side===1)this.box(x+.16,.14,z,.13,.37,.72,rubber)}
	  for(let i=0;i<count;i++){let berth=this.homeBoatPosition(i,count),fingerZ=berth.z+2.68;this.box(23.45,.18,fingerZ,2.65,.22,.58,wood);this.box(24.63,.33,fingerZ,.22,.31,.74,edge);for(let x of [22.72,24.42])this.cyl(x,-.15,fingerZ,.08,.92,.08,steel)}
	  for(let z of [center-5.05,center+5.05]){this.box(27.00,.17,z,2.88,.22,.68,wood);this.box(28.26,.18,z,.27,.45,.86,rubber);for(let x of [26.28,27.82])this.cyl(x,-.18,z,.10,.95,.10,steel)}
	  let dockIndex=0;for(let z=center-length/2+1.05;z<=center+length/2-.7;z+=5.35){let level=this.lampLevel(810+dockIndex++);this.cyl(21.98,.77,z,.07,1.05,.07,steel);this.draw('oct',21.98,1.33,z,.30,.20,.30,level>.01?lamp:[.35,.35,.29],0,.05+level*1.72)}
	  for(let z of [center-4.55,center+4.55]){let level=this.lampLevel(860+dockIndex++);this.cyl(25.58,.75,z,.07,1.08,.07,steel);this.draw('oct',25.58,1.32,z,.31,.21,.31,level>.01?lamp:[.35,.35,.29],0,.05+level*1.72)}
	 }
	 bounds(){let x=MAP.buildX,front=MAP.maxZ,back=MAP.minZ,mid=(front+back)/2,length=front-back,col=[.08,.97,.76];for(let side of [-1,1]){this.box(side*x,.35,mid,.20,.13,length,col,0,.7);this.box(side*x,.68,front,.24,.70,.24,col,0,.7);this.box(side*x,.68,back,.24,.70,.24,col,0,.7)}this.box(0,.35,front,x*2,.13,.20,col,0,.7);this.box(0,.35,back,x*2,.13,.20,col,0,.7)}
 palm(x,z,phase){let sway=Math.sin(this.time*.7+phase)*.14;this.cyl(x,.55,z,.19,1.3,.19,[.55,.36,.22]);this.cyl(x+sway,1.21,z,.15,1,.15,[.59,.39,.23]);for(let k=0;k<5;k++){let a=k*6.28/5+phase;this.draw('cone',x+sway+Math.sin(a)*.53,1.56,z+Math.cos(a)*.53,.32,.25,1.45,[.17,.57+(.04*(k%2)),.27],a)} }
	 building(b,highlight=false,hostile=false){
		  const x=b.x,z=b.z,k=b.type,lvl=b.lvl||1,defense=!!BUILD[k]?.damage,locked=Number.isFinite(b.aimX)&&Number.isFinite(b.aimZ),heading=Number.isFinite(b.heading)?b.heading:locked?Math.atan2(b.aimX-x,b.aimZ-z):defense?idleWeaponHeading(this.time,b.id||0):0,c=Math.cos(heading),s=Math.sin(heading),place=(dx,dz)=>[x+dx*c+dz*s,z-dx*s+dz*c];
	  let launcherOpen=0;
  if((k==='missile'||k==='rocket')&&lvl>=6){
   let key=`${k}:${b.id??`${x}:${z}`}`,clock=this.currentBattle?(this.currentBattle.tick+Math.max(0,Math.min(.999,this.simulationAlpha||0)))/30:this.time,wanted=Number.isFinite(b.targetId)&&b.hp>0?1:0,state=this.launcherCovers.get(key);
   if(!state||state.owner!==b)state={value:0,at:clock,owner:b};
   let dt=Math.max(0,Math.min(.10,clock-state.at)),rate=wanted?2.5:2.85;
   state.value+=Math.sign(wanted-state.value)*Math.min(Math.abs(wanted-state.value),dt*rate);state.at=clock;this.launcherCovers.set(key,state);launcherOpen=state.value;
  }
	  const B=(dx,y,dz,sx,sy,sz,col,rot=0,glow=0)=>this.box(x+dx,y,z+dz,sx,sy,sz,col,rot,glow);
	  const C=(dx,y,dz,sx,sy,sz,col,rot=0)=>this.cyl(x+dx,y,z+dz,sx,sy,sz,col,rot);
	  const O=(dx,y,dz,sx,sy,sz,col,rot=0,glow=0)=>this.draw('oct',x+dx,y,z+dz,sx,sy,sz,col,rot,glow);
	  const R=(dx,y,dz,sx,sy,sz,col)=>this.draw('roof',x+dx,y,z+dz,sx,sy,sz,col,Math.PI/4);
	  const K=(dx,y,dz,sx,sy,sz,col)=>this.draw('cone',x+dx,y,z+dz,sx,sy,sz,col);
	  const TB=(dx,y,dz,sx,sy,sz,col,rot=0,glow=0)=>{let [px,pz]=place(dx,dz);this.box(px,y,pz,sx,sy,sz,col,heading+rot,glow)};
	  const TC=(dx,y,dz,sx,sy,sz,col,rot=0)=>{let [px,pz]=place(dx,dz);this.cyl(px,y,pz,sx,sy,sz,col,heading+rot)};
	  const TO=(dx,y,dz,sx,sy,sz,col,rot=0,glow=0)=>{let [px,pz]=place(dx,dz);this.draw('oct',px,y,pz,sx,sy,sz,col,heading+rot,glow)};
	  const TK=(dx,y,dz,sx,sy,sz,col)=>{let [px,pz]=place(dx,dz);this.draw('cone',px,y,pz,sx,sy,sz,col,heading)};
  const SEG=(which,ax,ay,az,bx,by,bz,width,col,depth=width,glow=0)=>this.segment(which,x+ax,ay,z+az,x+bx,by,z+bz,width,depth,col,glow);
  const TSEG=(which,ax,ay,az,bx,by,bz,width,col,depth=width,glow=0)=>{let [x1,z1]=place(ax,az),[x2,z2]=place(bx,bz);this.segment(which,x1,ay,z1,x2,by,z2,width,depth,col,glow)};
	  const launcherHardware=cell=>{
   const segment=(mesh,a,b,width,col,depth=width)=>TSEG(mesh,...a,...b,width,col,depth);
   if(!cell.exposed){
    let a=[cell.dx,cell.y0,cell.z0],mouth=[cell.dx,cell.y1,cell.z1],skin=k==='missile'?(cell.boxed?[.05,.31,.33]:[.05,.31,.33]):cell.boxed?[.31,.38,.37]:[.42,.48,.43];
    segment(cell.boxed?'boxCell':'roundCell',a,mouth,cell.cellWidth,skin,cell.cellDepth);
    // A rear closure and hollow reinforcing bands leave the front aperture unobstructed.
    segment(cell.boxed?'box':'cyl',a,a.map((q,i)=>q+cell.axis[i]*.018),cell.cellWidth,[.07,.11,.12],cell.cellDepth);
    for(let d of [.12,.32]){let start=a.map((q,i)=>q+cell.axis[i]*d),end=start.map((q,i)=>q+cell.axis[i]*.085);segment(cell.boxed?'boxCell':'roundCell',start,end,cell.cellWidth*1.14,[.82,.62,.29],cell.cellDepth*1.14)}
    let collar=mouth.map((q,i)=>q-cell.axis[i]*.075);segment(cell.boxed?'boxCell':'roundCell',collar,mouth,cell.cellWidth*1.08,[.67,.65,.52],cell.cellDepth*1.08);
    if(!cell.boxed)for(let side of [-1,1]){
     let py=cell.y1-cell.axis[1]*.10,pz=cell.z1-cell.axis[2]*.10,px=cell.dx+side*cell.cellWidth*.52;
     TSEG('cyl',px,py-.055,pz,px,py+.055,pz,.026,[.72,.47,.19]);TB(px,py,pz,.034,.09,.045,[.21,.27,.26]);let [rx,rz]=place(px,pz);this.sphere(rx,py+.065,rz,.042,[.72,.47,.19]);
    }
    let shot=b.rackShot,clock=this.currentBattle?(this.currentBattle.tick+Math.max(0,Math.min(.999,this.simulationAlpha||0))):shot?.tick??0,age=shot?clock-(shot.spent?.[cell.lane]??(shot.tick+(k==='rocket'?cell.lane*3:0))):-1,fired=!!shot&&(k==='rocket'||cell.lane<=shot.lane)&&age>=0,reloaded=!!shot&&shot.lane>=cell.count-1&&clock-shot.tick>=shot.reload-.5;
    if(cell.boxed){
     this.drawMatrix('box',launcherLidMatrix(cell,launcherOpen,heading,x,z),[.83,.79,.67]);
     let n=cell.axis,w=cell.cellWidth*1.06,v=[0,n[2],-n[1]];
     TSEG('cyl',cell.dx+cell.side*w/2,cell.y1+n[1]*.014-v[1]*cell.cellDepth*.38,cell.z1+n[2]*.014-v[2]*cell.cellDepth*.38,cell.dx+cell.side*w/2,cell.y1+n[1]*.014+v[1]*cell.cellDepth*.38,cell.z1+n[2]*.014+v[2]*cell.cellDepth*.38,.022,[.67,.53,.27]);
     for(let side of [-1,1]){
      let px=cell.dx+side*cell.cellWidth*.54,py=cell.y1-n[1]*.13,pz=cell.z1-n[2]*.13;
      TSEG('cyl',px,py-n[1]*.10,pz-n[2]*.10,px,py+n[1]*.06,pz+n[2]*.06,.018,[.67,.53,.27]);TB(px,py,pz,.045,.065,.055,[.18,.27,.28]);let [rx,rz]=place(px,pz);this.sphere(rx,py+.042,rz,.026,[.72,.47,.19]);
     }
    }else if(!fired||reloaded){this.drawMatrix('cyl',launcherLidMatrix(cell,0,heading,x,z),[.83,.79,.67])}
    else if(age<20){
     let p=age/20,m=launcherLidMatrix(cell,Math.min(1,p*1.8),heading,x,z),[tx,tz]=place(cell.side*.52*p,cell.axis[2]*.55*p);
     m[12]+=tx-x;m[13]+=.36*p-1.75*p*p;m[14]+=tz-z;this.drawMatrix('cyl',m,[.83,.79,.67]);
    }
    let capClear=cell.boxed?launcherOpen>.05:fired&&!reloaded;
    if(!capClear)return;
   }
   let offset=launcherRoundOffset(b,cell,this.currentBattle?(this.currentBattle.tick+Math.max(0,Math.min(.999,this.simulationAlpha||0))):0);if(offset===null)return;
   let tail=cell.tail.map((q,i)=>q-cell.axis[i]*offset),[px,pz]=place(tail[0],tail[2]),axis=[cell.axis[2]*s,cell.axis[1],cell.axis[2]*c];
   this.launcherRound(cell,[px,tail[1],pz],axis,false);
  };
  const launcherFrame=(rack,railColor,trimColor)=>{
   let {point,rear,front,bottom,railX}=rack;
   for(let side of [-1,1]){
    let a=point(side*railX,rear-.06,bottom+.03),end=point(side*railX,front-.18,bottom+.03);
    TSEG('box',...a,...end,.10,railColor,.12);
    TSEG('box',...point(side*railX,rear+.03,bottom+.10),...point(side*railX,front-.26,bottom+.10),.045,trimColor,.07);
    let joint=point(side*railX,rear+.65,bottom+.03);
    TSEG('cyl',side*railX,1.06,-.38,...joint,.075,trimColor);
    TSEG('cyl',...joint,...point(side*railX,front-.30,bottom+.03),.05,[.73,.76,.71]);
    TO(side*railX,1.20,-.33,.17,.12,.19,[.09,.13,.15]);
   }
   for(let along of [rear+.18,(rear+front)*.5,front-.26])TSEG('box',...point(-railX,along,bottom-.085),...point(railX,along,bottom-.085),.055,railColor,.09);
   for(let cell of rack.cells)if(cell.exposed){
    let n=cell.axis,v=rack.up,under=cell.caliber*.90+.035,a=cell.tail.map((q,i)=>q-v[i]*under),end=a.map((q,i)=>q+n[i]*cell.bodyLength*.82);
    TSEG('box',...a,...end,.035,railColor,.06);
    for(let distance of [.42,.70]){let center=a.map((q,i)=>q+n[i]*cell.bodyLength*distance);TSEG('box',center[0]-cell.caliber*.67,center[1],center[2],center[0]+cell.caliber*.67,center[1],center[2],.03,trimColor,.045)}
   }
  };
  const brace=(ax,ay,az,bx,by,bz,col=[.31,.38,.36],width=.075)=>SEG('box',ax,ay,az,bx,by,bz,width,col,width);
  const rivet=(dx,y,dz,col=[.82,.68,.39],size=.09)=>this.sphere(x+dx,y,z+dz,size,col,.05);
  if(b.hp!==undefined&&b.hp<=0){O(0,.12,0,1.8,.21,1.8,[.29,.30,.31]);for(let i=0;i<3;i++)B(Math.sin(i*4)*.42,.27,Math.cos(i*3)*.3,.42,.23,.35,[.44,.40,.34],i);return}
  O(0,.105,0,2.05,.23,2.05,highlight?[.17,.85,.94]:[.69,.68,.56],0,highlight?.16:0);
  if(b.constructionEnd||b.site){
   let progress=b.constructionEnd?Math.max(0,Math.min(1,(Date.now()-b.constructionStart)/(b.constructionEnd-b.constructionStart))):.45;
   let accent=k==='gold'||k==='gold_store'?[.95,.67,.26]:k==='wood'||k==='wood_store'?[.84,.46,.31]:k==='steel'||k==='steel_store'?[.39,.78,.85]:k==='store'?[.67,.51,.80]:k==='vault'?[.35,.77,.66]:[.24,.65,.77];
   // Slab, type-colored rising frame, scaffold, safety rails, crates and a hoist.
   O(0,.22,0,1.88,.17,1.76,[.50,.55,.51]);B(0,.43,0,1.35,.33,1.22,accent);
   let top=.67+progress*.81;
   for(let dx of [-.70,.70])for(let dz of [-.61,.61]){C(dx,top/2+.17,dz,.12,top,.12,[.74,.61,.40]);B(dx,top+.22,dz,.23,.11,.22,[.80,.67,.42])}
   B(0,top+.07,-.63,1.60,.09,.12,[.88,.72,.44]);B(0,top+.07,.63,1.60,.09,.12,[.88,.72,.44]);
   B(-.91,.49,.10,.10,.34,1.67,[.96,.72,.25]);B(.91,.49,.10,.10,.34,1.67,[.96,.72,.25]);
   B(.91,.73,-.17,.10,.09,.81,[.23,.28,.28]);B(-.91,.73,-.17,.10,.09,.81,[.23,.28,.28]);
   B(-.16,.35,.80,.62,.44,.46,[.67,.49,.30]);B(-.16,.61,.80,.62,.08,.46,[.88,.72,.45]);
   C(.76,1.23,-.70,.11,1.73,.11,[.40,.46,.41]);B(.40,2.02,-.70,.92,.10,.13,[.91,.69,.30]);B(.01,1.65,-.70,.05,.70,.05,[.47,.48,.41]);O(.01,1.27,-.70,.23,.24,.23,[.94,.78,.36]);
   return;
  }
  O(0,.245,0,1.82,.10,1.82,k==='gold'||k==='gold_store'?[.98,.74,.25]:k==='wood'||k==='wood_store'?[.91,.45,.24]:k==='steel'||k==='steel_store'?[.46,.75,.94]:k==='vault'?[.40,.71,.69]:k==='store'?[.68,.53,.88]:[.34,.48,.50]);
  if(k==='drone'){
   let era=droneEra(lvl),slab=era==='future'?[.20,.31,.34]:era==='modern'?[.37,.44,.41]:era==='industrial'?[.43,.43,.37]:[.45,.34,.22],cream=[.90,.86,.65],amber=[.96,.70,.30],cyan=[.25,.79,.81];
   if(era==='rough'){
    B(0,.36,0,2.22,.24,2.22,slab);for(let i=0;i<9;i++)B(-.97+i*.24,.52,0,.215,.07,2.13,[.58+(i%2)*.04,.44,.27]);B(0,.56,0,.08,.012,.70,cream);B(-.34,.56,0,.06,.012,.70,cream);B(0,.56,0,.64,.012,.06,cream);B(0,.79,-1.03,.34,.47,.28,[.38,.46,.35]);C(0,1.19,-1.03,.04,.36,.04,cream);
   }else if(era==='industrial'){
    B(0,.39,0,2.26,.33,2.26,[.58,.56,.47]);B(0,.54,0,1.92,.03,1.92,slab);B(0,.87,-1.03,.46,.60,.31,[.55,.29,.19]);B(0,1.19,-1.03,.49,.07,.34,[.25,.30,.30]);for(let dx of [-.13,.13])C(dx,.99,-.85,.08,.022,.08,cream,Math.PI/2);C(0,1.47,-1.03,.04,.49,.04,slab);if(lvl>=4){B(.92,.76,-.05,.35,.45,.42,[.35,.39,.35]);B(.92,1.01,-.05,.36,.055,.43,cream)}
   }else if(era==='modern'){
    B(0,.36,0,2.30,.24,2.30,slab);O(0,.53,0,1.96,.05,1.96,[.42,.53,.48]);B(-.26,.87,-1.03,.46,.61,.31,slab);B(-.26,.98,-.85,.29,.19,.025,[.22,.76,.77],0,.20);C(-.26,1.43,-1.03,.04,.47,.04,cream);if(lvl>=7){C(.24,1.29,-1.03,.05,.72,.05,slab);this.draw('sphere',x+.24,1.67,z-1.03,.29,.18,.10,[.33,.66,.68],.30,.06)}
   }else{
    O(0,.36,0,2.43,.24,2.43,slab);O(0,.53,0,2.11,.05,2.11,[.29,.42,.43]);for(let side of [-1,1]){B(side*1.075,.53,0,.055,.065,1.37,cyan,0,.18);B(0,.53,side*1.075,1.37,.065,.055,cyan,0,.18)}B(0,.86,-1.03,.46,.59,.30,slab);B(0,.97,-.86,.29,.19,.025,cyan,0,.23);B(0,1.18,-1.03,.49,.07,.33,cream);C(.10,1.44,-1.03,.04,.44,.04,cream);this.draw('sphere',x+.10,1.69,z-1.03,.25,.13,.10,cyan,.30,.06);
    if(lvl>=10)for(let side of [-1,1])for(let dz of [-.90,.90]){B(side*.98,.67,dz,.25,.40,.24,[.21,.48,.51]);B(side*.98,.90,dz,.27,.07,.26,cream);C(side*.98,.945,dz,.065,.02,.065,amber,0,.25+this.nightGlow*.8)}
   }
   if(era!=='rough')for(let side of [-1,1]){B(side*.37,.563,0,.08,.012,.78,cream);B(0,.563,side*.25,.70,.012,.07,cream)}
   for(let tier=2;tier<=lvl;tier++){let side=tier%2?1:-1,dz=-.76+Math.floor((tier-2)/2)*.36;B(side*1.10,.36,dz,.12,.17,.23,lvl>=6?[.42,.61,.63]:[.59,.58,.44]);B(side*1.12,.47,dz,.07,.04,.12,amber,0,.13)}
   let drone=b.drone;
   if(drone){let alpha=this.simulationAlpha||0,lerp=(previous,current)=>(previous??current)*(1-alpha)+current*alpha,heading=drone.previousHeading===undefined?drone.heading:drone.previousHeading+shortestAngle(drone.heading,drone.previousHeading)*alpha;this.droneCraft(lerp(drone.previousX,drone.x),lerp(drone.previousY,drone.y),lerp(drone.previousZ,drone.z),heading,lvl,drone.loaded,true,drone)}
   else this.droneCraft(x,.92,z,0,lvl,!(b.cool>0),false);
  }else if(k==='hq'){
   // A layered naval command house: wings, glazed bridge, balcony, radar and mast.
   let blue=hostile?[.61,.24,.22]:[.08,.38,.62],glass=hostile?[.93,.48,.27]:[.20,.76,.84],cream=[.94,.91,.78],gold=[.93,.70,.28];
   for(let i=0;i<4;i++)B(0,.29+i*.10,1.16+i*.10,2.28-i*.18,.10,1.02-i*.13,[.78+.035*i,.75+.035*i,.64+.035*i]);
   B(0,.92,-.08,2.34,1.18,1.82,cream);for(let side of [-1,1]){B(side*1.10,.79,.06,.58,.91,1.36,cream);R(side*1.10,1.39,.06,.79,.34,1.57,blue)}
   B(0,1.48,-.08,2.53,.18,2.02,blue);B(0,1.91,-.22,1.42,.75,1.30,cream);R(0,2.42,-.22,1.66,.37,1.54,blue);
   B(0,1.06,1.00,.78,.88,.12,blue);B(0,1.05,1.075,.54,.66,.05,[.12,.22,.27]);for(let side of [-1,1]){B(side*.83,1.03,1.03,.39,.48,.08,glass,0,.15);B(side*.43,2.02,.47,.29,.35,.08,glass,0,.16);B(side*1.11,.92,.78,.08,.22,.18,gold)}
   for(let dx of [-.69,-.23,.23,.69])B(dx,1.67,.46,.33,.28,.07,glass,0,.16);
   for(let dx of [-1.0,-.5,0,.5,1.0]){C(dx,1.58,.83,.055,.42,.055,[.34,.39,.36]);B(dx,1.77,.83,.08,.05,.08,gold)}B(0,1.77,.83,2.15,.045,.05,[.32,.38,.36]);
   for(let side of [-1,1]){B(side*1.24,.48,-.55,.13,.45,.20,[.29,.37,.35]);B(side*1.24,.70,-.55,.18,.08,.26,gold);for(let y of [.57,.83,1.09])B(side*1.405,y,.12,.05,.10,.65,[.22,.31,.32])}
   C(.56,2.94,-.37,.11,1.12,.11,[.34,.39,.37]);C(.56,3.55,-.37,.18,.11,.18,gold);SEG('box',.56,3.18,-.37,.56,3.18,.50,.055,[.36,.39,.35]);
   this.draw('sphere',x+.57,3.17,z+.54,.62,.54,.10,[.82,.84,.75],0,.10);C(.57,3.17,.45,.13,.17,.13,gold);
   for(let y of [2.72,3.06,3.39])B(.56,y,-.37,.55,.045,.045,[.31,.37,.35]);
	   B(.97,3.40,-.37,.72,.38,.055,hostile?[.86,.17,.13]:[1,.35,.18],-.09,.23);O(-.75,1.61,-.57,.34,.24,.34,gold,0,.13);
	   // The command-house alarm clock follows the compressed island day.
	   let clockMinutes=Number.isFinite(this.environmentMinutes)?this.environmentMinutes:12*60,minuteAngle=clockMinutes%60/60*Math.PI*2,hourAngle=clockMinutes/720*Math.PI*2,cx=x,cy=2.04,cz=z+.515,clockGlow=.08+this.nightGlow*.95;
	   B(0,cy,.515,.53,.53,.075,[.91,.87,.68],0,clockGlow);for(let a=0;a<12;a++){let angle=a*Math.PI/6;this.sphere(cx+Math.sin(angle)*.205,cy+Math.cos(angle)*.205,cz+.052,.025,[.18,.24,.24],.04)}
	   this.segment('box',cx,cy,cz+.06,cx+Math.sin(hourAngle)*.115,cy+Math.cos(hourAngle)*.115,cz+.065,.035,.028,[.15,.23,.25],clockGlow);
	   this.segment('box',cx,cy,cz+.07,cx+Math.sin(minuteAngle)*.17,cy+Math.cos(minuteAngle)*.17,cz+.075,.025,.022,[.72,.20,.18],clockGlow);
	   for(let side of [-1,1])for(let dz of [-.43,.36])rivet(side*1.42,.55,dz,[.72,.61,.38],.07);
	  }else if(k==='sniper'){
	   // Precision watchtower: framed cabin, operator, optics, railings, ladder and structural fasteners.
	   let steel=[.27,.36,.35],yellow=[.98,.68,.20],glass=[.19,.52,.60];
	   for(let dx of [-.68,.68])for(let dz of [-.56,.56])C(dx,.91,dz,.14,1.53,.14,steel);
	   for(let side of [-1,1]){brace(side*.67,.28,-.55,side*.67,1.54,.55);brace(side*.67,.28,.55,side*.67,1.54,-.55);brace(-.67,.34,side*.55,.67,1.47,side*.55);brace(.67,.34,side*.55,-.67,1.47,side*.55)}
	   B(0,.53,0,1.50,.11,1.39,[.48,.54,.43]);B(0,1.57,0,1.68,.18,1.50,steel);B(0,1.89,0,1.31,.48,1.13,[.73,.76,.59]);
	   for(let dx of [-.42,0,.42]){B(dx,1.91,.58,.29,.23,.055,glass,0,.12);B(dx+.19,1.91,.605,.026,.30,.035,steel)}R(0,2.35,0,1.91,.54,1.74,yellow);B(0,2.13,-.57,1.28,.09,.07,[.36,.42,.38]);
	   for(let y=.42;y<1.55;y+=.22){B(.83,y,-.47,.27,.045,.055,[.50,.45,.31]);B(.76,y+.1,-.47,.045,.22,.055,[.43,.40,.30])}for(let y of [.39,.81,1.23])rivet(.83,y,-.50,[.84,.67,.31],.055);
	   for(let side of [-1,1]){B(side*.74,1.69,.35,.055,.35,.62,steel);B(side*.74,1.84,.66,.055,.055,.62,[.82,.67,.34]);for(let dz of [.13,.42,.68])B(side*.74,1.98,dz,.045,.31,.045,steel)}
	   TB(-.24,1.79,.05,.31,.40,.29,[.34,.43,.30]);let [opx,opz]=place(-.24,.12);this.sphere(opx,2.07,opz,.18,[.67,.54,.43]);TO(-.24,2.18,.10,.38,.14,.36,[.30,.39,.30]);
	   TSEG('box',-.22,1.84,.19,-.10,1.94,.72,.12,[.42,.27,.16],.17);TSEG('cyl',0,1.95,.28,0,1.98,1.53,.105,[.10,.17,.20]);TSEG('cyl',0,1.97,1.42,0,1.98,1.72,.17,[.07,.12,.14]);
	   TSEG('cyl',.18,2.08,.31,.18,2.08,.79,.065,[.13,.19,.20]);TO(.18,2.08,.25,.18,.14,.18,[.12,.18,.19]);TO(.18,2.08,.82,.10,.09,.10,[.32,.64,.69],0,.16);for(let dz of [.38,.72,1.10])TB(0,1.96,dz,.23,.055,.09,[.70,.58,.33]);
	   for(let side of [-1,1])for(let dz of [-.48,.48])rivet(side*.64,1.56,dz,[.74,.63,.37],.06);
	  }else if(k==='mg'){
	   // Finished twin-gun pillbox: plated cupola, receivers, feed belts, ammo cans and service hatch.
	   O(0,.54,0,1.92,.70,1.78,[.76,.73,.61]);for(let a=0;a<10;a++){let ang=a*Math.PI*2/10;O(Math.sin(ang)*1.02,.84,Math.cos(ang)*.89,.56,.26,.35,[.79,.67,.47],ang)}
	   O(0,.94,-.08,1.52,.50,1.42,hostile?[.65,.25,.22]:[.76,.28,.22]);TO(0,1.28,-.12,1.31,.23,1.24,[.31,.35,.35]);TO(0,1.47,-.13,.72,.16,.70,hostile?[.82,.34,.24]:[.90,.39,.23]);
		   let gunBarrels=machineGunBarrelCount(lvl),gunWidth=gunBarrels<=2?.12:gunBarrels===4?.09:.075,gunColumns=gunBarrels>=4?2:gunBarrels,gunRows=Math.ceil(gunBarrels/gunColumns),gunSpacing=gunBarrels>=4?.52:.56,gunPositions=Array.from({length:gunBarrels},(_,i)=>{let row=Math.floor(i/gunColumns),column=i%gunColumns;return {dx:(column-(gunColumns-1)/2)*gunSpacing,y:1.34+(gunRows-1)*.13-row*.26}});if(gunRows>1){TB(0,1.34,-.12,.23,.70,.39,[.24,.29,.29]);TC(0,1.34,.05,.10,.76,.10,[.72,.58,.30])}for(let {dx,y} of gunPositions){TB(dx,y-.02,.13,Math.max(.15,gunWidth*2.05),.20,.46,[.16,.21,.21]);TB(dx,y-.14,-.14,Math.max(.18,gunWidth*2.55),.25,.31,[.36,.42,.34]);TSEG('cyl',dx,y,.26,dx,y,1.72,gunWidth,[.13,.18,.20]);TSEG('cyl',dx,y,1.50,dx,y,1.83,gunWidth*1.5,[.10,.15,.17]);for(let dz of [.57,.82,1.07]){let [px,pz]=place(dx+gunWidth*.82,dz);this.sphere(px,y,pz,Math.max(.026,gunWidth*.37),[.04,.06,.07])}}for(let side of [-1,1])for(let i=0;i<5;i++){let [px,pz]=place(side*.45+side*.07,.02-i*.10);this.sphere(px,1.28-i*.035,pz,.047,[.84,.61,.22])}
	   for(let side of [-1,1]){TB(side*.55,1.34,.13,.22,.66,.55,[.27,.31,.31]);for(let y of [1.09,1.35,1.59]){let [px,pz]=place(side*.64,.18);this.sphere(px,y,pz,.055,[.73,.61,.36])}}
	   for(let side of [-1,1]){B(side*1.13,.49,.18,.28,.38,.77,[.88,.86,.72]);B(side*1.13,.78,-.15,.24,.18,.52,[.29,.34,.32]);B(side*.91,.87,.63,.35,.23,.38,[.34,.38,.31])}
	   TO(0,1.65,-.16,.62,.10,.62,[.20,.23,.23]);TC(0,1.78,-.16,.11,.22,.11,[.15,.18,.18]);TB(0,.64,-.91,.72,.57,.10,[.30,.36,.34]);for(let dx of [-.23,.23])rivet(dx,.66,-.97,[.76,.63,.35],.06);for(let dx of [-.50,.50])for(let dz of [-.39,.27])rivet(dx,1.20,dz);
	  }else if(k==='mortar'){
	   // Detailed mortar pit: layered parapet, baseplate, sights, traverse gear and opened ammunition racks.
	   O(0,.48,0,1.94,.55,1.94,[.50,.60,.36]);O(0,.75,0,1.54,.24,1.54,[.25,.31,.27]);for(let a=0;a<12;a++){let ang=a*Math.PI*2/12;O(Math.sin(ang)*1.02,.80,Math.cos(ang)*.96,.48,.24,.33,[.83,.70,.48],ang)}
	   TO(0,.69,-.25,.72,.13,.72,[.57,.50,.31]);TO(0,.76,-.25,.45,.10,.45,[.22,.28,.26]);TSEG('cyl',0,.72,-.26,0,2.12,.87,.22,[.13,.20,.22]);TSEG('cyl',0,1.93,.72,0,2.24,.98,.30,[.08,.14,.16]);TSEG('cyl',0,2.20,.94,0,2.35,1.06,.35,[.78,.64,.37]);
	   TSEG('box',0,1.12,.10,-.72,.61,.49,.075,[.24,.29,.27]);TSEG('box',0,1.12,.10,.72,.61,.49,.075,[.24,.29,.27]);TSEG('box',-.50,.76,.39,.50,.76,.39,.065,[.44,.48,.39]);for(let side of [-1,1])TO(side*.53,.65,.48,.18,.10,.18,[.69,.57,.34]);
	   TSEG('cyl',.30,1.17,.05,.54,1.46,.27,.055,[.27,.32,.29]);TO(.55,1.48,.28,.18,.08,.18,[.83,.69,.34]);TB(.48,1.52,.33,.08,.28,.08,[.18,.24,.24]);
	   for(let side of [-1,1]){B(side*.82,.51,-.66,.50,.38,.42,[.55,.39,.23]);B(side*.82,.73,-.66,.52,.07,.44,[.78,.61,.32]);B(side*.82,.51,-.89,.38,.08,.07,[.31,.27,.22]);for(let i=0;i<3;i++){O(side*.82+i*.11-.11,.82,-.66,.13,.32,.13,[.20,.27,.25]);O(side*.82+i*.11-.11,.99,-.66,.15,.08,.15,[.77,.62,.30])}}
	   for(let a=0;a<12;a+=2){let ang=a*Math.PI*2/12;rivet(Math.sin(ang)*1.02,.91,Math.cos(ang)*.96,[.65,.54,.34],.045)}
		  }else if(k==='cannon'){
	   // Refined tracked cannon: segmented tracks, welded armor, recoil cylinders, hatch and drilled muzzle brake.
	   let armor=hostile?[.58,.25,.22]:[.16,.49,.66],dark=[.12,.20,.24];
	   for(let side of [-1,1]){B(side*.76,.49,0,.40,.60,1.78,dark);B(side*.97,.49,0,.12,.47,1.62,[.10,.16,.18]);for(let dz of [-.62,-.20,.22,.64]){SEG('cyl',side*.99,.48,dz,side*.73,.48,dz,.34,[.28,.39,.39]);rivet(side*1.01,.48,dz,[.62,.58,.42],.08)}for(let dz=-.75;dz<=.76;dz+=.25)B(side*1.045,.49,dz,.055,.51,.18,[.19,.27,.28])}
	   TB(0,.72,-.05,1.42,.66,1.43,armor);TB(0,.83,.52,1.18,.28,.46,[.57,.64,.57]);TO(0,1.08,-.19,1.13,.48,1.06,[.26,.38,.42]);TO(0,1.17,.28,.67,.61,.55,armor);
			   let cannonGuns=cannonBarrelCount(lvl),cannonSpan=cannonGuns===1?0:cannonGuns===2?.40:.60,cannonWidth=cannonGuns===1?.22:cannonGuns===2?.17:.145,cannonOffsets=Array.from({length:cannonGuns},(_,i)=>cannonGuns===1?0:-cannonSpan/2+cannonSpan*i/(cannonGuns-1));for(let dx of cannonOffsets){TSEG('cyl',dx,1.07,.31,dx,1.10,1.06,.065,[.65,.66,.56]);TSEG('cyl',dx,1.18,.43,dx,1.22,2.03,cannonWidth,[.13,.23,.28]);TSEG('cyl',dx,1.21,1.86,dx,1.22,2.24,cannonWidth*1.38,[.08,.15,.18]);TSEG('box',dx-cannonWidth*1.36,1.10,2.04,dx+cannonWidth*1.36,1.34,2.04,.055,[.78,.60,.28]);for(let side of [-1,1]){TB(dx+side*cannonWidth*1.10,1.22,2.10,.07,.10,.07,[.035,.055,.06]);TB(dx+side*cannonWidth*1.48,1.05,2.05,.05,.07,.10,[.035,.055,.06])}}
		   TO(0,1.54,-.28,.48,.13,.48,[.18,.28,.30]);TC(0,1.72,-.28,.08,.30,.08,[.82,.70,.42]);TB(0,1.49,-.30,.34,.055,.34,[.67,.65,.52]);for(let side of [-1,1]){TB(side*.53,.84,.43,.13,.11,.46,[.75,.63,.37]);TB(side*.54,.98,-.38,.10,.20,.35,[.28,.34,.33])}for(let dx of [-.47,0,.47])rivet(dx,.83,.68,[.78,.66,.39],.055);
			  }else if(k==='missile'){
			   // Reference-matched coastal AT launcher: one heavy red missile, teal/cream rail, optic box and hydraulic cradle.
			   let teal=hostile?[.48,.27,.25]:[.07,.50,.50],tealDark=hostile?[.34,.18,.18]:[.05,.31,.33],dark=[.09,.13,.15],cream=[.83,.79,.67],gold=[.72,.47,.19],red=[.84,.13,.085],nose=[.12,.13,.14];
			   O(0,.47,0,2.02,.58,1.90,tealDark);O(0,.80,-.03,1.55,.19,1.48,cream);O(0,.94,-.05,1.34,.18,1.27,teal);for(let a=0;a<8;a++){let ang=a*Math.PI*2/8,side=a%2?cream:teal;B(Math.sin(ang)*1.03,.54,Math.cos(ang)*.88,.40,.49,.28,side,ang);rivet(Math.sin(ang)*1.12,.78,Math.cos(ang)*.96,gold,.055)}
			   for(let side of [-1,1]){TB(side*.70,.52,.48,.38,.42,.06,cream);TB(side*.70,.53,.525,.24,.27,.035,dark);for(let y of [.45,.54,.63])TB(side*.70,y,.56,.18,.035,.035,[.36,.39,.35])}
   TO(0,1.04,-.08,1.15,.20,1.08,dark);TC(0,1.19,-.08,.24,.28,.24,gold);TO(0,1.29,-.08,.91,.16,.80,teal);
   let rack=launcherRack('missile',lvl);launcherFrame(rack,teal,cream);
			   // Compact exposed missiles, expendable 1950s caps, then hinged sealed canisters.
   for(let cell of rack.cells)launcherHardware(cell);
   let opticX=-Math.max(.78,rack.railX+.35);
   TSEG('box',opticX,1.38,-.42,opticX,2.07,.42,.10,cream,.16);TO(opticX,1.77,-.02,.44,.65,.49,teal);TB(opticX,1.84,.25,.34,.31,.055,dark,0,.12);TB(opticX,1.84,.285,.22,.19,.025,[.18,.31,.43],0,.28);TO(opticX,1.69,.30,.13,.13,.06,[.19,.64,.50],0,.22);for(let side of [-1,1])TC(opticX+side*.18,1.45,-.28,.045,.45,.045,gold);
   TSEG('box',opticX,1.17,-.43,rack.railX,1.17,-.43,.09,cream,.16);for(let side of [-1,1])TB(side*rack.railX,1.20,-.08,.10,.34,.13,tealDark);
		  }else if(k==='rocket'){
	   // Era progression: exposed rails, 1950s round-cell pack, then sealed square canisters.
	   let red=hostile?[.63,.22,.20]:[.82,.27,.20],frame=[.15,.21,.23],gold=[.82,.62,.29];
	   O(0,.50,0,1.92,.64,1.82,[.47,.48,.42]);for(let a=0;a<8;a++){let ang=a*Math.PI*2/8;B(Math.sin(ang)*1.02,.53,Math.cos(ang)*.84,.30,.48,.24,a%2?red:[.59,.58,.49],ang)}
   O(0,.84,-.04,1.34,.30,1.30,red);TO(0,1.10,-.05,1.21,.25,1.18,frame);
   let rack=launcherRack('rocket',lvl);launcherFrame(rack,frame,gold);
   for(let cell of rack.cells)launcherHardware(cell);
	   TO(0,1.01,-.38,.57,.24,.51,red);TC(0,1.24,-.38,.12,.42,.12,gold);TB(.89,.81,.52,.43,.54,.38,[.27,.32,.30]);TB(.89,.83,.73,.25,.28,.055,[.10,.18,.20]);for(let y of [.73,.91])for(let dx of [.76,1.02])rivet(dx,y,.76,[.75,.61,.34],.045);B(-.89,.65,.52,.31,.29,.39,[.30,.33,.30]);
  }else if(k==='gold'){
   // Gold pump: cabin, walking beam, flywheel, pipework and coin bins.
   B(0,.63,-.20,1.43,.75,1.18,[.97,.66,.19]);R(0,1.14,-.20,1.68,.40,1.45,[.67,.32,.15]);B(0,.66,.48,.58,.35,.11,[.34,.22,.16]);
   C(-.52,1.57,-.48,.14,.86,.14,[.31,.30,.25]);SEG('box',-.52,1.94,-.48,.72,1.67,-.48,.14,[.93,.69,.23],.19);SEG('box',.68,1.70,-.48,.92,1.21,-.48,.11,[.32,.31,.27]);
   SEG('cyl',.83,1.11,-.48,.83,1.28,-.48,.51,[.49,.39,.23]);SEG('cyl',.83,1.10,-.55,.83,1.10,-.40,.24,[.91,.67,.22]);C(-.07,1.87,-.48,.11,.28,.11,[.22,.27,.25]);
   for(let i=0;i<3;i++){O(-.50+i*.47,.39,.83,.42,.28,.42,[1,.82,.18],0,.14);rivet(-.50+i*.47,.52,.88,[1,.91,.40],.07)}SEG('cyl',-.74,.45,.53,.75,.45,.53,.09,[.65,.48,.23]);
  }else if(k==='wood'){
   // Open sawmill: green roof, log conveyor and a vertical silver saw blade.
   B(0,.70,-.21,1.72,.92,1.24,[.92,.45,.25]);for(let side of [-1,1])for(let dz of [-.67,.42])C(side*.87,1.16,dz,.10,1.38,.10,[.47,.34,.22]);R(0,1.61,-.14,2.18,.55,1.64,[.30,.60,.29]);
   B(0,.65,.72,1.48,.20,.82,[.55,.35,.21]);for(let dz of [.44,.76,1.08])SEG('cyl',-.70,.77,dz,.70,.77,dz,.08,[.30,.34,.30]);for(let dx of [-.49,0,.49]){C(dx,.38,1.15,.32,.91,.32,[.67,.39,.20]);O(dx,.38,1.59,.35,.12,.35,[.78,.56,.32])}
   SEG('cyl',.44,1.36,-.16,.44,1.36,.02,.61,[.84,.88,.84],.18);C(.44,1.36,-.07,.13,.25,.13,[.25,.31,.30]);for(let a=0;a<10;a++){let ang=a*Math.PI*2/10;B(.44+Math.sin(ang)*.34,1.36+Math.cos(ang)*.34,-.15,.09,.09,.06,[.79,.83,.80])}B(-.38,.82,-.66,.53,.40,.31,[.58,.37,.22]);
  }else if(k==='steel'){
   // Foundry: cyan hall, unequal stacks, furnace glow, ducts and ingot trolley.
   B(0,.83,-.19,1.72,1.17,1.31,[.23,.57,.67]);B(0,1.47,-.19,1.84,.19,1.49,[.21,.33,.43]);C(-.54,1.89,-.53,.43,1.66,.43,[.76,.83,.82]);C(.46,2.16,-.47,.35,2.08,.35,[.67,.76,.79]);O(.46,3.20,-.47,.48,.16,.48,[.40,.42,.43]);
   B(0,.77,.54,.75,.63,.15,[1,.49,.13],0,.31);for(let i=0;i<3;i++)B(-.24+i*.24,.79,.635,.12,.43,.04,[.37,.30,.24]);SEG('cyl',-.54,1.30,-.53,-1.05,1.30,.17,.14,[.48,.57,.58]);SEG('cyl',-1.05,1.30,.17,-1.05,.63,.62,.14,[.48,.57,.58]);
   for(let dx of [-.54,.54]){B(dx,.52,1.03,.45,.29,.40,[.45,.58,.64]);O(dx,.70,1.03,.24,.20,.24,[.75,.79,.72])}for(let dx of [-.42,0,.42])B(dx,.35,1.37,.34,.22,.44,[.39,.49,.52]);
  }else if(k==='store'){
   // Tall purple-roofed storage silos and cargo crates.
   for(let dx of [-.49,.49]){C(dx,.91,-.20,.81,1.24,.81,[.87,.88,.77]);K(dx,1.72,-.20,.93,.43,.93,[.55,.42,.82]);B(dx,1.12,.24,.26,.41,.09,[.43,.62,.83])}
   for(let dx of [-.55,.05,.58])B(dx,.46,1.06,.51,.48,.51,dx===.05?[.89,.64,.34]:[.56,.39,.77]);
  }else if(k==='gold_store'){
   B(0,.88,0,1.65,1.14,1.43,[.76,.64,.42]);R(0,1.55,0,1.91,.39,1.65,[.98,.76,.27]);B(0,.94,.73,.72,.84,.13,[.38,.35,.29]);
   O(0,1.04,.81,.45,.46,.19,[.98,.79,.30],0,.20);for(let dx of [-.53,.53])O(dx,.43,1.0,.36,.28,.36,[.99,.81,.28],0,.18);for(let i=0;i<4;i++)O(-.62+i*.41,.57,-.72,.33,.13,.33,[.96,.76,.25],0,.12);for(let dx of [-.72,.72])C(dx,1.05,-.61,.09,.62,.09,[.49,.42,.29]);
  }else if(k==='wood_store'){
   for(let dx of [-.72,.72])for(let dz of [-.56,.56])C(dx,.87,dz,.14,1.34,.14,[.57,.36,.22]);R(0,1.69,0,1.98,.53,1.76,[.72,.35,.22]);
   for(let dx of [-.53,0,.53]){C(dx,.42,.55,.40,.75,.40,[.74,.49,.28]);O(dx,.42,1.03,.43,.13,.43,[.86,.67,.40])}B(0,.64,-.49,1.13,.29,.22,[.45,.30,.20]);for(let y of [.34,.65,.96])B(0,y,.55,1.64,.055,.09,[.33,.29,.23]);for(let dx of [-.83,.83])B(dx,.68,.55,.06,.84,.10,[.33,.29,.23]);
  }else if(k==='steel_store'){
   B(0,.89,0,1.72,1.19,1.50,[.53,.66,.69]);B(0,1.57,0,1.88,.18,1.68,[.29,.42,.52]);
   for(let dx of [-.53,.53])B(dx,.83,.78,.30,.90,.12,[.24,.39,.47]);for(let dz of [-.34,.34])B(0,.75,dz,1.87,.10,.12,[.76,.85,.83]);B(0,1.89,0,1.94,.14,1.62,[.67,.76,.75]);for(let dx of [-.56,0,.56]){C(dx,.43,1.04,.30,.68,.30,[.66,.72,.70]);O(dx,.80,1.04,.33,.13,.33,[.32,.43,.46])}for(let i=0;i<4;i++)B(-.60+i*.40,.42,-.88,.27,.18,.52,[.44,.55,.57]);
		  }else if(k==='vault'){
   B(0,.91,0,1.78,1.33,1.52,[.34,.47,.54]);B(0,1.69,0,1.96,.22,1.73,[.17,.34,.43]);B(0,.94,.80,1.16,1.05,.16,[.74,.84,.80]);
		   O(0,.98,.91,.61,.62,.20,[.25,.42,.49]);O(0,.98,1.03,.37,.41,.12,[.93,.75,.39],0,.20);B(0,.98,1.12,.43,.07,.08,[.17,.30,.34]);B(0,.98,1.12,.07,.44,.08,[.17,.30,.34]);for(let a=0;a<8;a++){let ang=a*Math.PI*2/8;rivet(Math.sin(ang)*.48,.98,1.12+Math.cos(ang)*.48,[.78,.82,.72],.065)}for(let side of [-1,1]){B(side*1.02,.65,.32,.18,.62,.20,[.19,.34,.39]);C(side*1.02,.98,.47,.08,.44,.08,[.75,.63,.34])}
			  }
		  // Type-specific progression changes each machine's silhouette and working hardware, not just its trim.
		  if(k!=='rocket'&&k!=='missile'){
		   let eraMetal=lvl>=9?[.12,.25,.29]:lvl>=6?[.25,.39,.42]:lvl>=3?[.43,.45,.39]:[.54,.47,.34],signal=lvl>=9?[.25,.91,.94]:[.91,.66,.25];
		   if(k==='hq'){
		    if(lvl>=2)for(let dx of [-1.18,-.78,-.38,.38,.78,1.18])B(dx,.34,1.30,.29,.24,.32,[.70,.63,.45]);
		    if(lvl>=3){B(-1.52,1.10,-.12,.52,1.20,1.34,[.68,.69,.61]);R(-1.52,1.82,-.12,.66,.24,1.49,eraMetal)}
		    if(lvl>=4){B(1.48,1.03,-.18,.58,1.02,1.45,[.72,.73,.65]);for(let dz of [-.45,0,.45])B(1.79,1.10,dz,.06,.35,.27,[.12,.31,.36],0,.15)}
		    if(lvl>=5){C(-.58,3.13,-.37,.07,.78,.07,eraMetal);for(let y of [2.89,3.16,3.43])B(-.58,y,-.37,.74,.035,.035,signal)}
		    if(lvl>=6){B(0,2.02,.46,1.52,.43,.16,[.20,.34,.38]);for(let dx of [-.55,0,.55])B(dx,2.03,.555,.38,.21,.035,[.13,.55,.64],0,.22)}
		    if(lvl>=7){SEG('box',-.96,2.59,-.65,.96,2.59,-.65,.075,eraMetal,.11);for(let dx of [-.78,0,.78])O(dx,2.62,-.65,.17,.13,.17,signal,0,.18)}
		    if(lvl>=8)for(let side of [-1,1]){B(side*1.48,.91,-.53,.48,.69,.78,eraMetal);B(side*1.50,1.29,-.53,.33,.055,.48,signal,0,.20)}
		    if(lvl>=9){R(0,2.62,-.18,2.22,.30,1.72,[.12,.22,.27]);for(let side of [-1,1])R(side*1.31,1.72,-.05,.72,.30,1.64,[.12,.22,.27])}
		    if(lvl>=10){C(0,3.35,-.30,.12,1.02,.12,[.17,.30,.34]);this.sphere(x,3.91,z-.30,.30,signal,.70);for(let side of [-1,1])SEG('box',0,3.56,-.30,side*.92,3.42,-.30,.045,signal,.065,.28)}
		   }else if(k==='gold'){
		    for(let tier=2;tier<=lvl;tier++){let i=tier-2,side=i%2?1:-1,row=Math.floor(i/2);O(side*(.30+row*.18),.31,-.96+row*.18,.25,.20,.25,[.96,.72,.22],0,.12);SEG('cyl',side*(.28+row*.17),.42,-.87+row*.16,side*(.62+row*.08),.72,-.45+row*.08,.055,eraMetal)}
		    if(lvl>=3)C(-.92,1.10,-.46,.32,1.22,.32,eraMetal);if(lvl>=6){B(.83,1.03,-.35,.62,1.02,.80,[.28,.43,.44]);O(.83,1.57,-.35,.37,.13,.37,signal,0,.16)}if(lvl>=9)R(0,1.73,-.22,2.05,.36,1.62,[.13,.24,.27]);
		   }else if(k==='wood'){
		    for(let tier=2;tier<=lvl;tier++){let i=tier-2,dx=-.72+(i%3)*.72,dz=.96-Math.floor(i/3)*.27;C(dx,.30,dz,.20,.78,.20,[.66,.40,.21]);O(dx,.30,dz+.42,.22,.08,.22,[.82,.59,.31])}
		    if(lvl>=3)SEG('box',-1.01,.76,.65,1.01,.76,.65,.10,eraMetal,.16);if(lvl>=6){B(-.72,1.15,-.45,.62,.84,.72,[.28,.45,.40]);C(-.72,1.24,-.02,.38,.10,.38,[.76,.80,.75])}if(lvl>=9)R(0,1.87,-.12,2.28,.40,1.79,[.13,.25,.25]);
		   }else if(k==='steel'){
		    for(let tier=2;tier<=lvl;tier++){let i=tier-2,dx=-.78+(i%3)*.78,dz=.96-Math.floor(i/3)*.30;B(dx,.29,dz,.48,.18,.34,i%2?[.52,.61,.61]:[.72,.72,.64]);B(dx,.40,dz,.35,.045,.25,signal,0,.08)}
		    if(lvl>=3)SEG('cyl',-.88,1.54,-.38,.86,1.54,-.38,.10,eraMetal);if(lvl>=6){C(-.95,2.25,-.38,.30,2.34,.30,[.44,.53,.54]);C(.91,2.58,-.34,.26,2.78,.26,[.38,.49,.51])}if(lvl>=9)for(let side of [-1,1])R(side*.63,2.04,-.18,.82,.31,1.48,[.12,.24,.28]);
		   }else if(['store','gold_store','wood_store','steel_store'].includes(k)){
		    let cargo=k==='gold_store'?[.96,.72,.22]:k==='wood_store'?[.68,.40,.23]:k==='steel_store'?[.52,.67,.69]:[.57,.43,.75];for(let tier=2;tier<=lvl;tier++){let i=tier-2,dx=-.88+(i%3)*.88,dz=-.96+Math.floor(i/3)*.34;B(dx,.34,dz,.48,.35,.42,cargo);B(dx,.55,dz,.34,.055,.31,eraMetal)}
		    if(lvl>=3)for(let side of [-1,1])C(side*1.08,1.06,-.30,.25,1.38,.25,eraMetal);if(lvl>=6)B(0,1.63,-.24,1.92,.31,1.56,[.26,.39,.42]);if(lvl>=9)R(0,2.02,-.18,2.17,.36,1.84,[.12,.23,.27]);
		   }else if(k==='vault'){
		    for(let tier=2;tier<=lvl;tier++){let a=(tier-2)*Math.PI*2/9,dx=Math.sin(a)*1.13,dz=Math.cos(a)*.92;B(dx,.61,dz,.22,.66,.24,eraMetal);rivet(dx,.96,dz,signal,.065)}if(lvl>=4)for(let y of [.48,.92,1.36])B(0,y,1.20,1.42,.09,.09,eraMetal);if(lvl>=7)for(let side of [-1,1])B(side*1.18,1.15,.18,.29,1.28,.90,[.20,.34,.38]);if(lvl>=9)R(0,1.98,-.06,2.13,.38,1.83,[.11,.22,.27]);
		   }else if(k==='sniper'){
		    for(let tier=2;tier<=lvl;tier++){let side=tier%2?1:-1,y=1.48+(tier-2)*.10;TB(side*.60,y,.48,.18,.12,.24,eraMetal);TO(side*.60,y+.09,.48,.10,.08,.10,signal,0,.16)}if(lvl>=3)B(0,2.12,-.18,1.48,.58,1.22,[.43,.50,.43]);if(lvl>=6)for(let dx of [-.48,0,.48])TB(dx,2.12,.51,.34,.26,.055,[.12,.40,.47],0,.20);if(lvl>=9)R(0,2.61,-.03,2.02,.36,1.78,[.11,.24,.27]);
		   }else if(k==='mg'){
		    for(let tier=2;tier<=lvl;tier++){let side=tier%2?1:-1,dz=-.72+Math.floor((tier-2)/2)*.28;B(side*.86,.43,dz,.42,.34,.37,eraMetal);B(side*.86,.63,dz,.29,.055,.27,signal,0,.09)}if(lvl>=6)for(let side of [-1,1])TB(side*.78,1.38,-.05,.29,.73,.66,[.22,.32,.34]);if(lvl>=9)TO(0,1.63,-.12,1.24,.25,1.09,[.11,.23,.27]);
		   }else if(k==='mortar'){
		    for(let tier=2;tier<=lvl;tier++){let a=(tier-2)*Math.PI*2/9,dx=Math.sin(a)*1.02,dz=Math.cos(a)*.94;O(dx,.86,dz,.15,.30,.15,[.20,.27,.24]);O(dx,1.03,dz,.17,.07,.17,signal)}if(lvl>=4)TSEG('box',-.64,1.02,-.12,.64,1.58,.38,.075,eraMetal,.10);if(lvl>=7){TO(-.58,1.43,.18,.34,.25,.34,[.24,.37,.39]);TSEG('cyl',-.58,1.48,.20,-.12,1.94,.67,.07,signal)}if(lvl>=9)for(let side of [-1,1])R(side*.67,1.13,-.28,.72,.26,1.18,[.12,.24,.27]);
		   }else if(k==='cannon'){
		    for(let tier=2;tier<=lvl;tier++){let side=tier%2?1:-1,dz=-.73+Math.floor((tier-2)/2)*.30;B(side*1.04,.61,dz,.18,.31,.38,eraMetal);for(let y of [.47,.67])rivet(side*1.15,y,dz,signal,.045)}if(lvl>=5)for(let side of [-1,1])TB(side*.68,1.21,-.24,.26,.48,.62,[.26,.39,.42]);if(lvl>=8)TO(0,1.55,-.25,1.17,.24,1.02,[.16,.29,.33]);if(lvl>=9)for(let side of [-1,1])R(side*.72,.93,-.52,.74,.25,1.32,[.11,.23,.27]);
		   }
		  }
			  // Every level adds one persistent structural fitting. Lv.10 therefore carries all nine upgrades.
			  let defensive=defense,accent=k==='gold'||k==='gold_store'?[.96,.70,.24]:k==='wood'||k==='wood_store'?[.78,.42,.24]:k==='steel'||k==='steel_store'?[.36,.70,.76]:k==='vault'?[.42,.72,.66]:defensive?(hostile?[.72,.28,.23]:[.24,.57,.63]):[.45,.56,.53],trim=[.73,.66,.45],edge=k==='hq'?1.56:1.34,oldSteel=[.30,.38,.37],stealth=[.12,.23,.27],future=[.26,.86,.91];
		  // A shared era kit makes every building read as crude field gear, 1950s machinery,
		  // 1990s modular hardware, then low-observable future architecture. Each level keeps its prior fittings.
		  if(lvl>=2)for(let side of [-1,1]){B(side*edge,.32,-.73,.16,.36,.18,accent);SEG('box',side*(edge-.08),.22,-.82,side*(edge-.08),.57,-.55,.055,oldSteel);rivet(side*edge,.52,-.73,trim,.055)}
		  if(lvl>=3)for(let side of [-1,1]){C(side*edge,.37,.43,.16,.34,.16,oldSteel);O(side*edge,.57,.43,.19,.09,.19,trim);B(side*edge,.24,.67,.13,.17,.28,oldSteel)}
		  if(lvl>=4){SEG('cyl',-edge,.27,.88,edge,.27,.88,.055,trim);for(let dx of [-edge,0,edge]){O(dx,.31,.88,.15,.12,.15,accent);rivet(dx,.37,.94,trim,.038)}}
		  if(lvl>=5)for(let side of [-1,1]){C(side*(edge-.13),.70,-.92,.055,.70,.055,oldSteel);O(side*(edge-.13),1.07,-.92,.20,.13,.20,[1,.64,.22],0,.18);SEG('box',side*(edge-.28),.50,-.91,side*(edge-.02),.74,-.91,.045,trim)}
		  if(lvl>=6)for(let side of [-1,1]){SEG('box',side*edge,.42,-.48,side*edge,.84,.13,.065,[.47,.52,.46]);B(side*edge,.84,.13,.22,.11,.30,accent);B(side*(edge-.05),.55,.22,.05,.46,.46,[.19,.29,.31])}
		  if(lvl>=7){C(-edge+.18,.80,.94,.065,1.05,.065,oldSteel);B(-edge+.18,1.31,.94,.65,.055,.10,trim);O(-edge+.18,1.31,.94,.17,.14,.17,accent,0,.10);B(-edge+.48,1.09,.94,.12,.28,.08,[.10,.24,.30],0,.16)}
		  if(lvl>=8){B(edge-.15,.47,.93,.48,.46,.39,[.24,.32,.34]);for(let y of [.35,.55])B(edge-.15,y,1.14,.34,.055,.035,trim);C(edge+.12,.77,.93,.06,.55,.06,accent);B(edge-.15,.72,1.15,.30,.07,.035,[.20,.68,.72],0,.28)}
			  if(lvl>=9){for(let side of [-1,1]){R(side*.58,.57,-1.05,.73,.25,.68,stealth);B(side*.58,.42,-1.19,.67,.13,.39,stealth);B(side*.58,.64,-1.30,.44,.035,.035,future,0,.43)}C(0,.66,-1.19,.12,.76,.12,[.18,.31,.34]);O(0,1.07,-1.19,.27,.12,.27,future,0,.24)}
			  if(lvl>=10){for(let side of [-1,1])for(let dz of [-.42,.42]){R(side*(edge+.02),.71,dz,.38,.27,.46,stealth);O(side*(edge+.02),.94,dz,.18,.10,.18,future,0,.30)}B(0,.22,-1.36,1.18,.055,.075,future,0,.48);for(let side of [-1,1])B(side*.72,.28,-1.36,.06,.14,.08,[.09,.18,.22],0,.30)}
			  if(defensive){let mount={sniper:[.70,1.96,.16],mg:[.78,1.50,-.24],mortar:[.78,1.44,-.28],cannon:[.82,1.42,-.34],rocket:[.94,1.48,-.31],missile:[1.02,1.60,-.38]}[k]||[.78,1.48,-.25],[lampBaseX,lampY,mountZ]=mount,lampDx=k==='missile'||k==='rocket'?Math.max(lampBaseX,launcherRack(k,lvl).railX+.27):lampBaseX,reach=Math.min(8.2,Math.max(5.8,BUILD[k].range*.72)),[lampX,lampZ]=place(lampDx,mountZ+.09),[farX,farZ]=place(lampDx,mountZ+reach),level=this.lampLevel((b.id||0)*29+11);TSEG('box',lampDx-.28,lampY-.22,mountZ-.12,lampDx,lampY,mountZ,.055,[.54,.50,.34],.075);TB(lampDx,lampY,mountZ,.31,.22,.27,[.18,.23,.22]);TB(lampDx,lampY,mountZ+.09,.15,.11,.04,level>.01?[1,.86,.48]:[.28,.31,.29],0,.82*level);this.spotlight(lampX,lampY,lampZ,farX,.34,farZ,.72+reach*.045,level)}
			 }
	 localLightData(buildings=[],includeDock=false,craftCount=0){if(this.nightGlow<=.002)return [];let lights=[],valid=buildings.filter(b=>!(b.hp!==undefined&&b.hp<=0)&&!b.constructionEnd&&!b.site),utility=new Set(['gold','wood','steel','store','gold_store','wood_store','steel_store','vault']),push=(x,y,z,radius,strength,color=[1,.48,.16],key=0)=>{let level=this.lampLevel(key);if(level>.002)lights.push({x,y,z,radius,strength:strength*level,color})};
	  for(let b of valid.filter(b=>b.type==='hq')){push(b.x-.78,1.66,b.z+1.04,8.6,1.78,[1,.48,.16],b.id*31+1);push(b.x+.78,1.66,b.z+1.04,8.6,1.78,[1,.48,.16],b.id*31+2)}
	  if(includeDock){let count=Math.max(1,Math.min(MAX_LANDING_CRAFT,craftCount)),center=-2.65,length=Math.max(18,(count-1)*5.35+7.2),dockIndex=0;for(let z=center-length/2+1.05;z<=center+length/2-.7;z+=5.35)push(21.98,1.52,z,6.6,1.42,[1,.58,.22],810+dockIndex++);for(let z of [center-4.55,center+4.55])push(25.58,1.52,z,7.1,1.55,[1,.62,.25],860+dockIndex++)}
	  for(let b of valid.filter(b=>utility.has(b.type))){let industrial=['gold','wood','steel'].includes(b.type),side=(b.id%2?1:-1)*.62,radius=industrial?5.9:4.9,strength=industrial?1.16:.96;push(b.x+side,1.32,b.z+.78,radius,strength,industrial?[1,.50,.16]:[1,.44,.13],b.id*37+5)}
	  return lights.slice(0,24)
	 }
	 uploadLocalLights(buildings,includeDock,craftCount){let gl=this.gl;this.loc.u_lightCount??=gl.getUniformLocation(this.p,'u_lightCount');this.loc.u_lightPosRadius??=gl.getUniformLocation(this.p,'u_lightPosRadius[0]');this.loc.u_lightColorStrength??=gl.getUniformLocation(this.p,'u_lightColorStrength[0]');let lights=this.localLightData(buildings,includeDock,craftCount),positions=new Float32Array(24*4),colors=new Float32Array(24*4);for(let i=0;i<lights.length;i++){let l=lights[i],o=i*4;positions.set([l.x,l.y,l.z,l.radius],o);colors.set([...l.color,l.strength],o)}gl.uniform1i(this.loc.u_lightCount,lights.length);gl.uniform4fv(this.loc.u_lightPosRadius,positions);gl.uniform4fv(this.loc.u_lightColorStrength,colors)}
	 nightLights(buildings){let gl=this.gl,utility=new Set(['gold','wood','steel','store','gold_store','steel_store','wood_store','vault']);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);for(let b of buildings){if(b.hp!==undefined&&b.hp<=0||b.constructionEnd||b.site||b.type!=='hq'&&!utility.has(b.type))continue;let hq=b.type==='hq',height=hq?1.66:1.32,lamps=hq?[-.78,.78]:[(b.id%2?1:-1)*.62],pool=hq?7.7:['gold','wood','steel'].includes(b.type)?5.55:4.65;for(let lampIndex=0;lampIndex<lamps.length;lampIndex++){let dx=lamps[lampIndex],key=hq?b.id*31+lampIndex+1:b.id*37+5,glow=this.lampLevel(key),lampZ=b.z+(hq?1.04:.78);this.box(b.x+dx,height+.10,lampZ,.30,.14,.18,[.16,.18,.16]);this.box(b.x+dx,height+.015,lampZ+.10,.17,.13,.045,glow>.008?[1,.47,.14]:[.29,.25,.19],0,1.02*glow);this.draw('roof',b.x+dx,height+.20,lampZ+.015,.37,.13,.30,[.24,.22,.16],Math.PI/4);if(glow<=.008)continue;let poolX=b.x+dx,poolZ=b.z+(hq ? .74 : .56);for(let [scale,alpha] of [[1,.018],[.58,.034],[.27,.052]])this.draw('cyl',poolX,.162,poolZ,pool*scale,.012,pool*scale,[1,.39,.10],0,.16*glow,0,alpha*glow)}}gl.depthMask(true);gl.disable(gl.BLEND)}
 unit(u,tick,hostile=false){
	  if(u.hp<=0)return;let x=u.x,z=u.z,k=u.type,scale=k==='tank'?.70:.62,groundY=.08,scaleY=y=>groundY+(y-groundY)*scale,walk=Math.sin(u.walk*16+u.id)*.12,heading=Number.isFinite(u.aimX)&&Number.isFinite(u.aimZ)?Math.atan2(u.aimX-x,u.aimZ-z):0,c=Math.cos(heading),s=Math.sin(heading),place=(dx,dz)=>[x+dx*scale*c+dz*scale*s,z-dx*scale*s+dz*scale*c];
	  const B=(dx,y,dz,sx,sy,sz,col,glow=0)=>{let [px,pz]=place(dx,dz);this.box(px,scaleY(y),pz,sx*scale,sy*scale,sz*scale,col,heading,glow)};
	  const C=(dx,y,dz,sx,sy,sz,col,glow=0)=>{let [px,pz]=place(dx,dz);this.draw('cyl',px,scaleY(y),pz,sx*scale,sy*scale,sz*scale,col,heading,glow)};
	  const O=(dx,y,dz,sx,sy,sz,col,glow=0)=>{let [px,pz]=place(dx,dz);this.draw('oct',px,scaleY(y),pz,sx*scale,sy*scale,sz*scale,col,heading,glow)};
	  const S=(which,ax,ay,az,bx,by,bz,width,col,depth=width,glow=0)=>{let [x1,z1]=place(ax,az),[x2,z2]=place(bx,bz);this.segment(which,x1,scaleY(ay),z1,x2,scaleY(by),z2,width*scale,depth*scale,col,glow)};
  O(0,.17,0,k==='tank'?1.52:.68,.065,k==='tank'?1.91:.64,[.16,.29,.29]);
  if(k==='tank'){
   let teal=hostile?[.62,.24,.21]:[.18,.62,.72],white=[.83,.84,.73],dark=[.10,.19,.22];
	   for(let side of [-1,1]){B(side*.77,.43,0,.40,.50,2.03,dark);B(side*1.00,.43,0,.13,.42,1.91,[.08,.13,.15]);for(let dz of [-.68,-.28,.13,.54]){S('cyl',side*1.03,.44,dz,side*.72,.44,dz,.34,[.24,.38,.40]);let [px,pz]=place(side*1.055,dz);this.sphere(px,scaleY(.44),pz,.095*scale,[.69,.61,.37],.04)}}
   O(0,.62,.02,1.49,.56,1.82,teal);B(0,.72,.53,1.25,.22,.54,white);for(let dx of [-.46,.46])B(dx,.84,.69,.41,.13,.31,teal);
   for(let side of [-1,1])B(side*.73,.83,-.13,.10,.14,1.48,white);O(0,.98,-.18,1.12,.52,1.19,teal);O(0,1.27,-.20,.61,.18,.61,[.16,.42,.48]);
   S('cyl',0,1.05,.27,0,1.10,1.93,.22,teal);S('cyl',0,1.09,1.73,0,1.10,2.19,.31,dark);S('box',-.31,1.00,1.98,.31,1.21,1.98,.07,white,.09);
   C(0,1.45,-.21,.15,.35,.15,[.76,.62,.29]);for(let side of [-1,1]){B(side*.47,.77,1.00,.25,.24,.21,[.89,.67,.25],.18);B(side*.76,.77,-.71,.28,.24,.40,[.29,.39,.39])}
   for(let dz of [-.72,-.43]){S('cyl',-.56,.97,dz,-.56,1.17,dz,.18,[.37,.41,.38]);B(-.56,1.18,dz,.20,.04,.20,[.19,.24,.24])}
  }else{
   let skin=hostile?[.66,.46,.37]:[.73,.59,.47],coat=hostile?[.66,.26,.21]:k==='rifle'?[.28,.43,.29]:k==='heavy'?[.63,.49,.24]:k==='rocket'?[.49,.31,.25]:[.88,.90,.82],pants=hostile?[.39,.22,.20]:k==='medic'?[.55,.62,.57]:[.28,.33,.29],helmet=hostile?[.37,.18,.17]:k==='medic'?[.78,.82,.75]:k==='rocket'?[.44,.37,.31]:k==='heavy'?[.52,.43,.28]:[.27,.38,.28],metal=[.10,.15,.17],bulky=k==='heavy',width=bulky?.58:k==='rocket'?.43:.40;
   // Separated legs, boots and articulated arms read as a person even at battle zoom.
   for(let side of [-1,1]){let hip=side*.16,foot=side*.20+walk*side;S('cyl',hip,.68,0,foot,.26,walk*1.2,.16,pants);B(foot,.18,.13+walk*1.1,.22,.16,.38,[.19,.20,.18]);}
   O(0,.68,0,width*.92,.30,.38,pants);C(0,.99,-.01,width,.70,width*.72,coat);B(0,1.05,.25,width*.86,.56,.14,bulky?[.47,.38,.23]:k==='medic'?[.86,.88,.80]:[.34,.36,.28]);
   for(let dx of [-.24,0,.24])B(dx,.91,.35,.17,.22,.12,bulky?[.56,.43,.23]:[.44,.39,.25]);B(0,.74,.27,width*1.04,.10,.17,[.16,.21,.20]);
	   S('cyl',-.29,1.19,.04,-.38,.92,.35,.14,skin);S('cyl',.29,1.19,.04,.36,.94,.55,.14,skin);let [gloveX,gloveZ]=place(-.38,.35);this.sphere(gloveX,scaleY(.91),gloveZ,.16*scale,[.19,.22,.20]);
	   C(0,1.39,0,.12,.16,.12,skin);this.sphere(x,scaleY(1.59),z,.34*scale,skin);O(0,1.78,-.02,.49,.22,.46,helmet);B(0,1.72,.25,.57,.055,.18,helmet);B(0,1.62,.29,.18,.10,.09,skin);
   B(0,1.16,-.33,width*.96,.57,.25,k==='medic'?[.68,.75,.69]:[.28,.32,.26]);for(let side of [-1,1])B(side*(width+.05),1.22,-.04,.17,.24,.29,bulky?[.74,.57,.27]:helmet);
   if(k==='rifle'){
    S('box',-.41,.99,.30,.34,1.02,.91,.13,metal,.16);S('cyl',.26,1.02,.84,.43,1.02,1.16,.07,[.08,.12,.13]);B(-.29,1.00,.22,.24,.22,.17,[.38,.24,.15]);B(.04,.91,.58,.11,.26,.12,metal);B(.11,1.15,.64,.20,.08,.20,[.16,.20,.18]);
   }else if(k==='heavy'){
    S('box',-.48,1.02,.27,.37,1.00,.78,.19,metal,.24);for(let dx of [-.12,.08])S('cyl',dx,1.04,.63,dx,1.05,1.39,.095,[.07,.11,.13]);S('cyl',-.02,1.05,1.25,-.02,1.05,1.55,.16,[.06,.09,.10]);B(-.26,.86,.55,.43,.52,.24,[.30,.33,.27]);
    for(let i=0;i<6;i++){let a=i*.12-.30;B(.22+a*.28,1.18-a*.38,.43+a*.14,.065,.11,.065,[.90,.67,.22],.07)}B(0,1.41,-.24,.75,.11,.32,[.86,.67,.29]);
   }else if(k==='rocket'){
    S('roundCell',-.30,1.36,-.43,-.30,1.38,1.18,.20,[.18,.23,.24]);S('roundCell',-.30,1.38,.86,-.30,1.39,1.27,.27,[.83,.34,.20]);
    if(!(u.cool>0)){let muzzle=muzzleWorld(unitMuzzle(k),heading,x,z),cell=unitRocketRound(),tail=muzzle.point.map((q,i)=>q-muzzle.axis[i]*(cell.bodyLength+cell.noseLength));this.launcherRound(cell,tail,muzzle.axis,false)}
    B(.27,.95,.42,.31,.25,.27,[.60,.31,.26]);B(0,1.83,-.03,.43,.055,.23,[.88,.59,.31]);
   }else if(k==='medic'){
    B(0,1.17,-.39,.63,.67,.31,[.91,.91,.82]);B(0,1.20,-.56,.39,.10,.07,[.72,.22,.25],.18);B(0,1.20,-.55,.10,.39,.07,[.72,.22,.25],.18);B(.36,.91,.39,.30,.36,.31,[.31,.73,.78]);B(.36,.92,.56,.17,.055,.04,[.83,.27,.29],.18);B(.36,.92,.56,.055,.18,.04,[.83,.27,.29],.18);B(0,1.84,.04,.26,.055,.24,[.77,.22,.25]);
   }
  }
	  if(tick<u.runUntil&&Math.sin(u.walk*18+u.id)>.62){let [d1x,d1z]=place(-.18,.26),[d2x,d2z]=place(.2,.45);this.sphere(d1x,scaleY(.15),d1z,.17*scale,[.81,.75,.57]);this.sphere(d2x,scaleY(.13),d2z,.11*scale,[.70,.72,.58])}
  if(u.hp<u.maxHp){let ratio=u.hp/u.maxHp;B(0,k==='tank'?1.92:2.05,0,.82*ratio,.065,.065,ratio>.4?[.44,.97,.62]:[.96,.34,.28])}
 }
	 deckCrew(x,z,type,count,bob,heading=0){
	  let n=Math.max(0,Math.min(type==='tank'?4:18,Math.floor(Number(count)||0)));
	  let c=Math.cos(heading),s=Math.sin(heading),place=(dx,dz)=>[x+dx*c+dz*s,z-dx*s+dz*c],B=(dx,y,dz,sx,sy,sz,color)=>{let [px,pz]=place(dx,dz);this.box(px,y+bob,pz,sx,sy,sz,color,heading)};
	  if(type==='tank'){
	   let rows=Math.ceil(n/2),shown=0;for(let row=0;row<rows;row++){let group=Math.min(2,n-shown),dz=-.45+(row-(rows-1)/2)*1.02;for(let col=0;col<group;col++,shown++){let dx=(col-(group-1)/2)*.72;
	    B(dx-.25,.37,dz,.13,.22,.68,[.16,.25,.27]);B(dx+.25,.37,dz,.13,.22,.68,[.16,.25,.27]);B(dx,.39,dz,.54,.23,.61,[.35,.49,.51]);B(dx,.56,dz-.08,.30,.16,.35,[.22,.34,.37]);B(dx,.56,dz-.37,.08,.08,.45,[.17,.29,.32]);
	   }}
	   return n;
	  }
  let uniform={rifle:[.39,.52,.36],heavy:[.67,.56,.36],rocket:[.62,.42,.42],medic:[.81,.85,.78]}[type]||[.39,.52,.36],rows=Math.ceil(n/3);
  for(let row=0,shown=0;row<rows;row++){let group=Math.min(3,n-shown),dz=-.54+(row-(rows-1)/2)*.47;
   for(let col=0;col<group;col++,shown++){let dx=(col-(group-1)/2)*.43,[px,pz]=place(dx,dz);
    B(dx,.46,dz,.22,type==='heavy'?.35:.29,.22,uniform);this.sphere(px,.72+bob,pz,.15,type==='medic'?[.88,.91,.87]:[.71,.63,.51]);
    if(type==='rocket')B(dx+.13,.55,dz+.03,.09,.09,.34,[.30,.36,.34]);
    if(type==='medic')B(dx,.47,dz-.12,.09,.10,.025,[.82,.27,.29]);
   }
  }
  return n;
 }
 ship(x,z,large=false,door=0,type='rifle',passengers=0,heading=0,hostile=false,turretTarget=null,level=1){
	  let w=large?3.25:2.08,len=large?8.7:5.05,bob=Math.sin(this.time*1.55+x*.45)*.027,c=Math.cos(heading),s=Math.sin(heading),place=(dx,dz)=>[x+dx*c+dz*s,z-dx*s+dz*c];
  const B=(dx,y,dz,sx,sy,sz,col,glow=0)=>{let [px,pz]=place(dx,dz);this.box(px,y+bob,pz,sx,sy,sz,col,heading,glow)};
  const C=(dx,y,dz,sx,sy,sz,col)=>{let [px,pz]=place(dx,dz);this.cyl(px,y+bob,pz,sx,sy,sz,col,heading)};
  const O=(dx,y,dz,sx,sy,sz,col,glow=0)=>{let [px,pz]=place(dx,dz);this.draw('oct',px,y+bob,pz,sx,sy,sz,col,heading,glow)};
  const S=(which,ax,ay,az,bx,by,bz,width,col,depth=width,glow=0)=>{let [x1,z1]=place(ax,az),[x2,z2]=place(bx,bz);this.segment(which,x1,ay+bob,z1,x2,by+bob,z2,width,depth,col,glow)};
  let hull=large?[.20,.31,.34]:hostile?[.53,.24,.22]:[.29,.35,.33],deck=large?[.54,.57,.53]:hostile?[.71,.44,.34]:[.58,.59,.53];
	  this.draw(large?'hull':'landingHull',x,-.19+bob,z,w,.91,len,hull,heading);
	  B(0,.14,.05,w*.77,.13,len*.80,deck);
	  // A recessed floor and bulkheads hide the sea from every camera angle, including through an open bow ramp.
	  B(0,-.08,-.02,w*.69,.20,len*.86,[.16,.24,.25]);B(0,.05,len*.43,w*.70,.48,.12,hull);B(0,.03,-len*.43,w*.71,.39,.12,hull);
  for(let side of [-1,1]){
   B(side*w*.44,.40,.16,.075,.26,len*.82,large?[.50,.58,.59]:[.45,.49,.44]);
   B(side*w*.43,.14,-.20,.075,.17,len*.67,[.16,.27,.29]);
   for(let dz of [-len*.31,0,len*.31])B(side*w*.42,.55,dz,.09,.31,.08,[.71,.71,.63]);
   let [wakeX,wakeZ]=place(side*w*.39,.32);this.draw('oct',wakeX,-.40+bob,wakeZ,.36,.07,.85,[.69,.83,.79],heading,.08);
  }
  if(large){
   // Patrol gunboat: faceted bridge, two working turrets, ten tubes, railings, radar and deck equipment.
   let navy=[.22,.31,.34],steel=[.48,.53,.51],pale=[.68,.70,.63],glass=[.10,.30,.37],orange=[.92,.43,.20];
   B(0,.46,2.04,1.80,.66,1.84,pale);O(0,.83,2.07,2.02,.31,2.02,navy);B(0,1.08,2.14,1.62,.40,1.32,steel);
   for(let side of [-1,1]){B(side*.57,1.09,1.48,.43,.24,.08,glass,.14);B(side*.60,1.09,2.30,.47,.24,.08,glass,.14)}B(0,1.09,1.35,.55,.24,.08,glass,.14);
	   for(let turretIndex=0;turretIndex<2;turretIndex++){let dz=[-2.35,-.64][turretIndex];
	    let [tx,tz]=place(0,dz),turretHeading=turretTarget&&Number.isFinite(turretTarget.heading)?turretTarget.heading:turretTarget&&Number.isFinite(turretTarget.x)&&Number.isFinite(turretTarget.z)?Math.atan2(tx-turretTarget.x,tz-turretTarget.z):idleWeaponHeading(this.time,61+turretIndex*7+Math.round(x*3+z),heading,.58),tc=Math.cos(turretHeading),ts=Math.sin(turretHeading),turretPlace=(dx,forward)=>[tx+dx*tc+forward*ts,tz-dx*ts+forward*tc],TO=(y,forward,sx,sy,sz,col)=>{let [px,pz]=turretPlace(0,forward);this.draw('oct',px,y+bob,pz,sx,sy,sz,col,turretHeading)},TB=(dx,y,forward,sx,sy,sz,col)=>{let [px,pz]=turretPlace(dx,forward);this.box(px,y+bob,pz,sx,sy,sz,col,turretHeading)},TS=(dx,ay,az,by,bz,width,col)=>{let [ax,awz]=turretPlace(dx,az),[bx,bwz]=turretPlace(dx,bz);this.segment('cyl',ax,ay+bob,awz,bx,by+bob,bwz,width,width,col)};
	    O(0,.55,dz,.91,.31,.86,[.32,.39,.40]);TO(.75,-.06,.92,.37,.90,steel);TO(.96,-.13,.57,.24,.55,navy);for(let dx of [-.18,.18])TS(dx,.87,.17,.88,-1.18,.115,[.10,.18,.22]);for(let dx of [-.18,.18])TS(dx,.88,-1.06,.88,-1.36,.17,[.08,.13,.15]);TB(0,1.10,.02,.41,.08,.37,[.27,.33,.33]);
	    {let [lampX,lampZ]=turretPlace(.33,-.34),[farX,farZ]=turretPlace(.33,-8.2),level=this.lampLevel(930+turretIndex);TB(.33,.87,-.29,.24,.20,.25,[.19,.23,.22]);TB(.33,.87,-.43,.12,.10,.035,level>.01?[1,.86,.48]:[.28,.31,.29]);this.spotlight(lampX,.87+bob,lampZ,farX,.36+bob,farZ,1.05,level)}
	   }
   // Ten visible launch tubes: five on each side, matching the ten-round barrage.
   for(let side of [-1,1])for(let i=0;i<5;i++){let dz=-.40+i*.27;S('cyl',side*.91,.67,dz+.18,side*1.18,.82,dz-.10,.15,navy);S('cyl',side*1.11,.78,dz-.02,side*1.27,.87,dz-.19,.18,orange);B(side*.86,.61,dz+.19,.10,.24,.11,[.30,.35,.34])}
   for(let side of [-1,1]){B(side*1.41,.21,.12,.075,.07,4.62,[.77,.79,.68]);for(let dz=-3.35;dz<3.65;dz+=.58){B(side*1.44,.48,dz,.045,.53,.045,[.54,.59,.55]);B(side*1.44,.72,dz,.045,.04,.60,[.54,.59,.55])}B(side*.93,.48,3.34,.39,.31,.48,[.40,.44,.42]);O(side*.93,.69,3.34,.22,.18,.22,[.92,.70,.28],.13)}
   C(0,1.62,2.22,.10,.93,.10,[.31,.36,.35]);for(let y of [1.45,1.78,2.10])B(0,y,2.22,1.08,.055,.08,[.56,.61,.56]);
   let [radarX,radarZ]=place(.48,2.22);this.draw('sphere',radarX,1.91+bob,radarZ,.62,.48,.11,[.72,.76,.69],heading,.08);C(.48,1.92,2.20,.09,.22,.09,[.73,.61,.32]);O(-.44,2.09,2.21,.28,.30,.28,[.83,.75,.47],.10);
   for(let side of [-1,1]){C(side*.83,.78,2.84,.31,.69,.31,[.30,.35,.34]);C(side*.83,1.17,2.84,.35,.12,.35,[.13,.20,.21]);B(side*1.25,.44,-1.70,.27,.25,.47,[.72,.70,.59]);O(side*1.25,.45,-1.70,.12,.28,.12,orange)}
   B(0,.38,-3.84,.67,.15,.39,pale);S('cyl',0,.44,3.74,0,.44,4.18,.12,[.25,.31,.31]);O(0,.44,4.17,.28,.16,.28,[.74,.63,.36]);
  }else{
   let stripe={rifle:[.39,.52,.36],heavy:[.67,.56,.36],rocket:[.62,.42,.42],tank:[.37,.51,.57],medic:[.73,.77,.73]}[type]||[.40,.52,.36];
   B(0,.40,1.72,w*.66,.61,.78,[.51,.56,.51]);O(0,.67,1.70,w*.70,.17,.82,[.28,.36,.36]);B(0,.71,1.34,w*.56,.24,.11,[.12,.31,.37],.11);
   B(0,.25,-.03,w*.67,.11,2.7,[.42,.45,.42]);for(let dz of [-.98,-.34,.30,.94])B(0,.29,dz,w*.64,.035,.055,[.68,.67,.57]);
   this.deckCrew(x,z,type,passengers,bob,heading);
   B(0,.31,-1.53,w*.65,.09,.26,stripe);for(let side of [-1,1]){B(side*w*.32,.36,-1.52,.18,.18,.17,[.80,.69,.33]);C(side*w*.31,.47,-1.52,.06,.24,.06,[.29,.34,.32])}
	   let ramp=Math.max(0,Math.min(1,door)),hingeZ=-len*.485;if(ramp<.06)B(0,.40,hingeZ,w*.82,.16,.15,[.63,.63,.57]);else{let tipZ=hingeZ-.20-1.12*ramp,tipY=.40-.29*ramp;S('box',0,.40,hingeZ,0,tipY,tipZ,w*.70,[.63,.63,.57],.075);for(let q of [.22,.48,.74]){let rz=hingeZ+(tipZ-hingeZ)*q,ry=.40+(tipY-.40)*q;S('box',-w*.34,ry,rz,w*.34,ry,rz,.035,[.34,.40,.38],.055)}for(let side of [-1,1])S('cyl',side*w*.38,.48,hingeZ,side*w*.35,tipY+.08,tipZ,.025,[.48,.51,.46])}B(0,.38,hingeZ,w*.88,.07,.10,[.37,.44,.42]);for(let side of [-1,1])C(side*w*.39,.40,hingeZ,.075,.22,.075,[.72,.61,.35]);
   for(let side of [-1,1]){B(side*.58,.29,-2.10,.16,.14,.23,[.75,.74,.65]);O(side*.58,.40,-2.10,.14,.16,.14,[.95,.72,.28],.12);S('box',side*w*.39,.58,-1.72,side*w*.39,.58,.85,.035,[.70,.71,.63]);for(let dz of [-1.60,-.90,-.20,.50])B(side*w*.39,.46,dz,.04,.30,.04,[.60,.62,.57])}
	   B(0,.86,1.72,.12,.30,.12,[.40,.44,.40]);O(0,1.03,1.72,.20,.12,.20,[.88,.68,.27],.12);
	  }
	  level=Math.max(1,Math.min(10,Math.floor(level)||1));let upgradeMetal=level>=9?[.11,.23,.27]:level>=6?[.24,.38,.41]:level>=3?[.45,.49,.45]:[.62,.59,.48],upgradeGlow=level>=9?[.25,.91,.94]:[.92,.66,.25];
	  if(!large){
	   if(level>=2)for(let side of [-1,1])B(side*.74,.37,-1.00,.24,.20,.52,[.49,.47,.39]);
	   if(level>=3){B(0,.55,.90,w*.61,.31,.42,upgradeMetal);for(let side of [-1,1])B(side*.61,.61,.90,.30,.20,.055,[.12,.37,.42],.14)}
	   if(level>=4)for(let side of [-1,1]){B(side*.78,.42,.04,.18,.48,2.52,upgradeMetal);for(let dz of [-.74,.04,.82])B(side*.88,.47,dz,.08,.18,.35,[.73,.64,.39])}
	   if(level>=5){C(-.47,1.03,1.62,.07,.57,.07,upgradeMetal);B(-.47,1.31,1.62,.66,.045,.055,upgradeGlow,.22)}
	   if(level>=6){O(0,.83,1.69,w*.72,.28,.91,[.24,.37,.40]);B(0,.80,1.25,w*.52,.22,.08,[.12,.42,.49],.20)}
	   if(level>=7)for(let side of [-1,1]){B(side*.84,.29,-.29,.17,.31,3.15,[.26,.39,.41]);B(side*.91,.43,.36,.055,.055,2.02,upgradeGlow,.18)}
	   if(level>=8){C(.48,1.20,1.64,.07,.58,.07,upgradeMetal);O(.48,1.51,1.64,.24,.10,.24,upgradeGlow,.22)}
	   if(level>=9)for(let side of [-1,1]){S('box',side*.86,.57,-1.45,side*.86,.76,.95,.20,[.10,.22,.26],.07);B(side*.65,.76,1.57,.54,.24,.62,[.11,.23,.27])}
	   if(level>=10){B(0,.73,-1.45,w*.56,.08,.08,upgradeGlow,.42);for(let side of [-1,1])O(side*.68,.71,-1.46,.18,.11,.18,upgradeGlow,.30)}
	  }else{
	   if(level>=2)for(let side of [-1,1])for(let dz of [-2.94,2.94])B(side*1.27,.49,dz,.31,.23,.42,[.50,.48,.40]);
	   if(level>=3){B(0,1.35,2.03,1.77,.24,1.38,upgradeMetal);for(let side of [-1,1])B(side*.62,1.37,1.34,.48,.20,.055,[.10,.36,.42],.18)}
	   if(level>=4)for(let side of [-1,1]){B(side*1.26,.54,.24,.19,.52,5.82,upgradeMetal);for(let dz of [-2.42,-1.20,1.00,2.62])B(side*1.38,.62,dz,.08,.21,.48,[.74,.64,.38])}
	   if(level>=5){C(-.72,2.15,2.19,.09,.88,.09,upgradeMetal);for(let y of [1.83,2.15,2.47])B(-.72,y,2.19,.88,.045,.055,upgradeGlow,.20)}
	   if(level>=6)for(let side of [-1,1]){O(side*.72,1.30,2.12,.54,.34,.72,[.23,.37,.40]);B(side*.72,1.32,1.72,.40,.18,.055,[.12,.44,.50],.20)}
	   if(level>=7){B(0,.68,-3.28,1.32,.31,.84,[.25,.38,.41]);for(let side of [-1,1])O(side*.45,.90,-3.30,.24,.21,.24,upgradeGlow,.16)}
	   if(level>=8){C(.70,2.34,2.18,.08,.72,.08,upgradeMetal);let [sensorX,sensorZ]=place(.70,2.18);this.draw('sphere',sensorX,2.71+bob,sensorZ,.42,.31,.10,upgradeGlow,heading,.24)}
	   if(level>=9)for(let side of [-1,1]){S('box',side*1.32,.76,-3.18,side*1.32,.96,2.86,.22,[.10,.22,.26],.08);O(side*.72,1.54,2.06,.77,.22,.86,[.11,.23,.27])}
	   if(level>=10){B(0,.73,-3.76,1.64,.075,.075,upgradeGlow,.48);for(let side of [-1,1])B(side*1.08,.78,-3.51,.08,.16,.62,[.20,.86,.90],.38)}
	  }
	 }
 launcherRound(cell,tail,axis,motor=false){
  let n=normalize(axis),point=d=>tail.map((q,i)=>q+n[i]*d),side=normalize(cross(Math.abs(n[1])<.94?[0,1,0]:[1,0,0],n)),up=normalize(cross(n,side)),missile=cell.type==='missile',body=missile?[.84,.13,.085]:[.79,.23,.18],nose=missile?(cell.exposed?[.12,.13,.14]:body):[.95,.35,.18],metal=[.10,.16,.17],band=[.72,.47,.19],caliber=cell.caliber,bodyLength=cell.bodyLength,length=bodyLength+cell.noseLength;
  const seg=(mesh,a,b,width,color,depth=width,glow=0)=>this.segment(mesh,...a,...b,width,depth,color,glow);
  seg('cyl',point(0),point(bodyLength),caliber,body);seg('cone',point(bodyLength),point(length),caliber,nose);
  seg('cyl',point(bodyLength*.18),point(bodyLength*.30),caliber*1.04,band);
  seg('cyl',point(-caliber*.28),point(caliber*.07),caliber*.87,metal);
  if(cell.exposed){
   for(let plane of [side,up])for(let sign of [-1,1]){let a=point(bodyLength*.09),b=point(bodyLength*.26);a=a.map((q,i)=>q+plane[i]*sign*caliber*.36);b=b.map((q,i)=>q+plane[i]*sign*caliber*.78);seg('box',a,b,caliber*.12,body,caliber*.24)}
  }
  if(motor){let boost=Math.min(1,motor===true?1:motor);seg('cone',point(-caliber*.20),point(-caliber*(1+boost*.9)),caliber*.58,[1,.58,.16],caliber*.58,.7);this.sphere(...point(-caliber*.32),caliber*.44,[1,.86,.44],.75)}
 }
 launcherFlight(shell,battle,source){
  let cell=launcherCell(shell.weapon,shell.level??source?.lvl??1,shell.lane||0,shell.tubeCount||1),muzzle=muzzleWorld({point:cell.tip,axis:cell.axis},shell.heading??source?.heading??0,shell.fromX??source?.x??0,shell.fromZ??source?.z??0),origin=muzzle.point,axis=muzzle.axis,duration=Math.max(1,shell.land-shell.start),hold=!cell.exposed&&!cell.boxed?Math.min(shell.weapon==='rocket'?3:6,duration*.25):0,t=Math.max(0,Math.min(1,(battle.tick+Math.max(0,Math.min(.999,this.simulationAlpha||0))-shell.start-hold)/(duration-hold))),target=shell.weapon==='missile'?battle.units.find(u=>u.id===shell.targetId&&u.hp>0):null,end=[target?.x??shell.lastX??shell.x,shell.weapon==='rocket'?.20:target?.type==='tank'?.72:shell.lastY??.75,target?.z??shell.lastZ??shell.z],length=cell.bodyLength+cell.noseLength,state=this.flightStates.get(shell);
  // Sample the nose itself: rotating a long tail-based model cannot push the nose below/past the impact point.
  if(!state){state={at:-1,points:[],lastEnd:end.slice()};this.flightStates.set(shell,state)}
  state.lastEnd=end.slice();
  let q=missileFlightSample(origin,axis,end,t,shell.weapon==='rocket'?.18:0),direction=t===0?axis:normalize([q.dx,q.dy,q.dz]),tail=[q.x-direction[0]*length,q.y-direction[1]*length,q.z-direction[2]*length];
  if(battle.tick!==state.at){state.points.push({x:tail[0],y:tail[1],z:tail[2],tick:battle.tick});state.points=state.points.filter(p=>battle.tick-p.tick<=11).slice(-9);state.at=battle.tick}
  if(t>0){let gl=this.gl;gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);for(let p of state.points){let age=battle.tick-p.tick;if(age<1)continue;let fade=1-age/12;this.sphere(p.x,p.y+.035*age,p.z,cell.caliber*(.28+age*.045),[.65,.65,.61],0,.40*fade)}gl.depthMask(true);gl.disable(gl.BLEND)}
  this.launcherRound(cell,tail,direction,t>0?.55+.45*smooth(t/.15):false);
 }
 missileImpact(e,battle=null){this.explosiveImpact(e,battle,true)}
 rocketImpact(e,battle=null){this.explosiveImpact(e,battle,false)}
 explosiveImpact(e,battle=null,guided=false,scale=1){
  const life=e.life??impactLifetime(e.weapon),age=e.at==null?life-e.ttl:(battle?.tick??e.at)+(this.simulationAlpha||0)-e.at;
  if(age<0||age>=life)return;
  const seconds=age/30,p=age/life,y=e.y??(guided?.72:.20),seed=e.x*.73+e.z*.37+(e.at||0)*.11,back=Math.atan2((e.fromX??e.x- Math.sin(e.heading||0))-e.x,(e.fromZ??e.z-Math.cos(e.heading||0))-e.z),fade=1-smooth((p-.45)/.55),gl=this.gl;
  // Only the first instant has a tiny white-hot core; the visible burst is made of separate flame tongues.
  const flash=Math.max(0,1-age/3);
  if(flash>0)this.sphere(e.x,y,e.z,scale*(.14+.10*flash),[1,.88,.60],flash*.72);
  gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);
  if(age<10){
   const heat=1-smooth(age/10),reach=scale*(.16+.38*Math.sin(Math.min(1,age/9)*Math.PI*.75)),count=guided?7:9;
   for(let i=0;i<count;i++){
    let a=seed+i*2.399963,l=reach*(.60+(i%3)*.14),dx=Math.cos(a)*l,dz=Math.sin(a)*l,dy=scale*(guided?.04:.07)+l*(.16+(i%3)*.25),width=scale*(.24+.25*heat);
    if(guided){dx=dx*.62+Math.sin(back)*l*.38;dz=dz*.62+Math.cos(back)*l*.38}
    this.particle(e.x+dx,y+dy,e.z+dz,width,width*(1.15+(i%2)*.33),[1,.25+.17*heat,.035],heat*.82,true,a);
   }
  }
  // Thin sparks follow fixed ballistic paths. Their positions never consume the battle RNG.
  if(age<18)for(let i=0;i<(guided?14:11);i++){
   const a=seed+i*2.399963,speed=scale*(1.25+(i%5)*.35),vx=Math.cos(a)*speed,vz=Math.sin(a)*speed,vy=scale*(1.15+(i%4)*.56),point=t=>[e.x+vx*t,Math.max(.18,y+vy*t-4.6*t*t),e.z+vz*t],tail=point(Math.max(0,seconds-.035)),tip=point(seconds+.025),bright=1-age/18;
   this.segment('cyl',...tail,...tip,scale*.018,scale*.018,[1,.62+(i%3)*.10,.20],.46*bright,bright);
  }
  // Dust stays near the ground, while darker smoke rolls upward after the flash.
  const dust=Math.max(0,Math.min(1,(age-2)/22)),dustFade=smooth(age/4)*(1-smooth((age-16)/18));
  if(dustFade>0)for(let i=0;i<8;i++){
   const a=seed+i*2.399963,r=scale*(.12+dust*(.63+(i%3)*.10)),size=scale*(.15+dust*.36);
   this.particle(e.x+Math.cos(a)*r,.17,e.z+Math.sin(a)*r,size*1.6,size*1.4,[.49+(i%2)*.05,.41+(i%2)*.03,.29],dustFade*.36,false,a,true);
  }
  let smoke=[];for(let i=0;i<(guided?7:9);i++){
   const delay=3+i%3,q=Math.max(0,Math.min(1,(age-delay)/(life-delay))),appear=smooth((age-delay)/5),a=seed+i*2.399963,r=scale*(.06+q*(.32+(i%3)*.09)),size=scale*(.23+.65*Math.sqrt(q)),rise=scale*(.05+q*(.63+(i%3)*.22)),shade=.25+q*.10+(i%2)*.035;
   if(appear<=0)continue;
   smoke.push({point:[e.x+Math.cos(a)*r+seconds*.09,y+rise,e.z+Math.sin(a)*r+seconds*.045],size,a,shade,alpha:appear*fade*.40});
  }
  smoke.sort((a,b)=>Math.hypot(...sub(b.point,this.cam))-Math.hypot(...sub(a.point,this.cam)));for(let puff of smoke)this.particle(...puff.point,puff.size*(1+(puff.a%3)*.06),puff.size*1.18,[puff.shade,puff.shade*.97,puff.shade*.90],puff.alpha,false,puff.a);
  if(age>3)this.particle(e.x,.153,e.z,scale*.73,scale*.69,[.18,.17,.14],fade*.24,false,seed,true);
  // Small solid fragments drop back to the ground rather than hang around as glowing balls.
  for(let i=0;i<6;i++){
   const a=seed+i*2.399963,speed=scale*(.65+(i%3)*.31),r=seconds*speed,vy=scale*(1.55+(i%4)*.39),height=Math.max(.18,y+vy*seconds-4.6*seconds*seconds),size=scale*(.042+(i%3)*.013);
   this.draw('oct',e.x+Math.cos(a)*r,height,e.z+Math.sin(a)*r,size,size*.65,size*1.45,guided?[.25,.28,.28]:[.37,.31,.23],a+seconds*7,0,0,fade);
  }
  gl.depthMask(true);gl.disable(gl.BLEND);
 }
 shellImpact(e,battle=null){
  let age=e.at==null?14-e.ttl:Math.max(0,(battle?.tick??e.at)+this.simulationAlpha-e.at),p=Math.max(0,Math.min(1,age/13)),flash=Math.max(0,1-age/4),y=e.y??.20,size=Math.min(.70,Math.max(.34,(e.radius||1)*.55));
  if(flash>0)this.sphere(e.x,y,e.z,size*(.75+.25*flash),[1,.78,.35],flash*.90);
  let gl=this.gl;gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);
  for(let i=0;i<5;i++){let a=i*2.399,r=p*size*.65;this.sphere(e.x+Math.cos(a)*r,y+.12+p*.55,e.z+Math.sin(a)*r,.14+p*size*.38,[.40,.37,.31],0,(1-p)*.34)}
  this.draw('oct',e.x,.16,e.z,size*(1+p),.025,size*(1+p),[.38,.33,.27],0,0,0,(1-p)*.50);
  gl.depthMask(true);gl.disable(gl.BLEND);
 }
 noseOrdnance(kind,q,scale=1){let n=normalize([q.dx,q.dy,q.dz]),offset=.34*scale;this.ordnance(kind,q.x-n[0]*offset,q.y-n[1]*offset,q.z-n[2]*offset,...n,scale)}
 defenseFlight(shell,battle,source){
  let muzzle=muzzleWorld(defenseMuzzle(shell.weapon,shell.level??source?.lvl??1,shell.lane||0,shell.tubeCount),shell.heading??source?.heading??0,shell.fromX??source?.x??0,shell.fromZ??source?.z??0),target=shell.targetId?battle.units.find(u=>u.id===shell.targetId&&u.hp>0):null,end=[target?.x??shell.lastX??shell.x,shell.weapon==='mortar'?.20:target?.type==='tank'?.72:shell.lastY??.75,target?.z??shell.lastZ??shell.z],t=Math.max(0,Math.min(1,(battle.tick+this.simulationAlpha-shell.start)/(shell.land-shell.start||1))),mortar=shell.weapon==='mortar',q=missileFlightSample(muzzle.point,muzzle.axis,end,t,mortar?Math.min(2.8,Math.hypot(end[0]-muzzle.point[0],end[2]-muzzle.point[2])*.35):.08);
  this.noseOrdnance(mortar?'mortar':'shell',q,.58);
  if(t<.08)this.sphere(...muzzle.point,.20*(1-t/.08),[1,.83,.38],.65);
 }
	 ordnance(kind,x,y,z,dx,dy,dz,scale=1){let forward=normalize([dx,dy,dz]),reference=Math.abs(forward[1])<.92?[0,1,0]:[1,0,0],side=normalize(cross(reference,forward)),up=normalize(cross(forward,side)),point=d=>[x+forward[0]*d,y+forward[1]*d,z+forward[2]*d],SEG=(mesh,a,b,width,col,depth=width,glow=0)=>this.segment(mesh,...a,...b,width,depth,col,glow),fin=(axis,sign,col)=>{let a=point(-.31*scale),b=point(-.56*scale);b=b.map((v,i)=>v+axis[i]*sign*.22*scale);SEG('box',a,b,.045*scale,col,.095*scale)};
	  if(kind==='shock'){let steel=[.13,.19,.22],dark=[.055,.085,.10],electric=[.32,.82,1],tail=point(-.43*scale),shoulder=point(.12*scale),tip=point(.34*scale);SEG('cyl',tail,shoulder,.18*scale,steel);SEG('cone',shoulder,tip,.19*scale,[.25,.34,.37]);SEG('cyl',point(-.30*scale),point(-.18*scale),.205*scale,dark);SEG('cyl',point(-.05*scale),point(.06*scale),.205*scale,electric,.205*scale,.82);for(let axis of [side,up])for(let sign of [-1,1]){let root=point(.08*scale),end=point(.23*scale);root=root.map((v,i)=>v+axis[i]*sign*.16*scale);end=end.map((v,i)=>v+axis[i]*sign*.25*scale);SEG('cyl',root,end,.035*scale,electric,.035*scale,.95)}SEG('cyl',point(-.53*scale),tail,.12*scale,dark);this.sphere(...tip,.055*scale,[.72,.94,1],1.15);return}
		  if(kind==='rocket'||kind==='missile'||kind==='flare'){let flare=kind==='flare',guided=kind==='missile',body=flare?[.76,.12,.09]:guided?[.74,.76,.67]:[.83,.34,.17],nose=flare?[1,.38,.18]:guided?[.94,.61,.22]:[.96,.68,.27],metal=[.16,.21,.21],tail=point((guided?-.67:-.54)*scale),shoulder=point((guided?.11:.06)*scale),tip=point((guided?.47:.34)*scale),bodyWidth=(guided?.17:.13)*scale;SEG('cyl',tail,shoulder,bodyWidth,body);SEG('cone',shoulder,tip,(guided?.18:.145)*scale,nose);SEG('cyl',point((guided?-.59:-.49)*scale),point((guided?-.43:-.37)*scale),(guided?.195:.155)*scale,metal);for(let axis of [side,up])for(let sign of [-1,1])fin(axis,sign,flare?[.74,.53,.27]:metal);SEG('cone',tail,point((guided?-1.02:-.86)*scale),(guided?.15:.12)*scale,flare?[1,.24,.10]:[1,.58,.16],(guided?.15:.12)*scale,.72);this.sphere(...tip,(guided?.10:.09)*scale,flare?[1,.32,.18]:[1,.74,.30],.55);return}
	  let mortar=kind==='mortar',body=mortar?[.23,.28,.20]:[.18,.25,.28],band=mortar?[.72,.58,.27]:[.78,.63,.31],tail=point(-.42*scale),shoulder=point(.10*scale),tip=point(.34*scale);SEG('cyl',tail,shoulder,(mortar?.17:.14)*scale,body);SEG('cone',shoulder,tip,(mortar?.18:.15)*scale,mortar?[.31,.36,.25]:[.30,.39,.41]);SEG('cyl',point(-.30*scale),point(-.19*scale),(mortar?.185:.16)*scale,band);SEG('cyl',point(-.48*scale),tail,(mortar?.12:.10)*scale,[.10,.15,.16]);if(mortar)for(let axis of [side,up])for(let sign of [-1,1])fin(axis,sign,[.17,.22,.18]);
	 }
	 smokeTrail(ax,ay,az,bx,by,bz,t,arc,count=5,spacing=.035,size=.12,col=[.66,.66,.61]){for(let i=1;i<=count;i++){let p=t-i*spacing;if(p<0)continue;let q=flightSample(ax,ay,az,bx,by,bz,p,arc),grow=1+i*.14;this.sphere(q.x,q.y,q.z,size*grow,col,.015)}}
 gunboatFire(battle){
  let source=battle.ruleset>=12?this.battleGunboatPosition:battle.ruleset>=7?this.legacyBattleGunboatPosition:{...this.legacyGunboatPosition,heading:0};
  for(let shell of battle.gunboatShells||[]){
   if(battle.tick<shell.start)continue;
   let t=Math.max(0,Math.min(1,(battle.tick+this.simulationAlpha-shell.start)/(shell.land-shell.start||1))),rocket=shell.kind==='barrage',turret=muzzleWorld({point:[0,0,-2.35],axis:[0,0,-1]},source.heading||0,source.x,source.z),aim=shell.heading??Math.atan2(turret.point[0]-(shell.aimX??shell.x),turret.point[2]-(shell.aimZ??shell.z)),muzzle=gunboatMuzzle(source,shell.kind,shell.lane||0,aim,shell.start/30),end=[shell.x,.20,shell.z],q=missileFlightSample(muzzle.point,muzzle.axis,end,t,rocket?1.2:3.2);
   this.noseOrdnance(rocket?'rocket':'shell',q,rocket?.66:.72);
   if(t<.08)this.sphere(...muzzle.point,.22*(1-t/.08),[1,.78,.28],.55);
  }
 }
	 flareFlight(e,battle){if(!battle)return;let source=battle.ruleset>=12?this.battleGunboatPosition:battle.ruleset>=7?this.legacyBattleGunboatPosition:{...this.legacyGunboatPosition,heading:0},c=Math.cos(source.heading),s=Math.sin(source.heading),forward=1.58,fromX=source.x+forward*s,fromZ=source.z+forward*c,start=e.start??battle.tick-(35-e.ttl),land=e.land??start+14;if(battle.tick<land){let t=Math.max(0,Math.min(1,(battle.tick-start)/(land-start||1))),q=flightSample(fromX,1.32,fromZ,e.x,.34,e.z,t,3.2);this.noseOrdnance('flare',q,.60);this.smokeTrail(fromX,1.32,fromZ,e.x,.34,e.z,t,3.2,7,.044,.095,[.78,.28,.19]);return}let age=Math.min(1,(battle.tick-land)/16),height=.42+age*1.9;this.sphere(e.x,height,e.z,.34-age*.12,[1,.24,.12],.65);for(let i=0;i<6;i++){let a=i*Math.PI/3+age*.7,r=.32+age*.72;this.segment('cyl',e.x,height,e.z,e.x+Math.cos(a)*r,height+.18+Math.sin(a*2)*.12,e.z+Math.sin(a)*r,.035,.035,[1,.46,.18],.42)}}
	 shockEffect(e,battle){if(!battle)return;let source=battle.ruleset>=12?this.battleGunboatPosition:battle.ruleset>=7?this.legacyBattleGunboatPosition:{...this.legacyGunboatPosition,heading:0},c=Math.cos(source.heading),s=Math.sin(source.heading),fromX=source.x-1.14*c+1.26*s,fromZ=source.z+1.14*s+1.26*c,start=e.start??battle.tick-(42-e.ttl),land=e.land??start+18;if(battle.tick<land){let t=Math.max(0,Math.min(1,(battle.tick-start)/(land-start||1))),q=flightSample(fromX,1.08,fromZ,e.x,.24,e.z,t,3.65);this.noseOrdnance('shock',q,.65);for(let i=1;i<=5;i++){let p=t-i*.047;if(p<0)continue;let trail=flightSample(fromX,1.08,fromZ,e.x,.24,e.z,p,3.65),next=flightSample(fromX,1.08,fromZ,e.x,.24,e.z,Math.min(t,p+.022),3.65);this.segment('cyl',trail.x,trail.y,trail.z,next.x,next.y,next.z,.026,.026,i%2?[.28,.70,.94]:[.72,.92,1],.48)}return}
	  let age=Math.max(0,battle.tick-land),fade=Math.max(0,1-age/22),flash=Math.max(0,1-age/7),reach=.46+(SKILLS.shock.radius-.46)*Math.min(1,age/13),diameter=reach*2;this.draw('oct',e.x,.095,e.z,diameter,.055,diameter,[.28,.67,1],age*.13,.18+.64*fade);this.draw('oct',e.x,.115,e.z,Math.max(.22,diameter-.42),.028,Math.max(.22,diameter-.42),[.72,.92,1],-age*.18,.14+.46*fade);if(flash>0){this.draw('oct',e.x,.34,e.z,.36+flash*.82,.58,.36+flash*.82,[.88,.97,1],age*.22,1.35*flash);this.segment('cyl',e.x,.15,e.z,e.x,.62+flash*.80,e.z,.12,.12,[.68,.92,1],1.08*flash)}
	  let branches=9;for(let i=0;i<branches;i++){let seed=(i*2.399963+e.x*.17+e.z*.11),wobble=Math.sin(age*2.7+i*5.13)*.18,a=seed+wobble,r=(.56+((i*7)%5)*.22)*(1+.45*(1-fade)),midR=r*.52,tipR=Math.min(SKILLS.shock.radius,r+.48+.17*Math.sin(i*4.7+age)),height=.14+.10*((i+age)%3),mx=e.x+Math.cos(a+.28*Math.sin(i+age))*midR,mz=e.z+Math.sin(a+.28*Math.sin(i+age))*midR,tx=e.x+Math.cos(a)*tipR,tz=e.z+Math.sin(a)*tipR,col=i%3?[.36,.76,1]:[.83,.96,1],glow=(.38+.72*flash)*fade;this.segment('cyl',e.x,.20,e.z,mx,height+.17,mz,.036,.036,col,glow);this.segment('cyl',mx,height+.17,mz,tx,.12,tz,.024,.024,col,glow)}}
	 signalFlag(marker,strong=false){let x=marker.x,z=marker.z,seed=marker.id||marker.seq||1,pulse=this.time*2.2+seed,wave=Math.sin(pulse)*.12,height=strong?3.05:2.55;this.cyl(x,height*.5,z,.045,height,.045,[.70,.73,.65]);this.box(x+.36,height-.42,z,.72,.36,.055,strong?[.96,.19,.10]:[1,.58,.12],wave,.28);this.draw('oct',x,.075,z,strong?.82:.56,.055,strong?.82:.56,strong?[.95,.30,.14]:[.95,.72,.21],0,.20);if(!strong)return;
	  // The flare remains on the ground while irregular, wind-bent smoke billows continuously above it.
	  this.segment('cyl',x-.22,.10,z+.10,x-.10,.51,z+.02,.13,.13,[.72,.10,.08]);this.segment('cone',x-.10,.51,z+.02,x-.06,.66,z-.01,.15,.15,[1,.43,.16],.48);this.segment('cyl',x-.25,.07,z+.12,x-.21,.17,z+.09,.16,.16,[.64,.55,.31]);
	  let gl=this.gl;gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);let wind=.42+seed*.37,windX=Math.sin(wind),windZ=Math.cos(wind);for(let i=0;i<9;i++){let a=i*2.399+seed*.61,r=.11+(i%4)*.12,beat=.88+.12*Math.sin(this.time*2.8+i);this.sphere(x+Math.cos(a)*r,.30+(i%3)*.13,z+Math.sin(a)*r,(.34+(i%3)*.09)*beat,i%3?[.91,.13,.075]:[1,.31,.10],.11,.70)}
	  for(let i=0;i<30;i++){let phase=(this.time*.115+i/30+((i*17)%11)*.006)%1,ease=phase*phase,rise=.48+phase*7.15,drift=ease*2.05,wobble=.16+.55*phase,angle=i*2.17+this.time*(.31+.025*(i%4))+seed*.73,fade=1-Math.max(0,(phase-.78)/.22),size=(.25+phase*.72)*(.46+.54*fade)*(1+(i%3)*.055),px=x+windX*drift+Math.sin(angle)*wobble,pz=z+windZ*drift+Math.cos(angle*.91)*wobble,col=phase<.23?[.93,.12,.075]:phase<.68?[.62,.10,.085]:[.40+.09*fade,.23-.08*fade,.22-.10*fade];this.sphere(px,rise,pz,size,col,.025+.08*fade,.18+.38*fade)}
	  for(let i=0;i<12;i++){let phase=(this.time*.09+i/12+.31)%1,rise=.70+phase*5.6,drift=phase*phase*1.65,angle=i*1.83-this.time*.19,size=(.18+phase*.39)*(1-Math.max(0,phase-.82)*3.2),fade=1-Math.max(0,(phase-.72)/.28);this.sphere(x+windX*drift+Math.sin(angle)*(.25+.30*phase),rise,z+windZ*drift+Math.cos(angle)*(.21+.27*phase),size,[.54,.12,.10],.02,.14+.28*fade)}gl.depthMask(true);gl.disable(gl.BLEND);
	 }
	 supplies(battle){for(let m of battle.medkits){let start=m.start??m.land-150,drop=m.drop??start,drawPlane=x=>{this.box(x,.13,m.z-.8,2.6,.03,.33,[.16,.33,.34]);this.box(x,.14,m.z-.8,.22,.03,2.0,[.15,.30,.31])};if(battle.tick<m.land){if(battle.tick<drop){let t=Math.max(0,Math.min(1,(battle.tick-start)/(drop-start||1)));drawPlane(m.x-12+12*t)}else{let t=Math.max(0,Math.min(1,(battle.tick-drop)/Math.max(1,m.land-drop))),planeT=Math.min(1,(battle.tick-drop)/55),x=m.x+10*planeT,y=5.8-4.85*t;drawPlane(x);this.draw('sphere',m.x,y+.68,m.z,1.15,.43,1.15,[.98,.88,.62]);for(let side of [-1,1])this.box(m.x+side*.62,y+.28,m.z,.02,.6,.02,[.85,.87,.79]);this.box(m.x,y,m.z,.46,.4,.4,[.89,.92,.82]);this.box(m.x,y+.01,m.z+.21,.31,.07,.02,[.71,.25,.29]);this.box(m.x,y+.01,m.z+.22,.06,.28,.02,[.71,.25,.29])}}else{this.box(m.x,.29,m.z,.55,.47,.55,[.94,.92,.78]);let diameter=2*(m.radius||SKILLS.medkit.radius);this.draw('oct',m.x,.08,m.z,diameter,.05,diameter,[.23,.67,.53],0,.15)}}}
	 effects(events,battle=null){for(let e of events){
	  if(e.kind==='blast'&&e.weapon==='missile'){this.missileImpact(e,battle);continue}
  if(e.kind==='blast'&&(e.weapon==='rocket'||e.weapon==='shipRocket')){this.rocketImpact(e,battle);continue}
  if(e.kind==='blast'){this.shellImpact(e,battle);continue}
  if(e.kind==='launch'||e.kind==='droneLaunch'||e.kind==='droneDrop'||e.kind==='droneReturn')continue;
	  if(e.kind==='flare'){this.flareFlight(e,battle);continue}
	  if(e.kind==='shock'){this.shockEffect(e,battle);continue}
  if((e.kind==='shot'||e.kind==='hit')&&Number.isFinite(e.fromX)){
   let heavy=e.weapon==='heavy',duration=e.kind==='hit'?9:heavy?10:7,age=e.at==null?duration-e.ttl:Math.max(0,(battle?.tick??e.at)+this.simulationAlpha-e.at),p=Math.max(0,Math.min(1,age/duration)),source=e.kind==='hit'?battle?.base?.find(b=>b.id===e.source):null,heading=e.heading??source?.heading??Math.atan2(e.x-e.fromX,e.z-e.fromZ),local=e.kind==='hit'?defenseMuzzle(e.weapon,e.level??source?.lvl??1,e.lane||0,e.tubeCount):unitMuzzle(e.weapon),muzzle=muzzleWorld(local,heading,e.fromX,e.fromZ),end=[e.x,e.targetY??.75,e.z],col=[1,.84,.40];
   if(e.weapon==='rocket'&&age>=duration){this.explosiveImpact({...e,at:(e.at??((battle?.tick??0)-age))+duration,y:end[1],life:impactLifetime('unitRocket')},battle,false,.65);continue}
   if(heavy){
    for(let lane=0;lane<3;lane++){let progress=(age-lane*2)/6;if(progress<0||progress>1)continue;let q=missileFlightSample(muzzle.point,muzzle.axis,end,progress),n=normalize([q.dx,q.dy,q.dz]);this.segment('cyl',q.x-n[0]*.14,q.y-n[1]*.14,q.z-n[2]*.14,q.x,q.y,q.z,.023,.023,col,.55)}
   }else{
    let q=missileFlightSample(muzzle.point,muzzle.axis,end,p,e.weapon==='rocket'?.12:0),n=normalize([q.dx,q.dy,q.dz]);
    if(e.weapon==='rocket'){let cell=unitRocketRound(),tail=[q.x,q.y,q.z].map((v,i)=>v-n[i]*(cell.bodyLength+cell.noseLength));this.launcherRound(cell,tail,n,true)}
    else if(e.weapon==='tank')this.noseOrdnance('shell',q,.45);
    else this.segment('cyl',q.x-n[0]*.18,q.y-n[1]*.18,q.z-n[2]*.18,q.x,q.y,q.z,e.kind==='hit'?.030:.023,e.kind==='hit'?.030:.023,col,.58);
   }
   if(age<2.5)this.sphere(...muzzle.point,(e.kind==='hit'?.16:.10)*(1-age/2.5),col,.55);
   if(e.weapon!=='rocket'&&age>duration-2)this.sphere(e.x,end[1],e.z,.09,[1,.69,.29],.32);
   continue;
  }
	  let t=e.ttl/30,col=e.kind==='heal'?[.25,.98,.64]:e.kind==='splash'?[.68,.97,1]:[1,.65,.22],blast=e.kind==='blast',scale=blast?Math.max(.35,e.radius||1):1;this.sphere(e.x,blast?.55:1.1,e.z,blast?scale*(1.3-t):.22,col,.3);if(blast||e.kind==='splash'){let width=blast?scale*(2.05-t):3-t*2;this.draw('oct',e.x,.13,e.z,width,.12,width,col,0,.28)}
	 }}
 render(base,battle,highlight=-1,time=0,craftCount=3,boats=[],selectedBoats=[]){
  let gl=this.gl,c=this.canvas,dpr=Math.min(2,devicePixelRatio||1),w=Math.floor(c.clientWidth*dpr),h=Math.floor(c.clientHeight*dpr);
  if(c.width!==w||c.height!==h){c.width=w;c.height=h;gl.viewport(0,0,w,h)}
	  this.time=time;this.currentBattle=battle;this.angle+=(this.targetAngle-this.angle)*.12;this.zoom+=(this.targetZoom-this.zoom)*.12;
	  this.focusX+=(this.targetFocusX-this.focusX)*.12;this.focusZ+=(this.targetFocusZ-this.focusZ)*.12;
	  let phase=this.environmentPeriod||'noon',progress=Math.max(0,Math.min(.999,this.environmentProgress??.5)),target=lightingAt(phase,progress);
	  this.daylight=lerp(this.daylight,target.daylight,.08);this.nightGlow=lerp(this.nightGlow,target.nightGlow,.08);this.warmth=lerp(this.warmth,target.warmth,.08);this.sunlight=this.sunAmount(phase,progress);this.sky=lerp3(this.sky,target.sky,.08);
	  let focus=[this.focusX,0,this.focusZ],eye=[focus[0]+Math.sin(this.angle)*this.zoom*.72,this.zoom*Math.sin(this.pitch),focus[2]+Math.cos(this.angle)*this.zoom*.72];
	  let cam=lookAt(eye,focus),proj=perspective(.83,w/h,.1,180);this.cam=eye;this.basis=cam;this.aspect=w/h;this.fov=.83;
	  gl.clearColor(this.sky[0],this.sky[1],this.sky[2],1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.useProgram(this.p);
	  let buildings=(battle?battle.base:base).filter(building=>!building.showcaseHidden),showcase=this.showcase||null,showHomeFleet=!battle&&!this.enemyPreview&&!showcase,movingLight=!battle&&this.hiddenBuildingId!=null&&this.ghost?.b?.id===this.hiddenBuildingId?{...this.ghost.b,x:this.ghost.x,z:this.ghost.z}:null,lightBuildings=movingLight?buildings.map(b=>b.id===this.hiddenBuildingId?movingLight:b):buildings;gl.uniformMatrix4fv(this.loc.u_view,false,mult(proj,cam.matrix));gl.uniform3fv(this.loc.u_eye,eye);gl.uniform1f(this.loc.u_time,time);gl.uniform1f(this.loc.u_daylight,this.daylight);gl.uniform1f(this.loc.u_night,this.nightGlow);gl.uniform1f(this.loc.u_warm,this.warmth);gl.uniform1f(this.loc.u_sunlight,this.sunlight);this.uploadLocalLights(lightBuildings,showHomeFleet,craftCount);
	  this.skyLight();this.ground();if(this.showBuildBounds&&!battle)this.bounds();
  let invading=battle&&(battle.role==='defense'||battle.role==='replay'&&battle.originalRole==='defense');
	  if(showHomeFleet){this.fleetDock(craftCount);for(let i=0;i<Math.min(craftCount,MAX_LANDING_CRAFT);i++){let crew=boats[i],berth=this.homeBoatPosition(i,craftCount);this.ship(berth.x,berth.z+Math.sin(i+time)*.045,false,0,crew?.type,crew?.count||0,berth.heading,false,null,crew?.craftLevel||1)}}
	  if(showcase?.kind==='landing_craft')this.ship(0,-1,false,showcase.battle?1:0,'rifle',showcase.passengers||0,0,false,null,showcase.level||1);
	  else if(showcase?.kind==='gunboat')this.ship(0,-1,true,0,'rifle',0,0,false,showcase.battle?{x:0,z:-9}:null,showcase.level||1);
	  if(battle?.role==='attack'&&battle.ruleset<11)for(let i=0;i<Math.min(craftCount,MAX_LANDING_CRAFT);i++){let crew=boats[i];if(!crew||crew.used||!crew.count)continue;let x=this.boatX(i,craftCount),z=this.boatDockZ+Math.sin(i+time)*.08;if(selectedBoats.includes(i))this.draw('range',x,-.38,z,2.45,.04,5.65,[1,.76,.18],0,.72);this.ship(x,z,false,0,crew.type,crew.count,0,false,null,crew.craftLevel||1)}
	  if(battle)for(let l of battle.landings){let oldMap=battle.spawnZ<7,modern=battle.ruleset>=7,currentMap=battle.ruleset>=12,edgeEntry=battle.ruleset>=11,t=Math.min(1,(battle.tick-l.start)/(modern?64:34)),departAt=battle.ruleset>=21?l.departTick:l.release+24,retreat=Number.isFinite(departAt)?Math.max(0,Math.min(1,(battle.tick-departAt)/40)):0,side=l.x>=0?1:-1,startX=edgeEntry?l.x:modern?side*(12.8+(l.index%3)*.4):this.boatX(l.index,craftCount),laneX=edgeEntry?l.x:side*(9.5+(l.index%3)*.3),fromZ=oldMap?8.7:currentMap?31.2:modern?22.4:this.boatDockZ,dockZ=currentMap?MAP.dockZ:battle.spawnZ,z=fromZ+(dockZ-fromZ)*t+retreat*4.2,x=modern?(t<.54?startX+(laneX-startX)*t/.54:laneX+(l.x-laneX)*(t-.54)/.46):startX+(l.x-startX)*t;
	   let heading=oldMap?0:Math.atan2(x-l.x,Math.max(1,z-dockZ))*(1-Math.max(0,Math.min(1,(battle.tick-l.start-(modern?59:30))/10))),open=Math.min(1,Math.max(0,((battle.tick-l.start)-(modern?61:27))/(modern?11:15))),close=Number.isFinite(departAt)?Math.max(0,Math.min(1,(battle.tick-departAt)/12)):0,door=open*(1-close);
	   this.ship(x,z,false,door,l.type,Math.max(0,l.count-l.releasedCount),heading,invading,null,l.level||1);
   for(let j=0;j<3;j++){let phase=((battle.tick-l.start)*.085+j*.35)%1,dx=(j-1)*.34,dz=1+phase*.9;this.draw('oct',x+dx*Math.cos(heading)+dz*Math.sin(heading),-.28,z-dx*Math.sin(heading)+dz*Math.cos(heading),1.1*(1-phase),.06,1.6*(1-phase),[.61,.91,.87],heading,.12)}
  }
		  if(battle){for(let flag of battle.landingFlags||[])this.signalFlag(flag,false);if(battle.flare&&(battle.flare.launched===undefined||battle.tick-battle.flare.launched>=14))this.signalFlag(battle.flare,true)}if(!showcase){let gunboat=battle?.ruleset>=12?this.battleGunboatPosition:battle?.ruleset>=7?this.legacyBattleGunboatPosition:battle?this.legacyGunboatPosition:this.enemyPreview?this.scoutGunboatPosition:this.gunboatPosition,lastFire=battle?[...(battle.commands||[])].reverse().find(command=>command.kind==='fire'&&Number.isFinite(command.x)&&Number.isFinite(command.z)):null,lastAim=lastFire&&Number.isFinite(lastFire.heading)?{heading:lastFire.heading}:lastFire,turretTarget=battle?(this.gunboatAim||lastAim):null;this.ship(gunboat.x,gunboat.z,true,0,'rifle',0,gunboat.heading||0,false,turretTarget,battle?.gunboatLevel||this.homeGunboatLevel||1)}
		  let hostileBase=battle?battle.role==='attack'||battle.role==='replay'&&battle.originalRole==='attack':this.enemyPreview;for(let b of buildings){if(b.id!==this.hiddenBuildingId||battle)this.building(b,b.id===highlight,hostileBase);if(battle&&b.stunnedUntil>battle.tick)this.sphere(b.x,2,b.z,.55,[.42,.77,1],.55)}this.nightLights(lightBuildings);
  if(this.ghost&&!battle){let g=this.ghost;this.draw('oct',g.x,.24,g.z,2.50,.075,2.50,g.valid?[.22,.95,.61]:[1,.30,.26],0,.28);this.building({...g.b,x:g.x,z:g.z},true)}
			  if(battle){for(let shell of battle.projectiles||[]){if(battle.tick<shell.start)continue;if(shell.weapon==='grenade'){let p=Math.max(0,Math.min(1,(battle.tick+(this.simulationAlpha||0)-shell.start)/(shell.land-shell.start))),y=(shell.fromY??3.33)*(1-p*p)+.20*p*p;this.draw('oct',shell.fromX+(shell.x-shell.fromX)*p,y,shell.fromZ+(shell.z-shell.fromZ)*p,.15,.21,.15,[.36,.43,.23],p*3.5);continue}let source=battle.base.find(b=>b.id===shell.source),target=shell.targetId?battle.units.find(u=>u.id===shell.targetId&&u.hp>0):null,endX=target?.x??shell.x,endZ=target?.z??shell.z,t=Math.min(1,(battle.tick-shell.start)/(shell.land-shell.start));if(shell.weapon==='missile'||shell.weapon==='rocket'){this.launcherFlight(shell,battle,source);continue}this.defenseFlight(shell,battle,source)}this.gunboatFire(battle);for(let u of battle.units)this.unit(u,battle.tick,invading);this.supplies(battle);this.effects(battle.events,battle)}
 }
	 get boatDockZ(){return 18.15}
 get portrait(){return this.canvas.clientWidth<620&&this.canvas.clientWidth<this.canvas.clientHeight}
 boatX(index,count){let spacing=count>=5?2.05:count===4?2.3:2.65,offset=count>=4?(this.portrait?-1.4:1.4):0;return (index-(count-1)/2)*spacing+offset}
	 homeBoatPosition(index,count){let shown=Math.max(1,Math.min(MAX_LANDING_CRAFT,count));return {x:24.62,z:-2.65+(index-(shown-1)/2)*5.35,heading:0}}
	 get gunboatPosition(){return {x:28.38,z:-2.65,heading:0}}
	 get scoutGunboatPosition(){let side=this.portrait?1:-1;return {x:side*10.8,z:25.2,heading:side*1.35}}
	 get battleGunboatPosition(){return {x:0,z:23.8,heading:Math.PI/2}}
	 get legacyGunboatPosition(){return this.portrait?{x:5.55,z:18.4}:{x:-5.55,z:18.4}}
	 get legacyBattleGunboatPosition(){return {x:0,z:17.5,heading:Math.PI/2}}
 projectWorld(x,y,z){if(!this.basis)return null;let d=sub([x,y,z],this.cam),depth=-dot(d,this.basis.z);if(depth<=.1)return null;let s=Math.tan(this.fov/2),nx=dot(d,this.basis.x)/(depth*s*this.aspect),ny=dot(d,this.basis.y)/(depth*s),r=this.canvas.getBoundingClientRect();return {x:r.left+(nx+1)*r.width/2,y:r.top+(1-ny)*r.height/2,depth}}
	 pan(dx,dy){let scale=this.targetZoom*.00145,angle=this.angle,vertical=-dy;this.targetFocusX=Math.max(-MAP.buildX,Math.min(MAP.buildX,this.targetFocusX+(-Math.cos(angle)*dx+Math.sin(angle)*vertical)*scale));this.targetFocusZ=Math.max(MAP.minZ-2,Math.min(MAP.shoreZ+2,this.targetFocusZ+(Math.sin(angle)*dx+Math.cos(angle)*vertical)*scale))}
 pick(clientX,clientY){let box=this.canvas.getBoundingClientRect(),nx=((clientX-box.left)/box.width)*2-1,ny=1-((clientY-box.top)/box.height)*2,scale=Math.tan(this.fov/2),d=normalize([-this.basis.z[0]+this.basis.x[0]*nx*scale*this.aspect+this.basis.y[0]*ny*scale,-this.basis.z[1]+this.basis.x[1]*nx*scale*this.aspect+this.basis.y[1]*ny*scale,-this.basis.z[2]+this.basis.x[2]*nx*scale*this.aspect+this.basis.y[2]*ny*scale]);if(d[1]>=0)return null;let t=-this.cam[1]/d[1];return {x:this.cam[0]+d[0]*t,z:this.cam[2]+d[2]*t}}
}
