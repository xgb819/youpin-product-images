import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { inventoryAssets } from '../scripts/inventory-assets.mjs';

test('asset inventory records source images and creates a contact sheet',async()=>{
  const base=process.env.YOUPIN_TEST_TMP||os.tmpdir();
  const root=await fs.mkdtemp(path.join(base,'youpin-inventory-'));
  const input=path.join(root,'input'),out=path.join(root,'review');
  await fs.mkdir(path.join(input,'详情'),{recursive:true});
  await sharp({create:{width:640,height:480,channels:3,background:'#37a'}}).png().toFile(path.join(input,'01.png'));
  await sharp({create:{width:750,height:1200,channels:3,background:'#fc8'}}).jpeg().toFile(path.join(input,'详情','02.jpg'));
  const result=await inventoryAssets(input,out);
  assert.equal(result.count,2);
  const manifest=JSON.parse(await fs.readFile(result.manifest,'utf8'));
  assert.deepEqual(manifest.assets.map(a=>[a.path,a.width,a.height]),[['01.png',640,480],['详情/02.jpg',750,1200]]);
  const sheet=await sharp(result.contactSheet).metadata();
  assert.ok(sheet.width>1000&&sheet.height>300);
});
