import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

export const ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const PROFILES = Object.freeze({
  catalog: { width:800, height:800, format:'png', maxBytes:300000, safe:{x:80,y:80,width:640,height:640}, source:'R01' },
  'scene-square': { width:800, height:800, format:'jpeg', maxBytes:200000, safe:{x:80,y:80,width:640,height:640}, source:'R02' },
  'scene-landscape': { width:1020, height:615, format:'jpeg', maxBytes:200000, safe:{x:40,y:73,width:940,height:469}, source:'R03' },
  'carousel-first': { width:1080, height:1080, format:'jpeg', maxBytes:199999, safe:{x:0,y:194,width:1080,height:778}, source:'C01,C02' },
  'carousel-headline': { width:1080, height:1080, format:'jpeg', maxBytes:199999, safe:{x:0,y:194,width:1080,height:778}, source:'C01,C03' },
});
export const sha = b => crypto.createHash('sha256').update(b).digest('hex');
export async function readJSON(file) { return JSON.parse(await fs.readFile(file,'utf8')); }
export function fontPostscriptNames(b) {
  assert(b.length>=12,'Invalid font header');let offset;
  const tables=b.readUInt16BE(4);assert(12+tables*16<=b.length,'Invalid font table directory');
  for(let i=0;i<tables;i++){const pos=12+i*16;if(b.toString('ascii',pos,pos+4)==='name')offset=b.readUInt32BE(pos+8);}
  assert(offset!==undefined&&offset+6<=b.length,'Font name table missing');
  const count=b.readUInt16BE(offset+2),base=offset+b.readUInt16BE(offset+4),names=[];
  assert(offset+6+count*12<=b.length,'Invalid font name records');
  for(let i=0;i<count;i++){
    const p=offset+6+i*12,platform=b.readUInt16BE(p),id=b.readUInt16BE(p+6),len=b.readUInt16BE(p+8),start=base+b.readUInt16BE(p+10);
    if(id!==6||platform!==3)continue;assert(start+len<=b.length&&len%2===0,'Invalid font name string');
    let name='';for(let j=0;j<len;j+=2)name+=String.fromCharCode(b.readUInt16BE(start+j));names.push(name);
  }
  return [...new Set(names)];
}
export function assert(condition,message) { if(!condition) throw new Error(message); }
export function boxValid(b) { return b && ['x','y','width','height'].every(k=>Number.isFinite(b[k])) && b.x>=0 && b.y>=0 && b.width>0 && b.height>0; }
export function inside(a,b,tolerance=0) { return a.x>=b.x-tolerance && a.y>=b.y-tolerance && a.x+a.width<=b.x+b.width+tolerance && a.y+a.height<=b.y+b.height+tolerance; }
export function intersects(a,b) { return a.x<b.x+b.width && a.x+a.width>b.x && a.y<b.y+b.height && a.y+a.height>b.y; }
export function checkManifest(s) {
  const keys=new Set(['schema_version','id','revision','kind','asset','product','sku_id','title','description','shared_master_id','visual_review']);
  for(const k of Object.keys(s))assert(keys.has(k),`Unknown manifest field: ${k}`);
  assert(s.schema_version===1,'schema_version must be 1');
  assert(typeof s.id==='string'&&/^[a-z0-9][a-z0-9_-]{0,63}$/.test(s.id),'Invalid image id');
  assert(Number.isInteger(s.revision)&&s.revision>0,'revision must be a positive integer');
  assert(Object.hasOwn(PROFILES,s.kind),'Unsupported image kind');
  assert(s.asset&&typeof s.asset.file==='string','asset.file is required');
  assert(typeof s.sku_id==='string'&&s.sku_id.length>0,'sku_id is required');
  if(s.kind==='carousel-headline')assert(s.title&&s.description,'headline requires title and description copy IDs');
  else assert(!s.title&&!s.description,'This image kind does not allow added text');
  if(s.asset.subject_boxes!==undefined){
    assert(Array.isArray(s.asset.subject_boxes)&&s.asset.subject_boxes.length>0,'subject_boxes must be a nonempty array');
    assert(s.asset.subject_boxes.every(boxValid),'Invalid subject box');
  }
  if(s.asset.reframe!==undefined){
    assert(s.kind!=='catalog','Catalog images do not support scene reframing');
    const r=s.asset.reframe;
    assert(r&&typeof r==='object'&&!Array.isArray(r),'asset.reframe must be an object');
    const keys=new Set(['zoom','offset_x','offset_y']);
    for(const k of Object.keys(r))assert(keys.has(k),`Unknown asset.reframe field: ${k}`);
    assert(r.zoom===undefined||(Number.isFinite(r.zoom)&&r.zoom>=1&&r.zoom<=2),'asset.reframe.zoom must be between 1 and 2');
    for(const k of ['offset_x','offset_y'])assert(r[k]===undefined||Number.isFinite(r[k]),`asset.reframe.${k} must be finite`);
  }
}
export { resolveCopy } from './copy-evidence.mjs';
export async function alphaBounds(input) {
  const {data,info}=await sharp(input).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  let x0=info.width,y0=info.height,x1=-1,y1=-1,transparent=0;
  for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){
    const a=data[(y*info.width+x)*4+3];
    if(a===0)transparent++;
    if(a>0){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);}
  }
  return {box:x1<0?null:{x:x0,y:y0,width:x1-x0+1,height:y1-y0+1},transparent,area:info.width*info.height};
}
export function coverPlan(source,target,reframe={}) {
  const zoom=reframe.zoom??1,offsetX=Math.round(reframe.offset_x??0),offsetY=Math.round(reframe.offset_y??0);
  const scale=Math.max(target.width/source.width,target.height/source.height)*zoom;
  const width=Math.max(target.width,Math.ceil(source.width*scale)),height=Math.max(target.height,Math.ceil(source.height*scale));
  const cropLeft=Math.floor((width-target.width)/2)-offsetX,cropTop=Math.floor((height-target.height)/2)-offsetY;
  assert(cropLeft>=0&&cropTop>=0&&cropLeft+target.width<=width&&cropTop+target.height<=height,'asset.reframe exposes an uncovered canvas edge; increase zoom or reduce offset');
  return {width,height,cropLeft,cropTop,scaleX:width/source.width,scaleY:height/source.height,zoom,offsetX,offsetY};
}
export function transformBoxes(boxes, source, target, reframe={}) {
  const plan=coverPlan(source,target,reframe);
  return (boxes??[]).map(b=>({x:b.x*plan.scaleX-plan.cropLeft,y:b.y*plan.scaleY-plan.cropTop,width:b.width*plan.scaleX,height:b.height*plan.scaleY}));
}
export async function whiteOutside(input, boxes) {
  const {data,info}=await sharp(input).flatten({background:'#fff'}).removeAlpha().raw().toBuffer({resolveWithObject:true});
  let count=0,white=0;
  for(let y=0;y<info.height;y+=3)for(let x=0;x<info.width;x+=3){
    if(boxes.some(b=>x>=b.x&&x<b.x+b.width&&y>=b.y&&y<b.y+b.height))continue;
    const p=(y*info.width+x)*info.channels;count++;
    if(data[p]>=250&&data[p+1]>=250&&data[p+2]>=250)white++;
  }
  return count?white/count:null;
}
export async function checkImage(file,report) {
  const bytes=await fs.readFile(file),m=await sharp(bytes).metadata();
  const profile=PROFILES[report.kind];assert(profile,'Unknown verification kind');
  const errors=[],review=[];
  if(m.width!==profile.width||m.height!==profile.height)errors.push('wrong_dimensions');
  if(m.format!==profile.format)errors.push('wrong_format');
  if(bytes.length>profile.maxBytes)errors.push('file_too_large');
  if(m.density!==72)errors.push('wrong_density');
  if(report.output_sha256&&sha(bytes)!==report.output_sha256)errors.push('output_hash_mismatch');
  let bounds=null,whiteRatio=null;
  if(report.kind==='catalog'){
    const a=await alphaBounds(bytes);bounds=a.box;
    if(!m.hasAlpha||a.transparent===0)errors.push('background_not_transparent');
    if(!a.box)errors.push('empty_foreground');else if(!inside(a.box,profile.safe))errors.push('alpha_outside_safe_area');
  }else{
    const boxes=report.subject_boxes??[];
    if(!boxes.length)review.push('subject_bounds_missing');
    for(const b of boxes)if(!boxValid(b)||!inside(b,profile.safe,0.001))errors.push('subject_outside_safe_area');
    whiteRatio=await whiteOutside(bytes,boxes);
    if(whiteRatio!==null&&whiteRatio>0.98)errors.push('white_background');
    review.push('subject_boxes_and_scene_need_visual_review');
  }
  const textBoxes=report.text_boxes??[];
  if(report.kind==='carousel-first'&&textBoxes.length)errors.push('first_carousel_has_added_text');
  if(report.kind==='carousel-headline'){
    if(textBoxes.length!==2)errors.push('wrong_text_slot_count');
    for(let i=0;i<textBoxes.length;i++){
      const t=textBoxes[i],expectedSize=i===0?68:42,weight=i===0?'Semibold':'Medium';
      if(t.size!==expectedSize||t.weight!==weight)errors.push('wrong_font_style');
      if(Math.abs(t.x+t.width/2-540)>0.51||t.y<194||t.y+t.height>972||t.x<50||t.x+t.width>1030||(i===0&&t.y!==194))errors.push('wrong_carousel_text_position');
      if((report.subject_boxes??[]).some(b=>intersects(t,b)))errors.push('text_overlaps_declared_subject');
    }
    if(textBoxes.length===2&&textBoxes[1].y-textBoxes[0].y-textBoxes[0].height!==30)errors.push('wrong_carousel_text_gap');
    review.push('copy_meaning_and_actual_text_need_visual_review');
  }
  review.push('appearance_accessories_and_claims_not_automatically_verified');
  return {errors:[...new Set(errors)],review:[...new Set(review)],measurements:{width:m.width,height:m.height,format:m.format,bytes:bytes.length,density:m.density,alphaBounds:bounds,whiteOutsideRatio:whiteRatio},status:errors.length?'failed':'needs_visual_review'};
}
