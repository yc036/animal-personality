import {assetUrl} from "./navigation";
import { resultContent, resultNotice } from "./report";
import type { SavedResult } from "./assessment";
function lines(ctx:CanvasRenderingContext2D,text:string,maxWidth:number){
  const out:string[]=[];for(const paragraph of text.split("\n")){const units:string[]=[];for(const char of Array.from(paragraph)){if("，。！？；：、）》】”’…,.!?;:)]}".includes(char)&&units.length)units[units.length-1]+=char;else units.push(char);}let line="";for(const unit of units){if(ctx.measureText(line+unit).width>maxWidth&&line){out.push(line);line=unit;}else line+=unit;}out.push(line);}return out;
}
function rounded(ctx:CanvasRenderingContext2D,x:number,y:number,w:number,h:number,r:number){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();}
function loadAnimal(id:string){return new Promise<HTMLImageElement>((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error("动物插画暂时没有加载成功，请稍后重试。"));img.src=assetUrl(`animals/${id}.svg`);});}
const imageFont=(size:number,weight=400)=>`${weight} ${size}px "PingFang SC","Microsoft YaHei",sans-serif`;
function measureSection(ctx:CanvasRenderingContext2D,section:{title:string;paragraphs:string[]},width:number){
  ctx.font=imageFont(35,700);const heading=lines(ctx,section.title,width-20).length*54;
  ctx.font=imageFont(31);return heading+15+section.paragraphs.reduce((sum,p)=>sum+lines(ctx,p,width-32).length*51+25,0)+32;
}
export function estimateResultImageHeight(ctx:CanvasRenderingContext2D,saved:SavedResult){
  return 1500+(saved.soft?170:0)+resultContent(saved).sections.reduce((sum,section)=>sum+measureSection(ctx,section,928)+18,0)+300;
}
export async function createResultImage(saved:SavedResult){
  const {report,outer,inner,sections,resonance}=resultContent(saved),canvas=document.createElement("canvas"),ctx=canvas.getContext("2d");
  if(!ctx)throw new Error("当前浏览器不支持图片生成，请换一个浏览器试试。");
  const width=1080,pad=76,textWidth=width-pad*2,font=imageFont;
  const sectionHeight=(section:typeof sections[number])=>measureSection(ctx,section,textWidth);
  const height=estimateResultImageHeight(ctx,saved);
  if(height>15000)throw new Error("报告内容较长，请使用浏览器的分享或打印功能保存。");
  canvas.width=width;canvas.height=height;ctx.fillStyle="#f7f4ec";ctx.fillRect(0,0,width,height);let y=84;
  const drawText=(text:string,x:number,maxWidth:number,size:number,lineHeight:number,color="#283d34",weight=400)=>{ctx.font=font(size,weight);ctx.fillStyle=color;ctx.textBaseline="top";const rows=lines(ctx,text,maxWidth);for(const row of rows){ctx.fillText(row,x,y);y+=lineHeight;}return rows.length;};
  drawText("反差动物人格  /  MY ANIMAL MIRROR",pad,textWidth,25,40,"#6b7c6d",600);y+=20;drawText("你的双面动物报告",pad,textWidth,57,77,"#283d34",700);y+=22;
  const cardY=y,cardW=430,cardH=355;
  ctx.fillStyle="#e6eadc";rounded(ctx,pad,cardY,cardW,cardH,30);ctx.fill();ctx.fillStyle="#f0e0d4";rounded(ctx,width-pad-cardW,cardY,cardW,cardH,30);ctx.fill();
  const [outerImg,innerImg]=await Promise.all([loadAnimal(outer.id),loadAnimal(inner.id)]);ctx.drawImage(outerImg,pad+99,cardY+15,232,232);ctx.drawImage(innerImg,width-pad-cardW+99,cardY+15,232,232);
  ctx.font=font(24,500);ctx.fillStyle="#5a6c60";ctx.textAlign="center";ctx.fillText("日常模式",pad+cardW/2,cardY+268);ctx.fillText("放松模式",width-pad-cardW/2,cardY+268);ctx.font=font(39,700);ctx.fillStyle="#283d34";ctx.fillText(outer.name,pad+cardW/2,cardY+307);ctx.fillText(inner.name,width-pad-cardW/2,cardY+307);ctx.textAlign="left";
  y=cardY+cardH+47;drawText(report.nickname,pad,textWidth,45,62,"#365844",700);y+=12;drawText(report.share_line,pad,textWidth,34,54,"#765a45",500);y+=22;
  drawText(resonance,pad,textWidth,31,49,"#537049",500);y+=20;
  drawText(new Date(saved.createdAt).toLocaleDateString("zh-CN",{timeZone:"Asia/Shanghai",year:"numeric",month:"long",day:"numeric"}),pad,textWidth,24,36,"#7a8076");y=Math.max(y+32,850);
  if(saved.soft){drawText("这次更接近这一组合。部分回答在相邻类型之间，可以把结果当作观察线索。",pad,textWidth,27,44,"#6d7469");y+=38;}
  for(const section of sections){ctx.font=font(31);const top=y,h=sectionHeight(section);ctx.fillStyle="#fffdf7";rounded(ctx,pad-18,y-15,textWidth+36,h,22);ctx.fill();drawText(section.title,pad+8,textWidth-20,35,54,"#365844",700);y+=15;for(const paragraph of section.paragraphs){drawText(paragraph,pad+8,textWidth-32,31,51);y+=25;}y=top+h+18;}
  y+=20;drawText(resultNotice,pad,textWidth,25,42,"#777f73");y+=22;drawText("每一面，都有自己的相处节奏。",pad,textWidth,28,44,"#536d58",500);
  const final=document.createElement("canvas");final.width=width;final.height=Math.min(height,Math.ceil(y+70));final.getContext("2d")!.drawImage(canvas,0,0);
  const blob=await new Promise<Blob>((resolve,reject)=>final.toBlob(b=>b?resolve(b):reject(new Error("图片没有生成成功，请重试。")),"image/png"));
  return {blob,filename:`反差动物人格-${outer.name}与${inner.name}.png`};
}
