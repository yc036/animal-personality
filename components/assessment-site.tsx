"use client";
import {useEffect,useRef,useState} from "react";
import {ArrowRight,ArrowLeft,Check,CheckCircle2,Copy,Download,Gift,Heart,LockKeyhole,LoaderCircle,PawPrint,RotateCcw,ShieldCheck,Sparkles,X,Share2,BookOpen,ChevronRight} from "lucide-react";
import {animals,animalById,questions,questionnaireVersion,type Animal,type Answers,type SavedResult} from "../lib/assessment";
import {resultContent,resultNotice,theoryNotes} from "../lib/report";
import {createResultImage} from "../lib/export-image";
import QuestionJourney from "./question-journey";

import {api,ApiError} from "../lib/client";
import {assetUrl,homeUrl,resultUrl} from "../lib/navigation";
type AccessReply={remaining:number;hint:string};
function Modal({children,title,onClose}:{children:React.ReactNode;title:string;onClose:()=>void}){
  const ref=useRef<HTMLDialogElement>(null),closeRef=useRef(onClose);closeRef.current=onClose;
  useEffect(()=>{const el=ref.current;el?.showModal();const cancel=(e:Event)=>{e.preventDefault();closeRef.current();};el?.addEventListener("cancel",cancel);return()=>{el?.removeEventListener("cancel",cancel);el?.close();};},[]);
  return <dialog ref={ref} className="dialog" onClick={e=>{if(e.target===ref.current)onClose();}}><div className="dialog-heading"><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label="关闭弹窗"><X size={22}/></button></div>{children}</dialog>;
}
function AnimalImage({id,className=""}:{id:string;className?:string}){return <img className={className} src={assetUrl(`animals/${id}.svg`)} alt={animalById(id).name} width="240" height="240"/>;}
function Logo(){return <a href={homeUrl()} className="brand"><span className="brand-icon"><PawPrint size={22}/></span><span>反差动物人格<small>MY ANIMAL MIRROR</small></span></a>;}
function Footer(){return <footer className="site-footer"><span>每一面，都有自己的相处节奏。</span><p>依据自我描述生成的趣味画像 · 用一点好奇，认识自己</p></footer>;}

export default function AssessmentSite({resultId}:{resultId?:string}){
  const [screen,setScreen]=useState<"home"|"quiz"|"result">(resultId?"result":"home");
  const [code,setCode]=useState(""),[access,setAccess]=useState<{remaining:number;hint:string}|null>(null);
  const [busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
  const [answers,setAnswers]=useState<Answers>({}),[index,setIndex]=useState(0),[attemptId,setAttemptId]=useState("");
  const [saved,setSaved]=useState<SavedResult|null>(null),[resultLoading,setResultLoading]=useState(Boolean(resultId));
  const [reviewOpen,setReviewOpen]=useState(false),[animalOpen,setAnimalOpen]=useState<Animal|null>(null);
  const [image,setImage]=useState<{url:string;blob:Blob;filename:string}|null>(null),[copyFallback,setCopyFallback]=useState("");
  const questionTop=useRef<HTMLDivElement>(null);
  useEffect(()=>{api<AccessReply>("/api/access").then(setAccess).catch(()=>{});},[]);
  useEffect(()=>{if(!resultId)return;setResultLoading(true);api<SavedResult>(`/api/results/${resultId}`).then(setSaved).catch(e=>setError(e.message)).finally(()=>setResultLoading(false));},[resultId]);
  useEffect(()=>{if(!notice)return;const timer=setTimeout(()=>setNotice(""),4000);return()=>clearTimeout(timer);},[notice]);
  useEffect(()=>{if(screen!=="quiz"||!attemptId)return;try{localStorage.setItem(`animal-progress:${questionnaireVersion}:${attemptId}`,JSON.stringify({answers,index,version:questionnaireVersion}));}catch{}},[answers,index,attemptId,screen]);
  useEffect(()=>()=>{if(image)URL.revokeObjectURL(image.url);},[image]);
  async function start(e?:React.FormEvent){
    e?.preventDefault();if(busy)return;setBusy(true);setError("");
    try{
      if(!access){const login=await api<AccessReply>("/api/access",{method:"POST",body:JSON.stringify({code})});setAccess(login);setCode("");}
      const progress=await api<{attemptId:string;remaining:number;questionnaireVersion:string}>("/api/attempt/start",{method:"POST",body:"{}"});if(progress.questionnaireVersion!==questionnaireVersion)throw new ApiError("题目已升级，请刷新页面后再开始。",409,{});setAccess(a=>a?{...a,remaining:progress.remaining}:a);
      let prior:{answers?:Answers;index?:number;version?:string}={};try{prior=JSON.parse(localStorage.getItem(`animal-progress:${questionnaireVersion}:${progress.attemptId}`)??"{}");}catch{}
      if(!prior||prior.version!==questionnaireVersion)prior={};
      const restored:Answers={};for(const q of questions){const value=prior.answers?.[q.id];if(value==="X"||q.options.some(o=>o.id===value))restored[q.id]=value!;}
      setAnswers(restored);setIndex(Math.max(0,Math.min(23,Number(prior.index)||0)));setAttemptId(progress.attemptId);setScreen("quiz");window.scrollTo({top:0,behavior:"smooth"});
    }catch(e){const err=e as ApiError;setError(err.message);if(err.status===401)setAccess(null);}finally{setBusy(false);}
  }
  function select(value:string){setAnswers(a=>({...a,[questions[index].id]:value}));setError("");}
  function move(next:number){setIndex(next);setError("");questionTop.current?.scrollIntoView({behavior:"smooth",block:"start"});}
  async function submit(){
    if(busy)return;setBusy(true);setError("");
    try{const response=await api<{resultId:string}>("/api/attempt/submit",{method:"POST",body:JSON.stringify({attemptId,answers,questionnaireVersion})});try{localStorage.removeItem(`animal-progress:${questionnaireVersion}:${attemptId}`);}catch{}window.location.assign(resultUrl(response.resultId));}
    catch(e){const err=e as ApiError;setError(err.message);const ids=err.data?.questionIds as string[]|undefined;if(ids?.length){const i=questions.findIndex(q=>q.id===ids[0]);if(i>=0)setIndex(i);}setBusy(false);}
  }
  async function copyLink(){const url=resultUrl(saved!.id);try{await navigator.clipboard.writeText(url);setNotice("结果链接已复制，可以发给朋友啦。");}catch{setCopyFallback(url);}}
  async function saveImage(){if(!saved||busy)return;setBusy(true);setError("");try{const result=await createResultImage(saved);setImage({...result,url:URL.createObjectURL(result.blob)});}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  async function shareImage(){if(!image)return;const file=new File([image.blob],image.filename,{type:"image/png"});try{if(navigator.canShare?.({files:[file]})){await navigator.share({files:[file],title:"我的双面动物报告"});}else{downloadImage();}}catch(e){if((e as Error).name!=="AbortError")setNotice("可以点击下载，或长按预览图片保存。");}}
  function downloadImage(){if(!image)return;const a=document.createElement("a");a.href=image.url;a.download=image.filename;document.body.appendChild(a);a.click();a.remove();setNotice("已发起图片保存，手机也可以长按预览图保存。");}
  const current=questions[index],complete=questions.filter(q=>Boolean(answers[q.id])).length,content=saved?resultContent(saved):null;
  return <div className="app-shell">
    <header className="site-header"><Logo/><nav>{screen==="home"?<><a href="#animals">动物图鉴</a><a href="#how">怎么测</a></>:<a href={homeUrl()}>回到首页 <ArrowRight size={15}/></a>}</nav></header>
    {screen==="home"&&<main>
      <section className="hero page-width"><div className="hero-copy"><div className="eyebrow"><span/> 一次有点可爱的自我探索</div><h1>你在人前像谁，<br/>熟了之后<span className="accent-word">又像谁？<svg viewBox="0 0 220 12" aria-hidden="true"><path d="M3 8Q100-2 216 6"/></svg></span></h1><p className="hero-description">有的人在人前是黑猫，熟了却是金毛。<br/>用24个生活小场景，遇见你的双面动物。</p>
      <form className="access-form" onSubmit={start}><label htmlFor="test-code">{access?"你的测评通行证已准备好":"输入测试密码，开启你的探索"}</label>{access?<div className="access-ready"><ShieldCheck size={22}/><div><strong>密码尾号 {access.hint}</strong><span>还可生成 {access.remaining} 份测评报告</span></div><button type="button" onClick={()=>{setAccess(null);setError("");}}>更换</button></div>:<div className="password-field"><LockKeyhole size={20}/><input id="test-code" type="password" autoComplete="off" placeholder="请输入店铺提供的测试密码" value={code} onChange={e=>setCode(e.target.value)} maxLength={40} required aria-describedby="access-note"/></div>}
      {error&&<p className="error-message" role="alert">{error}</p>}<button className="button primary start-button" disabled={busy||(access!==null&&access.remaining<=0)}>{busy?<LoaderCircle className="spin" size={20}/>:<Sparkles size={20}/>} {busy?"正在准备…":access?"开始 / 继续测评":"开启我的动物探索"}<ArrowRight size={20}/></button><p id="access-note" className="form-note">每个密码可测3次 · 生成报告后计次 · 中途可返回修改</p></form>
      <div className="hero-facts"><span><b>24</b> 道生活情境题</span><span><b>12</b> 种动物原型</span><span><b>144</b> 种双面组合</span></div></div>
      <div className="hero-art" aria-label="示例组合：日常黑猫，放松金毛"><div className="orbit orbit-one"/><div className="orbit orbit-two"/><span className="art-note top-note">你以为的我</span><div className="portrait portrait-outer"><span className="portrait-label">日常模式</span><AnimalImage id="black_cat"/><strong>安静有数的黑猫</strong><small>平时话不多，选择很清楚</small></div><span className="between-star">✳</span><div className="portrait portrait-inner"><span className="portrait-label">放松模式</span><AnimalImage id="golden_retriever"/><strong>熟人限定金毛</strong><small>遇到自己人，分享停不下来</small></div><span className="art-note bottom-note">还有你熟悉的我</span><span className="example-note">示例组合 · 你的答案会给出属于你的搭配</span></div></section>
      <section id="animals" className="catalog-section"><div className="page-width"><div className="section-heading"><div><div className="eyebrow">MEET YOUR ANIMALS</div><h2>你的另一面，藏在哪只动物里？</h2></div><p>每一种相处节奏，都有自己的可爱。<br/>点开动物，先认识一下它。</p></div><div className="animal-grid">{animals.map(a=><button key={a.id} className={`animal-tile animal-tone-${a.expression_band}`} onClick={()=>setAnimalOpen(a)}><AnimalImage id={a.id}/><strong>{a.name}</strong><span>{a.role}</span><ChevronRight size={17}/></button>)}</div></div></section>
      <section id="how" className="how-section page-width"><div className="section-heading"><div><div className="eyebrow">A LITTLE GUIDE</div><h2>花几分钟，和自己碰个面。</h2></div><p>选最像你的日常，<br/>每一面都值得被看见。</p></div><div className="how-grid"><article><span className="step-num">01</span><h3>带上你的测试密码</h3><p>输入店铺提供的密码。每个密码有3次生成报告的机会。</p></article><article><span className="step-num">02</span><h3>回答24个生活小场景</h3><p>聚餐、群聊、朋友邀约……选常见的自己，也能随时返回修改。</p></article><article><span className="step-num">03</span><h3>收下你的双面动物报告</h3><p>读懂两种相处模式，保存完整长图，或把结果链接发给朋友。</p></article></div><p className="quiet-note"><BookOpen size={17}/>结合性格与情境研究中的相关概念，提供趣味自我探索。动物归类是原创表达。</p></section>
    </main>}
    {screen==="quiz"&&<QuestionJourney answers={answers} index={index} busy={busy} error={error} containerRef={questionTop} onSelect={select} onMove={move} onSubmit={submit}/>}
    {screen==="result"&&<main className="result-main">
      {resultLoading?<div className="loading-state"><LoaderCircle className="spin" size={30}/><h1>正在打开你的动物报告…</h1></div>:!saved||!content?<div className="empty-state"><PawPrint size={42}/><h1>这份报告暂时没有找到</h1><p>{error||"请检查分享链接是否完整。"}</p><a className="button primary" href={homeUrl()}>回到首页</a></div>:<>
      <div className="result-heading"><div className="eyebrow">{saved.own?"YOUR ANIMAL MIRROR":"A FRIEND’S ANIMAL MIRROR"}</div><h1>{saved.own?"原来，你还有这一面。":"来认识一下，TA的另一面。"}</h1><p>{new Date(saved.createdAt).toLocaleDateString("zh-CN",{timeZone:"Asia/Shanghai",year:"numeric",month:"long",day:"numeric"})} · 双面动物报告</p></div>
      <div id="result-report" className="result-report"><div className="duo-portrait"><div className="duo-animal outer"><span>日常模式</span><AnimalImage id={saved.outer}/><h2>{content.outer.name}</h2><p>{content.outer.role}</p></div><span className="duo-cross">×</span><div className="duo-animal inner"><span>放松模式</span><AnimalImage id={saved.inner}/><h2>{content.inner.name}</h2><p>{content.inner.role}</p></div></div><div className="result-title-block"><span className="result-tag">{content.report.canonical_title}</span><h2>{content.report.nickname}</h2><p>“{content.report.share_line}”</p></div>{saved.soft&&<p className="soft-note">这次更接近这一组合。部分回答在相邻类型之间，可以把结果当作观察线索。</p>}
      <div className="resonance-note"><Sparkles size={18}/><div><span>一句想说给你听的话</span><p>{content.resonance}</p></div></div>
      <div className="analysis-sections">{content.sections.map((section,i)=><section key={section.title} className={`analysis-section section-${i} ${section.title.includes("学到一点")?"learning-section":""}`}><div className="analysis-number">{String(i+1).padStart(2,"0")}</div><div><h3>{section.title}</h3>{section.paragraphs.map((paragraph,j)=><p key={j}>{paragraph}</p>)}</div></section>)}</div><div className="theory-links"><BookOpen size={18}/><span>想了解相关概念：</span>{content.report.theory_refs.map(id=><a key={id} href={theoryNotes[id].url} target="_blank" rel="noreferrer">{id==="T1"?"人格侧面研究":id==="T2"?"整体特质理论":"自我决定理论"}<ArrowRight size={12}/></a>)}</div><p className="report-notice">{resultNotice}</p></div>
      <section className="result-actions"><h2>把这一面的你，留住吧。</h2><p>保存一张完整长图，或发给那个熟悉你的人。</p><div className="action-grid"><button className="button primary" onClick={saveImage} disabled={busy}>{busy?<LoaderCircle className="spin" size={20}/>:<Download size={20}/>} {busy?"正在生成长图…":"保存完整结果长图"}</button><button className="button secondary" onClick={copyLink}><Copy size={19}/>复制结果链接</button><a className="button secondary" href={homeUrl()}><RotateCcw size={19}/>{saved.own?"再测一次":"我也来测一测"}</a><button className="button gift-button" onClick={()=>setReviewOpen(true)}><Gift size={20}/>好评有礼</button></div>{saved.own&&saved.remaining!==undefined&&<p className="remaining-note">当前密码还可生成 {saved.remaining} 份报告。再次查看、保存和分享本报告不扣次数。</p>}{error&&<p className="error-message" role="alert">{error}</p>}</section></>}
    </main>}
    <Footer/>
    {notice&&<div className="toast" role="status"><CheckCircle2 size={18}/>{notice}</div>}
    {reviewOpen&&<Modal title="好评有礼" onClose={()=>setReviewOpen(false)}><div className="gift-symbol"><Gift size={42}/></div><h3 className="modal-centered">谢谢你喜欢这次探索</h3><p className="modal-centered">店铺好评后，请联系客服并发送好评截图，<br/>即可获得返现。</p><p className="modal-hint">请回到购买店铺联系在线客服，具体返现事宜由客服为你办理。</p><button className="button primary full-width" onClick={()=>setReviewOpen(false)}><Heart size={18}/>知道啦</button></Modal>}
    {animalOpen&&<Modal title={`${animalOpen.name} · ${animalOpen.role}`} onClose={()=>setAnimalOpen(null)}><AnimalImage id={animalOpen.id} className="modal-animal"/><p className="modal-quote">{animalOpen.share_line}</p><p>{animalOpen.summary}</p><div className="modal-detail"><strong>你可能熟悉的场景</strong><p>{animalOpen.scene}</p></div><p className="modal-hint">日常和放松时可能是不同的动物，完成测评后就能看到你的组合。</p><button className="button primary full-width" onClick={()=>{setAnimalOpen(null);document.querySelector(".access-form")?.scrollIntoView({behavior:"smooth",block:"center"});}}>去发现我的组合<ArrowRight size={18}/></button></Modal>}
    {image&&<Modal title="你的完整结果长图" onClose={()=>setImage(null)}><div className="image-preview"><img src={image.url} alt="双面动物完整测评结果长图"/></div><p className="modal-hint">手机可长按图片保存；也可点击系统分享，选择可用的保存方式。电脑点击下载即可保存PNG文件。</p><div className="modal-actions"><button className="button primary" onClick={downloadImage}><Download size={18}/>下载图片</button><button className="button secondary" onClick={shareImage}><Share2 size={18}/>系统分享</button></div></Modal>}
    {copyFallback&&<Modal title="分享这份动物报告" onClose={()=>setCopyFallback("")}><p>浏览器未允许自动复制，可以长按或选中下面的链接复制。</p><input className="copy-input" readOnly value={copyFallback} onFocus={e=>e.currentTarget.select()} aria-label="结果分享链接"/><button className="button primary full-width" onClick={()=>setCopyFallback("")}>完成</button></Modal>}
  </div>;
}
