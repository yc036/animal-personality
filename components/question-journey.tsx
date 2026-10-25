"use client";
import type {RefObject} from "react";
import {ArrowLeft,ArrowRight,Check,CheckCircle2,Compass,LoaderCircle,Sparkles} from "lucide-react";
import {journey,questions,type Answers} from "../lib/assessment";

type Props={answers:Answers;index:number;busy:boolean;error:string;containerRef:RefObject<HTMLDivElement|null>;onSelect:(id:string)=>void;onMove:(index:number)=>void;onSubmit:()=>void};
export default function QuestionJourney({answers,index,busy,error,containerRef,onSelect,onMove,onSubmit}:Props){
  const question=questions[index],chapter=journey.chapters[question.chapter];
  const complete=questions.filter(q=>Boolean(answers[q.id])).length;
  return <main className="quiz-main journey-main"><div ref={containerRef} className="journey-anchor">
    <div className="quiz-meta"><span><Compass size={16}/>第{question.chapter+1}站 · {chapter.title}</span><span><strong>{String(index+1).padStart(2,"0")}</strong> / 24</span></div>
    <div className="progress-track" aria-label={`已回答${complete}题，共24题`}><span style={{width:`${complete/24*100}%`}}/></div>
    <ol className="journey-stops" aria-label="生活情境旅程">{journey.chapters.map((item,i)=><li key={item.id} className={i===question.chapter?"current":i<question.chapter?"passed":""} aria-current={i===question.chapter?"step":undefined}><span>{i<question.chapter?<Check size={12}/>:i+1}</span>{item.title}</li>)}</ol>
    {index%6===0&&<div className="journey-milestone"><Sparkles size={16}/><p>{chapter.milestone}</p></div>}
    <p className="journey-instruction">每题都是新片段，按这一幕最像你的反应选。</p>
    <div className="question-panel" key={question.id}>
      <div className={`context-strip ${question.dimension.startsWith("I")?"familiar":"everyday"}`}><span>{question.context}</span><p>{question.contextHint}</p></div>
      <span className="story-scene">{question.scene}</span><h1>{question.stem}</h1>
      <fieldset className="answer-options"><legend className="sr-only">请选择最接近你的一项</legend>{question.options.map(option=><label key={option.id} className={`answer-option ${answers[question.id]===option.id?"selected":""}`}><input type="radio" name={question.id} value={option.id} checked={answers[question.id]===option.id} onChange={()=>onSelect(option.id)}/><span className="option-letter">{option.id}</span><span>{option.text}</span><span className="option-check">{answers[question.id]===option.id&&<Check size={18}/>}</span></label>)}</fieldset>
      <button className={`skip-button ${answers[question.id]==="X"?"chosen":""}`} onClick={()=>onSelect("X")}>{answers[question.id]==="X"&&<Check size={15}/>}没有相近经历，暂时无法判断</button>
    </div>
    {error&&<div className="error-message" role="alert"><p>{error}</p>{error.includes("题目已升级")&&<a href="/" className="restart-link">回到首页开启新题目 <ArrowRight size={14}/></a>}</div>}
    <div className="quiz-controls"><button className="button secondary" onClick={()=>onMove(index-1)} disabled={index===0||busy}><ArrowLeft size={18}/>上一题</button>{index<23?<button className="button primary" onClick={()=>onMove(index+1)} disabled={!answers[question.id]||busy}>{index%6===5?"去下一站":"下一幕"}<ArrowRight size={18}/></button>:<button className="button primary" onClick={onSubmit} disabled={!answers[question.id]||busy}>{busy?<LoaderCircle size={18} className="spin"/>:<Sparkles size={18}/>} {busy?"正在整理你的动物报告…":"看看我的双面动物"}</button>}</div>
    <p className="quiz-footnote"><CheckCircle2 size={15}/>已回答 {complete} / 24 题，随时可以返回修改。报告生成后才计次。</p>
  </div></main>;
}
