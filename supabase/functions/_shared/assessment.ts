import raw from "./assessment.json" with { type: "json" };

export const assessment = raw;
export const animals = raw.animals;
export const questions = raw.questions;
export const questionnaireVersion = raw.questionnaire_version;
export const journey = raw.journey;
export type Animal = typeof animals[number];
export type Report = typeof raw.results[number];
export type Answers = Record<string, string>;
export function animalById(id: string): Animal {
  const animal = animals.find(a => a.id === id);
  if (!animal) throw new Error("未知动物");
  return animal;
}
export function reportById(id: string): Report {
  const report = raw.results.find(r => r.id === id);
  if (!report) throw new Error("未知结果");
  return report;
}
export class AnswerError extends Error {
  constructor(message: string, public questionIds: string[] = []) { super(message); }
}
export function scoreAnswers(answers: Answers) {
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) throw new AnswerError("请先完成答题。");
  if (Object.keys(answers).some(key => !questions.some(q => q.id === key))) throw new AnswerError("答题数据有误，请刷新后重试。");
  const values: Record<string, number[]> = { OE: [], OA: [], IE: [], IA: [] };
  const insightCounts = new Map<string,{count:number;first:number}>();
  const insightScenes = new Map<string,string[]>();
  for (const q of questions) {
    const answer = answers[q.id];
    if (!answer) throw new AnswerError("还有题目没有回答。", [q.id]);
    if (answer === "X") continue;
    const option = q.options.find(o => o.id === answer);
    if (!option) throw new AnswerError("选项有误，请重新选择。", [q.id]);
    values[q.dimension].push(option.score);
    if(option.insightId){const previous=insightCounts.get(option.insightId);insightCounts.set(option.insightId,{count:(previous?.count??0)+1,first:previous?.first??insightCounts.size});insightScenes.set(option.insightId,[...(insightScenes.get(option.insightId)??[]),q.scene]);}
  }
  const dimensions: Record<string, { mean: number; count: number; band: number; soft: boolean }> = {};
  for (const [dim, scores] of Object.entries(values)) {
    if (scores.length < 4) throw new AnswerError("有一组题目跳过较多，请补充几道有相近经历的题目，再生成报告。", questions.filter(q => q.dimension === dim && answers[q.id] === "X").map(q => q.id));
    const mean = scores.reduce((s, n) => s + n, 0) / scores.length;
    const cuts = dim.endsWith("E") ? [1, 2] : [.75, 1.5, 2.25];
    const band = cuts.filter(c => mean > c + 1e-10).length;
    dimensions[dim] = { mean, count: scores.length, band, soft: scores.length === 4 || cuts.some(c => Math.abs(mean - c) <= 1 / 6 + 1e-10) };
  }
  const lookup = (e: string, a: string) => animals.find(animal => animal.expression_band === dimensions[e].band && animal.assertion_band === dimensions[a].band)!;
  const outer = lookup("OE", "OA"), inner = lookup("IE", "IA");
  const groups:Record<string,string>={listening_space:"outer",selective_entry:"outer",active_open:"outer",quiet_company:"inner",light_reply:"inner",familiar_share:"inner"};
  const ranked=[...insightCounts.entries()].sort((a,b)=>b[1].count-a[1].count||a[1].first-b[1].first);
  const usedGroups=new Set<string>(),insightIds:string[]=[];
  for(const [id]of ranked){const group=groups[id]??"choice";if(!usedGroups.has(group)){usedGroups.add(group);insightIds.push(id);}if(insightIds.length===3)break;}
  return { resultKey: `${outer.id}__${inner.id}`, outer: outer.id, inner: inner.id,
    soft: Object.values(dimensions).some(d => d.soft), dimensions,insightIds,insightContexts:Object.fromEntries(insightIds.map(id=>[id,(insightScenes.get(id)??[]).slice(0,2)])),questionnaireVersion };
}
export type SavedResult = { id: string; resultKey: string; outer: string; inner: string; soft: boolean; createdAt: number; own?: boolean; remaining?: number;insightIds?:string[];insightContexts?:Record<string,string[]>;questionnaireVersion?:string };
