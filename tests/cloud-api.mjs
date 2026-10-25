// Live smoke test. Supply a temporary owner JWT through the process environment.
// Generates one real test code, spends its quota, and disables it after verification.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const base=process.env.TEST_SUPABASE_URL,key=process.env.TEST_SUPABASE_PUBLIC_KEY,jwt=process.env.TEST_ADMIN_JWT;
if(!base||!key||!jwt)throw Error('Set TEST_SUPABASE_URL, TEST_SUPABASE_PUBLIC_KEY, TEST_ADMIN_JWT in the process environment. Never paste tokens into chat.');
const assessment=JSON.parse(fs.readFileSync('data/assessment.json','utf8'));
async function api(path,{method='GET',body,token,admin=false}={}){
  const headers={'Content-Type':'application/json',apikey:key};if(token)headers['x-animal-session']=token;if(admin)headers.Authorization=`Bearer ${jwt}`;
  const response=await fetch(`${base}/functions/v1/animal-api${path}`,{method,headers,...(body?{body:JSON.stringify(body)}:{})});
  return {status:response.status,data:await response.json()};
}
assert.equal((await api('/health')).status,200);
assert.equal((await api('/admin/codes')).status,401);
const batch=await api('/admin/codes',{method:'POST',admin:true,body:{count:1,label:'上线验收专用：已消耗并停用'}});assert.equal(batch.status,200);
const code=batch.data.codes[0].code;let codeId;
try{
  const sessions=await Promise.all(Array.from({length:4},()=>api('/access',{method:'POST',body:{code}})));
  sessions.forEach(r=>assert.equal(r.status,200));
  const starts=await Promise.all(sessions.map(s=>api('/attempt/start',{method:'POST',token:s.data.sessionToken,body:{}})));
  starts.forEach(r=>assert.equal(r.status,200));
  const answers=Object.fromEntries(assessment.questions.map(q=>[q.id,q.options[0].id]));
  const submit=i=>api('/attempt/submit',{method:'POST',token:sessions[i].data.sessionToken,body:{attemptId:starts[i].data.attemptId,answers,questionnaireVersion:assessment.questionnaire_version}});
  const results=await Promise.all([0,1,2,3].map(submit));assert.deepEqual(results.map(r=>r.status).sort(),[200,200,200,403]);
  const winner=results.findIndex(r=>r.status===200),id=results[winner].data.resultId;
  assert.equal((await submit(winner)).data.resultId,id);
  const publicReport=await api(`/results/${id}`);assert.equal(publicReport.status,200);assert.equal(publicReport.data.own,false);assert.ok(!publicReport.data.insightContexts);assert.ok(!publicReport.data.answers_json);
  const own=await api(`/results/${id}`,{token:sessions[winner].data.sessionToken});assert.equal(own.data.own,true);assert.equal(own.data.remaining,0);
  console.log('PASS: live 4-session race, 3-use quota, idempotent retry, public report privacy, admin access');
}finally{
  const list=await api('/admin/codes',{admin:true});codeId=list.data.codes?.find(c=>c.label==='上线验收专用：已消耗并停用'&&c.hint===code.slice(-4))?.id;
  if(codeId)assert.equal((await api('/admin/codes',{method:'PATCH',admin:true,body:{id:codeId,enabled:false}})).status,200);
}
