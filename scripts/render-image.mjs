import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { PROFILES,sha,readJSON,assert,checkManifest,resolveCopy,alphaBounds,coverPlan,transformBoxes,inside,checkImage,fontPostscriptNames } from './lib/core.mjs';

const escape=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
export async function renderImage(manifestFile,{out,fonts,production=false,replace=false}={}) {
  assert(out,'--out is required');
  const manifestPath=path.resolve(manifestFile),base=path.dirname(manifestPath),s=await readJSON(manifestPath);checkManifest(s);
  const p=PROFILES[s.kind];
  const input=await fs.readFile(path.resolve(base,s.asset.file)),inputHash=sha(input),meta=await sharp(input).metadata();
  if(s.asset.sha256)assert(inputHash===s.asset.sha256,'asset SHA-256 mismatch');
  if(production)assert(s.asset.sha256,'Production requires a pinned asset SHA-256');
  const product=s.product?await readJSON(path.resolve(base,s.product)):{};
  const copy=resolveCopy(product,[s.title,s.description],s.sku_id,production);
  const layers=[],textBoxes=[],fontFiles=[];let subjectBoxes=[];
  if(s.kind==='catalog'){
    assert(meta.format==='png'&&meta.hasAlpha,'Catalog input must be a transparent PNG');
    const a=await alphaBounds(input);assert(a.box&&a.transparent>0,'Catalog input has no transparent background or foreground');
    const w=a.box.width,h=a.box.height,scale=Math.min(640/w,640/h);
    const tw=Math.max(1,Math.round(w*scale)),th=Math.max(1,Math.round(h*scale));
    const fg=await sharp(input).extract({left:a.box.x,top:a.box.y,width:w,height:h}).resize(tw,th).png().toBuffer();
    layers.push({input:fg,left:Math.round((800-tw)/2),top:Math.round((800-th)/2)});
  }else{
    const sourceBox={x:0,y:0,width:meta.width,height:meta.height};
    for(const b of s.asset.subject_boxes??[])assert(inside(b,sourceBox),'Subject box is outside source image');
    const reframe=s.asset.reframe??{},plan=coverPlan(meta,p,reframe);
    subjectBoxes=transformBoxes(s.asset.subject_boxes,meta,p,reframe);
    for(const b of subjectBoxes)assert(inside(b,p.safe,0.001),'Product would be cropped or outside safe area');
    if(production)assert(subjectBoxes.length&&s.asset.subject_review?.source&&s.asset.subject_review.sha256===inputHash,'Production requires reviewed subject boxes bound to asset hash');
    const bg=await sharp(input).resize(plan.width,plan.height,{fit:'fill'}).extract({left:plan.cropLeft,top:plan.cropTop,width:p.width,height:p.height}).png().toBuffer();
    layers.push({input:bg,left:0,top:0});
  }
  if(s.kind==='carousel-headline'){
    const fontDir=fonts||process.env.YOUPIN_FONT_DIR;assert(fontDir,'--fonts must point to real MiSans OTF files');
    const regular=path.resolve(fontDir,'MiSans-Regular.otf');await fs.access(regular);
    let y=194;
    for(let i=0;i<copy.length;i++){
      const size=i===0?68:42,weight=i===0?'Semibold':'Medium',fontFile=path.resolve(fontDir,`MiSans-${weight}.otf`);
      const fontBytes=await fs.readFile(fontFile);assert(fontPostscriptNames(fontBytes).includes(`MiSans-${weight}`),`Wrong font identity: ${fontFile}`);
      const {data,info}=await sharp({text:{text:`<span foreground="#000000">${escape(copy[i].text)}</span>`,font:`MiSans ${weight} ${size}`,fontfile:fontFile,rgba:true,dpi:72}}).png().toBuffer({resolveWithObject:true});
      assert(info.width<=980,'Text exceeds carousel slot; shorten copy instead of shrinking font');
      const x=Math.round((1080-info.width)/2);
      textBoxes.push({role:i===0?'title':'description',copy_id:copy[i].id,x,y,width:info.width,height:info.height,size,weight,lineStep:i===0?82:62,alignment:'center'});
      layers.push({input:data,left:x,top:y});fontFiles.push({file:fontFile,sha256:sha(fontBytes)});y+=info.height+30;
    }
  }
  const raster=await sharp({create:{width:p.width,height:p.height,channels:4,background:s.kind==='catalog'?{r:0,g:0,b:0,alpha:0}:'#e9e4da'}}).composite(layers).png().toBuffer();
  let encoded,encoding;
  if(p.format==='png'){
    encoded=await sharp(raster).withMetadata({density:72}).png({compressionLevel:9}).toBuffer();encoding={format:'png',palette:false};
    if(encoded.length>p.maxBytes)for(const quality of [100,95,90,85,80,70]){
      encoded=await sharp(raster).withMetadata({density:72}).png({palette:true,quality,dither:0,compressionLevel:9}).toBuffer();encoding={format:'png',palette:true,quality};if(encoded.length<=p.maxBytes)break;
    }
  }else for(const quality of [94,92,90,88,85,82,79,76,72,68,64,60,55]){
    encoded=await sharp(raster).flatten({background:'#e9e4da'}).withMetadata({density:72}).jpeg({quality,chromaSubsampling:'4:4:4',mozjpeg:true}).toBuffer();encoding={format:'jpeg',quality};if(encoded.length<=p.maxBytes)break;
  }
  assert(encoded.length<=p.maxBytes,'Cannot reach file-size cap without excessive compression; simplify source');
  const outputHash=sha(encoded);
  if(production)assert(s.visual_review?.source&&s.visual_review.output_sha256===outputHash,'Production needs a human review record matching this exact preview hash');
  const outputDir=path.resolve(out),file=path.join(outputDir,`${s.id}.${p.format==='png'?'png':'jpg'}`),reportFile=path.join(outputDir,`${s.id}.report.json`);
  await fs.mkdir(outputDir,{recursive:true});
  try {
    const old=await readJSON(reportFile);
    assert(replace||old.revision===s.revision,'Revision already exists here; use a new output directory to retain history');
    assert(replace||old.output_sha256===outputHash,'Image changed; use a new revision and output directory to retain history');
  }catch(e){if(e.code!=='ENOENT')throw e;}
  const report={schema_version:1,id:s.id,revision:s.revision,kind:s.kind,mode:production?'production':'preview',sku_id:s.sku_id,shared_master_id:s.shared_master_id??null,source:p.source,asset:{file:path.resolve(base,s.asset.file),sha256:inputHash,origin:s.asset.origin??'unspecified',reframe:s.asset.reframe??null},manifest_sha256:sha(Buffer.from(JSON.stringify(s))),subject_boxes:subjectBoxes,text_boxes:textBoxes,font_files:fontFiles,copy,encoding,output_sha256:outputHash,visual_review:s.visual_review??null};
  const temp=`${file}.${process.pid}.tmp`;
  await fs.writeFile(temp,encoded);
  try{
    report.verification=await checkImage(temp,report);
    assert(report.verification.errors.length===0,`Export rejected: ${report.verification.errors.join(', ')}`);
    await fs.rename(temp,file);
    const reportTemp=`${reportFile}.${process.pid}.tmp`;await fs.writeFile(reportTemp,JSON.stringify(report,null,2));await fs.rename(reportTemp,reportFile);
  }finally{await fs.rm(temp,{force:true});}
  return {file,reportFile,report};
}

export function options(args) {
  const opts={};let manifest;
  for(let i=0;i<args.length;i++){
    if(args[i]==='--production')opts.production=true;
    else if(args[i]==='--replace')opts.replace=true;
    else if(['--out','--fonts'].includes(args[i])){assert(args[i+1],`Missing value for ${args[i]}`);opts[args[i].slice(2)]=args[++i];}
    else if(!manifest&&!args[i].startsWith('-'))manifest=args[i];else throw Error(`Unknown argument: ${args[i]}`);
  }
  assert(manifest,'Usage: node scripts/render-image.mjs image.json --out run-dir [--fonts font-dir] [--production]');return {manifest,opts};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try {const {manifest,opts}=options(process.argv.slice(2));const r=await renderImage(manifest,opts);console.log(JSON.stringify({file:r.file,report:r.reportFile,status:r.report.verification.status,mode:r.report.mode}));}
  catch(e){console.error(e.message);process.exitCode=1;}
}
