// Generate a private transaction from a COMPLETE Sites database export.
// Read JSON from stdin, never place customer data or hashes in command arguments.
// Input: {access_codes:[],access_sessions:[],attempts:[],results:[]}.
import fs from 'node:fs';
import path from 'node:path';
const input=JSON.parse(fs.readFileSync(0,'utf8'));
const tables=['access_codes','access_sessions','attempts','results'];
for(const table of tables)if(!Array.isArray(input[table]))throw Error(`Missing complete table: ${table}`);
const literal=value=>value==null?'NULL':typeof value==='boolean'?(value?'TRUE':'FALSE'):typeof value==='number'?(Number.isSafeInteger(value)?String(value):(()=>{throw Error('Unsafe numeric value');})()):`'${String(value).replaceAll("'","''")}'`;
const json=value=>literal(JSON.stringify(typeof value==='string'?JSON.parse(value):value))+'::jsonb';
const sql=['-- PRIVATE customer export. Do not commit or upload to a public repository.','begin;'];
for(const c of input.access_codes){if(c.max_uses!==3||c.used<0||c.used>3)throw Error('Invalid source quota');sql.push(`insert into public.access_codes(id,code_hash,hint,label,max_uses,used,enabled,created_at) values (${[c.id,c.code_hash,c.hint,c.label,3,c.used,Boolean(c.enabled),c.created_at].map(literal).join(',')});`);}
for(const s of input.access_sessions)sql.push(`insert into public.access_sessions(token_hash,code_id,expires_at) values (${[s.token_hash,s.code_id,s.expires_at].map(literal).join(',')});`);
for(const a of input.attempts)sql.push(`insert into public.attempts(id,code_id,session_hash,status,result_id,created_at) values (${[a.id,a.code_id,a.session_hash,a.status,null,a.created_at].map(literal).join(',')});`);
for(const r of input.results)sql.push(`insert into public.results(id,attempt_id,code_id,report_json,answers_json,created_at) values (${[literal(r.id),literal(r.attempt_id),literal(r.code_id),json(r.report_json),json(r.answers_json),literal(r.created_at)].join(',')});`);
for(const a of input.attempts)if(a.result_id)sql.push(`update public.attempts set result_id=${literal(a.result_id)} where id=${literal(a.id)};`);
sql.push('commit;');
const target=path.resolve('work/legacy-import.sql');fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,sql.join('\n')+'\n',{mode:0o600});
console.log(JSON.stringify({file:target,counts:Object.fromEntries(tables.map(t=>[t,input[t].length]))}));
