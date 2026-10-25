import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildSync} from 'esbuild';
import {PGlite} from '@electric-sql/pglite';
const source=buildSync({entryPoints:['supabase/functions/animal-api/index.ts'],bundle:true,platform:'node',format:'cjs',write:false}).outputFiles[0].text;
const module={exports:{}};new Function('module','exports',source)(module,module.exports);
const {createHandler}=module.exports;
const assessment=JSON.parse(fs.readFileSync('data/assessment.json','utf8'));
const answers=Object.fromEntries(assessment.questions.map(q=>[q.id,q.options[0].id]));
const hash=async(s)=>Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))).toString('hex');

test('Supabase migration and real Edge handler preserve quotas, ownership, admin authorization and public privacy',async()=>{
  const pg=new PGlite();
  await pg.exec('create role anon; create role authenticated; create role service_role;');
  await pg.exec(fs.readFileSync('supabase/migrations/202610250001_animal.sql','utf8'));
  const databaseFetch=async(url,options={})=>{
    const u=new URL(url),body=options.body?JSON.parse(options.body):null;
    if(u.pathname==='/auth/v1/user'){
      const token=new Headers(options.headers).get('authorization');
      if(!['Bearer owner-jwt','Bearer outsider-jwt','Bearer unconfirmed-jwt'].includes(token))return Response.json({message:'invalid'},{status:401});
      return Response.json({id:'test-user',email:token==='Bearer outsider-jwt'?'other@example.com':'owner@example.com',email_confirmed_at:token==='Bearer unconfirmed-jwt'?null:'2026-01-01'});
    }
    try{
      let value;
      if(u.pathname.startsWith('/rest/v1/rpc/')){
        const name=u.pathname.split('/').at(-1);assert.match(name,/^animal_[a-z_]+$/);
        const params=Object.entries(body||{});params.forEach(([key])=>assert.match(key,/^p_[a-z_]+$/));
        const result=await pg.query(`select public.${name}(${params.map(([key],i)=>`${key} => $${i+1}`).join(',')}) as value`,params.map(([,v])=>typeof v==='object'?JSON.stringify(v):v));value=result.rows[0].value;
      }else if(u.pathname==='/rest/v1/access_codes'){
        if(options.method==='GET')value=(await pg.query('select id,hint,label,used,max_uses,enabled,created_at from public.access_codes order by created_at desc limit 200')).rows;
        else if(options.method==='PATCH')value=(await pg.query('update public.access_codes set enabled=$1 where id=$2 returning id',[body.enabled,u.searchParams.get('id').slice(3)])).rows;
        else{for(const c of body)await pg.query('insert into public.access_codes(id,code_hash,hint,label,max_uses,used,enabled,created_at) values($1,$2,$3,$4,$5,$6,$7,$8)',[c.id,c.code_hash,c.hint,c.label,c.max_uses,c.used,c.enabled,c.created_at]);value=[];}
      }else throw Error('unexpected database route');
      return Response.json(value);
    }catch(e){return Response.json({message:e.message,code:e.code},{status:400});}
  };
  const env={SUPABASE_URL:'https://test.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'server-only',ADMIN_EMAIL:'owner@example.com',ALLOWED_ORIGINS:'https://quiz.example.com',RATE_LIMIT_SALT:'integration-only-salt'};
  const handler=createHandler({env,fetch:databaseFetch});
  let address=0;
  async function request(path,{method='GET',body,token,admin,origin='https://quiz.example.com',ip}={}){
    const headers={'Content-Type':'application/json',Origin:origin,'x-forwarded-for':ip||`192.0.2.${++address}`};
    if(token)headers['x-animal-session']=token;if(admin)headers.Authorization=`Bearer ${admin}`;
    const response=await handler(new Request(`https://test.supabase.co/functions/v1/animal-api${path}`,{method,headers,...(body===undefined?{}:{body:JSON.stringify(body)})}));
    return {status:response.status,data:response.status===204?null:await response.json(),headers:response.headers};
  }
  assert.equal((await request('/health')).status,200);
  assert.equal((await request('/health',{origin:'https://untrusted.example.com'})).status,403);
  assert.equal((await request('/access',{method:'OPTIONS'})).status,204);
  assert.equal((await request('/admin/codes')).status,401);
  assert.equal((await request('/admin/codes',{admin:'forged'})).status,401);
  assert.equal((await request('/admin/codes',{admin:'outsider-jwt'})).status,403);
  assert.equal((await request('/admin/codes',{admin:'unconfirmed-jwt'})).status,403);
  const generated=await request('/admin/codes',{method:'POST',admin:'owner-jwt',body:{count:3,label:'integration fixture'}});
  assert.equal(generated.status,200);assert.equal(generated.data.codes.length,3);
  const code=generated.data.codes[0].code;
  const stored=(await pg.query('select * from public.access_codes where code_hash=$1',[await hash(code)])).rows[0];
  assert.ok(stored);assert.ok(!JSON.stringify(stored).includes(code));
  const sessions=await Promise.all(Array.from({length:4},()=>request('/access',{method:'POST',body:{code}})));
  sessions.forEach(r=>{assert.equal(r.status,200);assert.equal(r.data.remaining,3);assert.match(r.data.sessionToken,/^[a-f0-9]{48}$/);});
  const starts=await Promise.all(sessions.map(s=>request('/attempt/start',{method:'POST',token:s.data.sessionToken,body:{}})));
  const ownerToken=sessions[0].data.sessionToken;
  assert.equal((await request('/attempt/start',{method:'POST',token:ownerToken,body:{}})).data.attemptId,starts[0].data.attemptId);
  assert.equal((await request('/attempt/submit',{method:'POST',token:ownerToken,body:{attemptId:starts[0].data.attemptId,answers,questionnaireVersion:'old-version'}})).status,409);
  assert.equal((await request('/attempt/submit',{method:'POST',token:ownerToken,body:{attemptId:starts[0].data.attemptId,answers:{},questionnaireVersion:assessment.questionnaire_version}})).status,400);
  const submit=(i)=>request('/attempt/submit',{method:'POST',token:sessions[i].data.sessionToken,body:{attemptId:starts[i].data.attemptId,answers,questionnaireVersion:assessment.questionnaire_version}});
  const completed=await Promise.all([0,1,2,3].map(submit));
  assert.deepEqual(completed.map(r=>r.status).sort(),[200,200,200,403]);
  const winner=completed.findIndex(r=>r.status===200),rid=completed[winner].data.resultId;
  const replay=await Promise.all([submit(winner),submit(winner)]);replay.forEach(r=>assert.equal(r.data.resultId,rid));
  assert.equal((await pg.query('select used from public.access_codes where id=$1',[stored.id])).rows[0].used,3);
  assert.equal((await pg.query('select count(*)::int as count from public.results')).rows[0].count,3);
  const publicReport=await request(`/results/${rid}`),ownReport=await request(`/results/${rid}`,{token:sessions[winner].data.sessionToken});
  assert.equal(publicReport.data.own,false);assert.ok(!('answers' in publicReport.data));assert.ok(!('answers_json' in publicReport.data));assert.ok(!('insightContexts' in publicReport.data));assert.ok(!('remaining' in publicReport.data));
  assert.equal(ownReport.data.own,true);assert.equal(ownReport.data.remaining,0);assert.ok(ownReport.data.insightContexts);
  assert.equal((await request(`/results/${rid}`,{token:sessions[3-winner].data.sessionToken})).data.own,false);
  assert.equal((await request('/results/not-a-result')).status,404);
  const other=await request('/access',{method:'POST',body:{code:generated.data.codes[1].code}});
  assert.equal((await request('/attempt/submit',{method:'POST',token:other.data.sessionToken,body:{attemptId:starts[winner].data.attemptId,answers,questionnaireVersion:assessment.questionnaire_version}})).status,403);
  const otherHash=await hash(generated.data.codes[1].code),otherCode=(await pg.query('select id from public.access_codes where code_hash=$1',[otherHash])).rows[0].id;
  assert.equal((await request('/admin/codes',{method:'PATCH',admin:'owner-jwt',body:{id:otherCode,enabled:false}})).status,200);
  assert.equal((await request('/attempt/start',{method:'POST',token:other.data.sessionToken,body:{}})).status,403);
  await pg.query('update public.access_sessions set expires_at=0 where token_hash=$1',[await hash(other.data.sessionToken)]);
  assert.equal((await request('/access',{token:other.data.sessionToken})).status,401);
  const listed=await request('/admin/codes',{admin:'owner-jwt'});assert.equal(listed.status,200);assert.ok(!JSON.stringify(listed.data).includes('code_hash'));
  for(let i=0;i<20;i++)assert.equal((await request('/access',{method:'POST',body:{code:'BADBAD'},ip:'198.51.100.1'})).status,403);
  assert.equal((await request('/access',{method:'POST',body:{code:'BADBAD'},ip:'198.51.100.1'})).status,429);
  await pg.exec('set role anon');
  await assert.rejects(pg.query('select * from public.access_codes'),/permission denied/);
  await assert.rejects(pg.query('select public.animal_result($1,$2)',[rid,'']),/permission denied/);
  await pg.exec('reset role; set role authenticated');
  await assert.rejects(pg.query('select * from public.results'),/permission denied/);
  await pg.exec('reset role');
  await pg.close();
});

test('Edge scoring source is generated from the exact frontend questionnaire',()=>{
  assert.equal(fs.readFileSync('supabase/functions/_shared/assessment.json','utf8'),fs.readFileSync('data/assessment.json','utf8'));
  assert.equal(fs.readFileSync('supabase/functions/_shared/assessment.ts','utf8'),fs.readFileSync('lib/assessment.ts','utf8').replace('"../data/assessment.json"','"./assessment.json" with { type: "json" }'));
});
