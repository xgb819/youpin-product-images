import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const imageExts=new Set(['.jpg','.jpeg','.png','.webp','.gif','.tif','.tiff']);
const natural=new Intl.Collator('zh-CN',{numeric:true,sensitivity:'base'});
const xml=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&apos;"})[c]);

async function walk(root,outRoot){
  const found=[];
  async function visit(dir){
    for(const entry of await fs.readdir(dir,{withFileTypes:true})){
      const full=path.join(dir,entry.name);
      if(path.resolve(full)===outRoot)continue;
      if(entry.isDirectory())await visit(full);
      else if(entry.isFile()&&imageExts.has(path.extname(entry.name).toLowerCase()))found.push(full);
    }
  }
  await visit(root);
  return found.sort((a,b)=>natural.compare(path.relative(root,a),path.relative(root,b)));
}

export async function inventoryAssets(inputDir,outputDir){
  const root=path.resolve(inputDir),out=path.resolve(outputDir);
  const files=await walk(root,out);
  if(!files.length)throw new Error(`No supported images found in ${root}`);
  await fs.mkdir(out,{recursive:true});
  const assets=[];
  for(let i=0;i<files.length;i++){
    const file=files[i],buffer=await fs.readFile(file),meta=await sharp(buffer,{animated:true}).metadata();
    assets.push({
      id:`asset-${String(i+1).padStart(3,'0')}`,
      path:path.relative(root,file).replaceAll('\\','/'),
      width:meta.width??null,height:meta.height??null,format:meta.format??null,
      has_alpha:Boolean(meta.hasAlpha),pages:meta.pages??1,bytes:buffer.length,
      sha256:crypto.createHash('sha256').update(buffer).digest('hex')
    });
  }
  const manifest={generated_at:new Date().toISOString(),source_root:root,count:assets.length,assets};
  await fs.writeFile(path.join(out,'asset-inventory.json'),`${JSON.stringify(manifest,null,2)}\n`,'utf8');

  const cols=4,cardW=300,cardH=350,thumbW=276,thumbH=276,gap=18;
  const rows=Math.ceil(files.length/cols),sheetW=gap+cols*(cardW+gap),sheetH=gap+rows*(cardH+gap);
  const cards=[];
  for(let i=0;i<files.length;i++){
    const item=assets[i],x=gap+(i%cols)*(cardW+gap),y=gap+Math.floor(i/cols)*(cardH+gap);
    const thumb=await sharp(files[i]).rotate().resize(thumbW,thumbH,{fit:'inside',withoutEnlargement:true,background:'#ffffff'}).flatten({background:'#ffffff'}).jpeg({quality:84}).toBuffer();
    const tm=await sharp(thumb).metadata(),tx=x+Math.floor((cardW-(tm.width??thumbW))/2),ty=y+12;
    cards.push({input:thumb,left:tx,top:ty});
    const label=`${String(i+1).padStart(3,'0')}  ${item.width}×${item.height}\n${item.path}`;
    const svg=`<svg width="${cardW}" height="58" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#fff"/><text x="8" y="20" font-family="Arial,Microsoft YaHei,sans-serif" font-size="15" fill="#111"><tspan x="8">${xml(label.split('\n')[0])}</tspan><tspan x="8" dy="23" font-size="12" fill="#555">${xml(label.split('\n')[1].slice(0,42))}</tspan></text></svg>`;
    cards.push({input:Buffer.from(svg),left:x,top:y+cardH-62});
  }
  await sharp({create:{width:sheetW,height:sheetH,channels:3,background:'#eceef2'}}).composite(cards).jpeg({quality:88}).toFile(path.join(out,'asset-contact-sheet.jpg'));
  return {manifest:path.join(out,'asset-inventory.json'),contactSheet:path.join(out,'asset-contact-sheet.jpg'),count:assets.length};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const input=process.argv[2];
  const outFlag=process.argv.indexOf('--out');
  const output=outFlag>=0?process.argv[outFlag+1]:input&&path.join(input,'_asset-review');
  if(!input||!output){console.error('Usage: node scripts/inventory-assets.mjs /path/to/extracted-folder [--out /path/to/review]');process.exitCode=2;}
  else try{console.log(JSON.stringify(await inventoryAssets(input,output),null,2));}catch(error){console.error(error.message);process.exitCode=1;}
}
