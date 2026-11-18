import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const validBox=b=>b&&['x','y','width','height'].every(k=>Number.isFinite(b[k]))&&b.x>=0&&b.y>=0&&b.width>0&&b.height>0;
const inside=(a,b)=>a.x>=b.x&&a.y>=b.y&&a.x+a.width<=b.x+b.width&&a.y+a.height<=b.y+b.height;
const intersects=(a,b)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;
const yOverlaps=(a,b)=>a.y<b.y+b.height&&a.y+a.height>b.y;

export function auditHeroLayout(layout){
  const errors=[];
  const width=layout?.canvas?.width,height=layout?.canvas?.height;
  const margin=layout?.safe_margin??80,minGap=layout?.min_logo_gap??30;
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)return {errors:['invalid_canvas'],measurements:{}};
  if(!Number.isFinite(margin)||margin<0||!Number.isFinite(minGap)||minGap<0)errors.push('invalid_rule_value');
  const safe={x:margin,y:0,width:width-margin*2,height};
  const logo=layout.logo_box,texts=layout.text_boxes??[];
  if(!validBox(logo))errors.push('invalid_logo_box');
  else if(!inside(logo,safe))errors.push('logo_outside_horizontal_safe_area');
  if(!Array.isArray(texts)||!texts.length)errors.push('text_boxes_missing');
  const gaps=[];
  for(const item of texts){
    const box=item?.box,label=item?.id??'text';
    if(!validBox(box)){errors.push(`invalid_text_box:${label}`);continue;}
    if(!inside(box,safe))errors.push(`text_outside_horizontal_safe_area:${label}`);
    if(validBox(logo)&&intersects(box,logo))errors.push(`text_overlaps_logo:${label}`);
    if(validBox(logo)&&yOverlaps(box,logo)){
      const gap=box.x+box.width<=logo.x?logo.x-(box.x+box.width):logo.x+logo.width<=box.x?box.x-(logo.x+logo.width):-1;
      gaps.push({id:label,gap});
      if(gap>=0&&gap<minGap)errors.push(`text_logo_gap_too_small:${label}`);
    }
  }
  return {errors:[...new Set(errors)],measurements:{canvas:{width,height},safe,logo_box:logo,text_logo_gaps:gaps,min_logo_gap:minGap},status:errors.length?'failed':'passed'};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const input=process.argv[2];
  if(!input){console.error('Usage: node scripts/check-hero-layout.mjs /path/to/hero-layout.json');process.exitCode=2;}
  else{
    try{
      const file=path.resolve(input),layout=JSON.parse(await fs.readFile(file,'utf8'));
      if(layout.logo_asset){try{await fs.access(path.resolve(path.dirname(file),layout.logo_asset));}catch{layout.__missingLogoAsset=true;}}
      const result=auditHeroLayout(layout);
      if(layout.__missingLogoAsset)result.errors.push('logo_asset_missing');
      result.status=result.errors.length?'failed':'passed';
      console.log(JSON.stringify(result,null,2));
      if(result.errors.length)process.exitCode=1;
    }catch(e){console.error(e.message);process.exitCode=1;}
  }
}
