import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {cardPreview, LEVEL_PREVIEW_TYPES} from '../src/previews.js';

const defenses=['sniper','mg','mortar','cannon','rocket','missile','drone'];
assert.ok(defenses.every(type=>LEVEL_PREVIEW_TYPES.includes(type)));
const hashes=new Set();
for(const type of LEVEL_PREVIEW_TYPES){
  for(let level=1;level<=10;level++){
    const path=cardPreview(type,false,level);
    assert.equal(path,`assets/previews/buildings/${type}-lv${level}.png`);
    const bytes=fs.readFileSync(new URL('../'+path,import.meta.url));
    assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
    assert.equal(bytes[25],6,'level thumbnail must retain RGBA alpha');
    const hash=createHash('sha256').update(bytes).digest('hex');
    assert.ok(!hashes.has(hash),'a different level reused the same image');
    hashes.add(hash);
  }
  assert.equal(cardPreview(type,false,0),cardPreview(type,false,1));
  assert.equal(cardPreview(type,false,11),cardPreview(type,false,10));
  assert.equal(cardPreview(type,false,NaN),cardPreview(type,false,1));
}
assert.equal(cardPreview('rocket',true,10),'assets/previews/units/rocket.png');
assert.throws(()=>cardPreview('unknown'));
console.log(`Level thumbnails: ${hashes.size} distinct RGBA PNGs; level routing and boundaries passed.`);
