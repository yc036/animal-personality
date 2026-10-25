import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {PGlite} from '@electric-sql/pglite';
test('legacy import retains password hashes, spent quota and result IDs in a single transaction',async()=>{
  const c='c'.repeat(32),a='a'.repeat(32),r='b'.repeat(32),s='d'.repeat(64),report={id:r,resultKey:'black_cat__golden_retriever',outer:'black_cat',inner:'golden_retriever',soft:false,createdAt:123};
  const snapshot={access_codes:[{id:c,code_hash:'e'.repeat(64),hint:'1234',label:"店铺'备注",max_uses:3,used:2,enabled:1,created_at:1}],access_sessions:[{token_hash:s,code_id:c,expires_at:1}],attempts:[{id:a,code_id:c,session_hash:s,status:'done',result_id:r,created_at:1}],results:[{id:r,attempt_id:a,code_id:c,report_json:JSON.stringify(report),answers_json:'{"Q01":"A"}',created_at:123}]};
  const run=spawnSync(process.execPath,['scripts/legacy-import.mjs'],{input:JSON.stringify(snapshot),encoding:'utf8'});assert.equal(run.status,0,run.stderr);
  const sql=fs.readFileSync('work/legacy-import.sql','utf8'),pg=new PGlite();
  await pg.exec('create role anon;create role authenticated;create role service_role;');await pg.exec(fs.readFileSync('supabase/migrations/202610250001_animal.sql','utf8'));await pg.exec(sql);
  const code=(await pg.query('select * from public.access_codes')).rows[0];assert.equal(code.used,2);assert.equal(code.code_hash,snapshot.access_codes[0].code_hash);assert.equal(code.label,"店铺'备注");
  const result=(await pg.query('select public.animal_result($1,$2) as report',[r,''])).rows[0].report;assert.equal(result.id,r);assert.equal(result.own,false);
  const attempt=(await pg.query('select result_id from public.attempts')).rows[0];assert.equal(attempt.result_id,r);
  await assert.rejects(pg.exec(sql),/duplicate key/);await pg.exec('rollback');assert.equal((await pg.query('select used from public.access_codes')).rows[0].used,2);
  await pg.close();
});
