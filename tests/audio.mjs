import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const combat=['rifle','sniper','machinegun','mortar','cannon','tank','artillery','explosion','rocket','shock'];
for(const name of combat){
  const path=root+'assets/'+name+'.ogg';
  const probe=spawnSync('ffprobe',['-v','error','-select_streams','a:0','-show_entries','stream=sample_rate,channels','-of','json',path],{encoding:'utf8'});
  assert.equal(probe.status,0,`ffprobe failed for ${name}: ${probe.stderr}`);
  const stream=JSON.parse(probe.stdout).streams?.[0];
  assert.equal(stream?.sample_rate,'48000',`${name} is not a 48 kHz master`);
  assert.equal(stream?.channels,2,`${name} is not stereo`);
  const meter=spawnSync('ffmpeg',['-hide_banner','-nostats','-i',path,'-filter_complex','ebur128=peak=true','-f','null','-'],{encoding:'utf8'});
  assert.equal(meter.status,0,`true-peak scan failed for ${name}`);
  const peak=[...meter.stderr.matchAll(/Peak:\s+(-?\d+(?:\.\d+)?) dBFS/g)].at(-1);
  assert.ok(peak,`true peak missing for ${name}`);
  assert.ok(Number(peak[1])<=-4,`${name} exceeds Bluetooth-safe headroom: ${peak[1]} dBTP`);
}
console.log(`Audio compatibility masters OK: ${combat.length} stereo combat assets at 48 kHz, all <= -4.0 dBTP`);
