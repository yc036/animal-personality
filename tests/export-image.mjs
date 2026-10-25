// 离线执行与浏览器共用的长图生成函数，不控制浏览器。
import {createRequire} from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {buildSync} from 'esbuild';
const require=createRequire(import.meta.url);
const {createCanvas,loadImage}=require('@napi-rs/canvas');
const code=buildSync({entryPoints:['lib/export-image.ts'],bundle:true,platform:'node',format:'cjs',define:{'import.meta.env.BASE_URL':JSON.stringify('/subpath/')},write:false}).outputFiles[0].text;
let calls=[];
const document={createElement(tag){assert.equal(tag,'canvas');const canvas=createCanvas(1,1),getContext=canvas.getContext.bind(canvas);canvas.getContext=(type)=>{const ctx=getContext(type);if(!ctx.__qa){ctx.__qa=true;const draw=ctx.drawImage.bind(ctx),fill=ctx.fillText.bind(ctx);ctx.drawImage=(image,...args)=>draw(image._image??image,...args);ctx.fillText=(text,x,y,...args)=>{calls.push({text,y,font:ctx.font});return fill(text,x,y,...args);};}return ctx;};canvas.toBlob=callback=>callback(new Blob([canvas.toBuffer('image/png')],{type:'image/png'}));return canvas;}};
class LocalImage{set src(url){assert.match(url,/^\/subpath\/animals\/[a-z_]+\.svg$/);loadImage(path.join(process.cwd(),'public',url.replace('/subpath/','/'))).then(image=>{this._image=image;this.onload?.();}).catch(e=>this.onerror?.(e));}}
const module={exports:{}};new Function('module','exports','document','Image',code)(module,module.exports,document,LocalImage);
fs.mkdirSync('outputs/qa',{recursive:true});
const assessment=JSON.parse(fs.readFileSync('data/assessment.json','utf8'));
const measureCtx=createCanvas(1,1).getContext('2d');let maxHeight=0;
for(const outer of assessment.animals)for(const inner of assessment.animals){const height=module.exports.estimateResultImageHeight(measureCtx,{id:'qa',outer:outer.id,inner:inner.id,resultKey:`${outer.id}__${inner.id}`,soft:true,createdAt:1792890000000,insightIds:['selective_entry','familiar_share','clear_scope']});assert.ok(height<15000,`${outer.id}__${inner.id} image too tall`);maxHeight=Math.max(maxHeight,height);}
console.log(JSON.stringify({allReportImageHeightsChecked:144,maxEstimatedHeight:maxHeight}));
const samples=[['black_cat','golden_retriever'],['golden_retriever','wolf'],['lion','rabbit']];
for(const[outer,inner]of samples){calls=[];const {blob,filename}=await module.exports.createResultImage({id:'qa',outer,inner,resultKey:`${outer}__${inner}`,soft:true,createdAt:1792890000000,insightIds:['selective_entry','familiar_share','clear_scope']});const buffer=Buffer.from(await blob.arrayBuffer());assert.ok(buffer.length>20_000);const w=buffer.readUInt32BE(16),h=buffer.readUInt32BE(20);assert.equal(w,1080);assert.ok(h>2500&&h<15000);assert.ok(Math.max(...calls.map(c=>c.y))+60<h,'Canvas cut off the final text');assert.ok(calls.some(c=>c.text.includes('学到一点')));assert.ok(calls.some(c=>c.text.includes('给朋友的相处说明')));assert.ok(calls.some(c=>c.text.includes('3个细节')));fs.writeFileSync(path.join('outputs/qa',filename),buffer);console.log(JSON.stringify({outer,inner,width:w,height:h,bytes:buffer.length,allSectionsRendered:true}));}
