import { animalById, reportById, questions,type SavedResult } from "./assessment";
import depth from "../data/report-depth.json";
export const theoryNotes: Record<string,{title:string;text:string;url:string}>={
  T1:{title:"互动表达与主张表达，可以分开看",text:"人格研究会区分社交性与果断性。愿意聊天的人也可以有明确主张，安静的人同样可以说清选择。",url:"https://www.colby.edu/wp-content/uploads/2013/08/Soto_John_2017.pdf"},
  T2:{title:"同一个人，会有不同的情境状态",text:"整体特质理论关注一个人在不同情境中的状态变化。日常与放松时的差别，可以帮助你观察哪些关系条件更合心意。",url:"https://pubmed.ncbi.nlm.nih.gov/26097268/"},
  T3:{title:"亲近别人，也可以保留自己的选择",text:"自我决定理论讨论自主与联结等需要。自愿配合可以很自主，亲近别人也可以同时保留个人安排。",url:"https://selfdeterminationtheory.org/the-theory/"},
};
export function resultContent(saved:SavedResult){
  const report=reportById(saved.resultKey),outer=animalById(saved.outer),inner=animalById(saved.inner);
  const profiles=depth.profiles as Record<string,typeof depth.profiles.koala>;
  const patterns=depth.patterns as Record<string,typeof depth.patterns.unlock>;
  const insightMap=depth.insights as Record<string,typeof depth.insights.listening_space>;
  const outside=profiles[outer.id],inside=profiles[inner.id],pattern=patterns[report.contrast_pattern];
  const scenes=new Set(questions.map(q=>q.scene));
  const insights=[...new Set(saved.insightIds??[])].filter(id=>Boolean(insightMap[id])).slice(0,3).map(id=>({...insightMap[id],contexts:(saved.insightContexts?.[id]??[]).filter(scene=>scenes.has(scene)).slice(0,2)}));
  const sections=[
    {title:`别人先见到的你 · ${outer.name}`,paragraphs:[outer.summary,outside.outer]},
    {title:`熟悉以后，你更合心意的样子 · ${inner.name}`,paragraphs:[inner.summary,inside.inner]},
    {title:"这份反差，可能发生在这里",paragraphs:[pattern.reading,`你可能想说：“${inside.thought.replaceAll('“','').replaceAll('”','')}”`]},
    {title:"别人容易误读你的地方",paragraphs:[pattern.misread]},
    ...(insights.length?[{title:`从这次选择里，看到的${insights.length}个细节`,paragraphs:insights.flatMap(item=>[`${item.title}。${item.contexts.length?`你在${item.contexts.map(scene=>`「${scene}」`).join('、')}这些片段里的选择，提供了这条线索。`:''}${item.reading}`,`可以试试：${item.advice}`])}]:[]),
    {title:"你带进关系里的优点",paragraphs:[...new Set(report.strengths),...report.possible_scenes.map(s=>`${s.mode}里，你可能熟悉这样的片段：${s.text}`)]},
    {title:"熟悉的关系里，怎样相处更省心",paragraphs:[inside.relation,pattern.relationship]},
    {title:"一起做事时，给自己的提醒",paragraphs:[outside.work,pattern.work]},
    {title:"把没说出口的话，换成一句能用的表达",paragraphs:[`表达自己的首选：“${inner.useful_phrase}”`,"想保留时间时：“我愿意参与，这次可以到九点，之后的时间留给自己。”","想得到具体回应时：“这件事我挺想和你聊，等你方便时，能听我讲完整吗？”"]},
    {title:"这周可以做的3个小练习",paragraphs:[`先练一个小动作：${inside.practice}`,`再观察一次切换：${pattern.practice}`,"最后回看一次：这次答应或拒绝，是否合自己的心意？对方收到的信号，和你原本想表达的是否接近？先观察，不必给自己打分。"]},
    {title:"学到一点，读懂这份反差",paragraphs:[report.learn_something,...report.theory_refs.map(id=>theoryNotes[id].text),"日常表现和放松偏好都属于你。这份结果适合帮助你发现相处条件和表达习惯，不用来判断哪一面更真实，也不能推断这些习惯的成因。"]},
    {title:"给朋友的相处说明",paragraphs:[report.relationship_guide,inside.thought,"如果想更了解我，可以问：“你这次最想要什么？有没有一段时间或一个选择，想留给自己？”具体问一次，比只靠动物标签猜更清楚。"]},
    {title:"最后，有一句话想留给你",paragraphs:[inside.permission]},
  ];return {report,outer,inner,sections,resonance:pattern.resonance};
}
export const resultNotice="本测试依据你的自我描述生成趣味画像。动物与分类区间为原创表达，相关理论用于帮助理解，不用于心理诊断。";
