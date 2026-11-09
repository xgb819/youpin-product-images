import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';
import {renderImage} from '../scripts/render-image.mjs';
import {PROFILES,sha,readJSON,alphaBounds,resolveCopy,checkManifest,checkImage,fontPostscriptNames} from '../scripts/lib/core.mjs';

const tempRoot=path.resolve(process.env.YOUPIN_TEST_TMP||os.tmpdir());
await fs.mkdir(tempRoot,{recursive:true});
const temp=await fs.mkdtemp(path.join(tempRoot,'youpin-pipeline-test-'));
after(async()=>{assert.equal(path.dirname(temp),tempRoot);assert.ok(path.basename(temp).startsWith('youpin-pipeline-test-'));await fs.rm(temp,{recursive:true,force:true});});
const fonts=process.env.YOUPIN_FONT_DIR;
const foreground=path.join(temp,'foreground.png'),photo=path.join(temp,'photo.png');
await sharp(Buffer.from('<svg width="320" height="160"><rect x="20" y="20" width="280" height="120" rx="15" fill="#668d26"/></svg>')).png().toFile(foreground);
await sharp({create:{width:1080,height:1080,channels:3,background:'#dac6a8'}}).composite([{input:Buffer.from('<svg width="1080" height="1080"><rect x="300" y="400" width="400" height="350" fill="#668d26"/></svg>')}]).png().toFile(photo);
const product={facts:{beans:{value:7,status:'confirmed',source:'synthetic unit-test evidence',sku_ids:['green']},lights:{value:false,status:'confirmed',source:'synthetic unit-test evidence',sku_ids:['green']},music:{value:null,status:'unknown',source:'not confirmed',sku_ids:['green']}},copy:{title:{text:'趣味接龙',kind:'creative',status:'draft'},desc:{text:'每套7个数字豆',kind:'factual',status:'draft',assertions:[{fact_id:'beans',equals:7}]}}};
const productFile=path.join(temp,'product.json');await fs.writeFile(productFile,JSON.stringify(product));
async function manifest(id,kind='catalog',patch={}){
 const s={schema_version:1,id,revision:1,kind,sku_id:'green',asset:kind==='catalog'?{file:foreground,origin:'synthetic-test'}:{file:photo,origin:'synthetic-test',subject_boxes:[{x:300,y:400,width:400,height:350}]},...patch};
 const file=path.join(temp,id+'.json');await fs.writeFile(file,JSON.stringify(s));return {file,s};
}
const output=name=>path.join(temp,'output-'+name);

test('catalog preserves aspect ratio, transparent background, 640 safe frame and 72dpi',async()=>{
 const {file}=await manifest('catalog');const r=await renderImage(file,{out:output('catalog')});
 const m=await sharp(r.file).metadata(),a=await alphaBounds(r.file);
 assert.equal(m.width,800);assert.equal(m.height,800);assert.equal(m.density,72);assert.equal(m.format,'png');
 assert.ok(a.transparent>0);assert.equal(a.box.x,80);assert.equal(a.box.width,640);assert.ok(a.box.height<640);
 assert.deepEqual(r.report.verification.errors,[]);assert.equal(r.report.verification.status,'needs_visual_review');
});
test('opaque PNG cannot masquerade as a transparent catalog source',async()=>{
 const opaque=path.join(temp,'opaque.png');await sharp({create:{width:50,height:50,channels:3,background:'#fff'}}).png().toFile(opaque);
 const {file}=await manifest('opaque','catalog',{asset:{file:opaque}});
 await assert.rejects(renderImage(file,{out:output('opaque')}),/transparent PNG/);
});
test('empty transparent PNG is rejected',async()=>{
 const empty=path.join(temp,'empty.png');await sharp({create:{width:50,height:50,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).png().toFile(empty);
 const {file}=await manifest('empty','catalog',{asset:{file:empty}});
 await assert.rejects(renderImage(file,{out:output('empty')}),/no transparent background or foreground/);
});
test('real alpha beyond the safe area is detected independently',async()=>{
 const file=path.join(temp,'unsafe.png');await sharp({create:{width:800,height:800,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite([{input:Buffer.from('<svg width="800" height="800"><rect x="0" y="0" width="20" height="20" fill="green"/></svg>')}]).withMetadata({density:72}).png().toFile(file);
 const r=await checkImage(file,{kind:'catalog'});assert.ok(r.errors.includes('alpha_outside_safe_area'));
});
test('square scene and first carousel derive from the same actual master',async()=>{
 const square=await manifest('square','scene-square'),first=await manifest('first','carousel-first');
 const a=await renderImage(square.file,{out:output('square')}),b=await renderImage(first.file,{out:output('first')});
 assert.equal(a.report.asset.sha256,b.report.asset.sha256);assert.equal(a.report.verification.measurements.width,800);assert.equal(b.report.verification.measurements.width,1080);
 assert.equal(a.report.verification.measurements.format,'jpeg');assert.ok(a.report.verification.measurements.bytes<=200000);assert.ok(b.report.verification.measurements.bytes<200000);
});
test('scene reframing moves the original photo deterministically without regenerating it',async()=>{
 const base=await manifest('reframe-base','carousel-first',{asset:{file:photo,subject_boxes:[{x:300,y:400,width:400,height:350}],reframe:{zoom:1.2}}});
 const moved=await manifest('reframe-down','carousel-first',{asset:{file:photo,subject_boxes:[{x:300,y:400,width:400,height:350}],reframe:{zoom:1.2,offset_y:30}}});
 const a=await renderImage(base.file,{out:output('reframe-base')}),b=await renderImage(moved.file,{out:output('reframe-down')});
 assert.equal(Math.round(b.report.subject_boxes[0].y-a.report.subject_boxes[0].y),30);
 assert.deepEqual(b.report.asset.reframe,{zoom:1.2,offset_y:30});
 assert.deepEqual(b.report.verification.errors,[]);
});
test('reframing rejects offsets that would expose a canvas edge',async()=>{
 const {file}=await manifest('reframe-gap','carousel-first',{asset:{file:photo,subject_boxes:[{x:300,y:400,width:400,height:350}],reframe:{zoom:1,offset_y:30}}});
 await assert.rejects(renderImage(file,{out:output('reframe-gap')}),/uncovered canvas edge/);
});
test('landscape uses its own conservative 940 by 469 integer safe area',async()=>{
 const landscape=path.join(temp,'landscape.png');await sharp({create:{width:1020,height:615,channels:3,background:'#d6c8b4'}}).png().toFile(landscape);
 const {file}=await manifest('landscape','scene-landscape',{asset:{file:landscape,subject_boxes:[{x:100,y:100,width:700,height:400}]}});
 const r=await renderImage(file,{out:output('landscape')});assert.deepEqual(r.report.verification.errors,[]);assert.equal(r.report.verification.measurements.height,615);
 assert.deepEqual(PROFILES['scene-landscape'].safe,{x:40,y:73,width:940,height:469});
});
test('subject crossing a crop or safe-area boundary is rejected before output',async()=>{
 const {file}=await manifest('cropped','scene-landscape',{asset:{file:photo,subject_boxes:[{x:0,y:0,width:1080,height:1080}]}});
 await assert.rejects(renderImage(file,{out:output('cropped')}),/cropped or outside safe area/);
});
test('missing subject bounds remains a review item, not a full pass',async()=>{
 const {file}=await manifest('no-bounds','scene-square',{asset:{file:photo}});const r=await renderImage(file,{out:output('no-bounds')});
 assert.ok(r.report.verification.review.includes('subject_bounds_missing'));assert.equal(r.report.verification.status,'needs_visual_review');
});
test('white background outside a colored product is rejected',async()=>{
 const white=path.join(temp,'white.png');await sharp({create:{width:1080,height:1080,channels:3,background:'#fff'}}).composite([{input:Buffer.from('<svg width="1080" height="1080"><rect x="300" y="400" width="400" height="350" fill="green"/></svg>')}]).png().toFile(white);
 const {file}=await manifest('white','scene-square',{asset:{file:white,subject_boxes:[{x:300,y:400,width:400,height:350}]}});
 await assert.rejects(renderImage(file,{out:output('white')}),/white_background/);
});
test('first carousel refuses additional copy and unsupported layout fields',async()=>{
 const s=(await manifest('no-copy','carousel-first')).s;
 assert.throws(()=>checkManifest({...s,title:'title'}),/does not allow added text/);
 assert.throws(()=>checkManifest({...s,texts:[{text:'logo'}]}),/Unknown manifest field/);
 assert.throws(()=>checkManifest({...s,title_y:780}),/Unknown manifest field/);
});
test('unknown facts cannot support copy even in preview',()=>{
 const p=structuredClone(product);p.copy.desc.assertions=[{fact_id:'music',equals:true}];
 assert.throws(()=>resolveCopy(p,['desc'],'green'),/Unconfirmed/);
});
test('confirmed false feature cannot be asserted as true',()=>{
 const p=structuredClone(product);p.copy.desc.assertions=[{fact_id:'lights',equals:true}];
 assert.throws(()=>resolveCopy(p,['desc'],'green'),/Contradictory/);
});
test('changing a fact invalidates stale dependent assertions',()=>{
 const p=structuredClone(product);p.facts.beans.value=8;
 assert.throws(()=>resolveCopy(p,['desc'],'green'),/Contradictory/);
});
test('facts from another SKU are rejected',()=>{
 assert.throws(()=>resolveCopy(product,['desc'],'beige'),/does not apply to SKU/);
});
test('production refuses draft copy and forged approval without a review record',()=>{
 assert.throws(()=>resolveCopy(product,['desc'],'green',true),/not approved/);
 const p=structuredClone(product);p.copy.desc.status='approved';assert.throws(()=>resolveCopy(p,['desc'],'green',true),/review record/);
});
test('pinned source hash is checked',async()=>{
 const {file}=await manifest('bad-hash','catalog',{asset:{file:foreground,sha256:'0'.repeat(64)}});
 await assert.rejects(renderImage(file,{out:output('bad-hash')}),/SHA-256 mismatch/);
});
test('unsafe IDs cannot escape the output directory',()=>{
 const s={schema_version:1,id:'../outside',revision:1,kind:'catalog',sku_id:'green',asset:{file:foreground}};assert.throws(()=>checkManifest(s),/Invalid image id/);
});
test('actual output changes are detected by hash',async()=>{
 const {file}=await manifest('tamper');const r=await renderImage(file,{out:output('tamper')});
 await sharp(r.file).resize(400,400).withMetadata({density:72}).png().toFile(path.join(temp,'tampered.png'));
 const result=await checkImage(path.join(temp,'tampered.png'),r.report);assert.ok(result.errors.includes('wrong_dimensions'));assert.ok(result.errors.includes('output_hash_mismatch'));
});
test('new revision retains old output and does not change another image',async()=>{
 const a=await manifest('rev-a'),b=await manifest('rev-b');const dir=output('revisions');
 const ar=await renderImage(a.file,{out:dir}),br=await renderImage(b.file,{out:dir});const oldA=sha(await fs.readFile(ar.file)),oldB=sha(await fs.readFile(br.file));
 a.s.revision=2;await fs.writeFile(a.file,JSON.stringify(a.s));
 await assert.rejects(renderImage(a.file,{out:dir}),/retain history/);
 await renderImage(a.file,{out:output('revision-2')});
 assert.equal(sha(await fs.readFile(ar.file)),oldA);assert.equal(sha(await fs.readFile(br.file)),oldB);
});
test('production catalog requires exact visual approval of the preview',async()=>{
 const {file,s}=await manifest('production');const preview=await renderImage(file,{out:output('production-preview')});
 s.asset.sha256=preview.report.asset.sha256;await fs.writeFile(file,JSON.stringify(s));
 await assert.rejects(renderImage(file,{out:output('production-final'),production:true}),/human review record/);
 s.visual_review={source:'synthetic unit-test approval only',output_sha256:preview.report.output_sha256};await fs.writeFile(file,JSON.stringify(s));
 const final=await renderImage(file,{out:output('production-final'),production:true});assert.equal(final.report.output_sha256,preview.report.output_sha256);
 s.visual_review.output_sha256='0'.repeat(64);await fs.writeFile(file,JSON.stringify(s));await assert.rejects(renderImage(file,{out:output('production-rejected'),production:true}),/human review record/);
});
test('changed content cannot silently overwrite the same revision',async()=>{
 const {file,s}=await manifest('same-revision');const dir=output('same-revision');const r=await renderImage(file,{out:dir});const before=sha(await fs.readFile(r.file));
 const changed=path.join(temp,'changed-foreground.png');await sharp(foreground).tint('#ee5500').png().toFile(changed);
 s.asset.file=changed;await fs.writeFile(file,JSON.stringify(s));await assert.rejects(renderImage(file,{out:dir}),/retain history/);
 assert.equal(sha(await fs.readFile(r.file)),before);
});
test('headline uses real MiSans and upper centered slots, never lower-left',{skip:!fonts},async()=>{
 const {file}=await manifest('headline','carousel-headline',{product:productFile,title:'title',description:'desc'});
 const r=await renderImage(file,{out:output('headline'),fonts});const [title,desc]=r.report.text_boxes;
 assert.equal(title.y,194);assert.ok(Math.abs(title.x+title.width/2-540)<=0.5);assert.equal(title.size,68);assert.equal(desc.size,42);assert.equal(desc.y-title.y-title.height,30);
 const fake=structuredClone(r.report);fake.text_boxes[0].y=780;fake.text_boxes[1].y=900;
 const v=await checkImage(r.file,fake);assert.ok(v.errors.includes('wrong_carousel_text_position'));
});
test('a renamed font file does not pass identity checks',{skip:!fonts},async()=>{
 const b=await fs.readFile(path.join(fonts,'MiSans-Regular.otf'));assert.ok(fontPostscriptNames(b).includes('MiSans-Regular'));assert.ok(!fontPostscriptNames(b).includes('MiSans-Semibold'));
 const badDir=path.join(temp,'bad-fonts');await fs.mkdir(badDir);await fs.writeFile(path.join(badDir,'MiSans-Regular.otf'),b);await fs.writeFile(path.join(badDir,'MiSans-Semibold.otf'),b);
 const {file}=await manifest('bad-font','carousel-headline',{product:productFile,title:'title',description:'desc'});await assert.rejects(renderImage(file,{out:output('bad-font'),fonts:badDir}),/Wrong font identity/);
});
test('JPG byte cap is checked on actual encoded bytes',async()=>{
 const width=800,height=800,data=Buffer.alloc(width*height*3);let seed=1;
 for(let i=0;i<data.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;data[i]=seed>>>24;}
 const file=path.join(temp,'oversize.jpg');await sharp(data,{raw:{width,height,channels:3}}).withMetadata({density:72}).jpeg({quality:100,chromaSubsampling:'4:4:4'}).toFile(file);
 const r=await checkImage(file,{kind:'scene-square',subject_boxes:[]});assert.ok(r.measurements.bytes>200000);assert.ok(r.errors.includes('file_too_large'));
});
