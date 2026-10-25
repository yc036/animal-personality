import {AnswerError,scoreAnswers,questionnaireVersion} from '../_shared/assessment.ts';

type Env={SUPABASE_URL:string;SUPABASE_SERVICE_ROLE_KEY:string;ADMIN_EMAIL:string;ALLOWED_ORIGINS:string;RATE_LIMIT_SALT:string};
type Runtime={env:Env;fetch?:typeof fetch};
class HttpError extends Error{constructor(public status:number,message:string,public extra:Record<string,unknown>={}){super(message);}}
const hex=(bytes:Uint8Array)=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
const randomToken=(length=16)=>hex(crypto.getRandomValues(new Uint8Array(length)));
const sha=async(text:string)=>hex(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))));
const idValid=(id:unknown):id is string=>typeof id==='string'&&/^[a-f0-9]{32}$/.test(id);
const dbErrors:Record<string,[number,string]>={SESSION_EXPIRED:[401,'登录状态已过期，请重新输入测试密码。'],ACCESS_INVALID:[403,'密码不正确或已停用，请核对店铺提供的密码。'],QUOTA_EXHAUSTED:[403,'这个密码的3次机会已用完，或密码已停用。已有报告仍可查看。'],ATTEMPT_FORBIDDEN:[403,'这份进度不属于当前密码，请回首页重新开始。'],RESULT_NOT_FOUND:[404,'这份报告没有找到，请检查结果链接。']};

// Exported to exercise the real HTTP handler against PostgreSQL in integration tests.
export function createHandler(runtime:Runtime){
  const {env}=runtime,fetcher=runtime.fetch??fetch;
  async function db(path:string,method='POST',payload?:unknown){
    const response=await fetcher(`${env.SUPABASE_URL}/rest/v1/${path}`,{method,headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:`Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,'Content-Type':'application/json',Prefer:'return=representation'},...(payload===undefined?{}:{body:JSON.stringify(payload)})});
    const data=await response.json().catch(()=>null);
    if(!response.ok){for(const [key,[status,message]]of Object.entries(dbErrors))if(data?.message?.includes(key))throw new HttpError(status,message);console.error('Database request failed',response.status,data?.code);throw new HttpError(503,'测评服务暂时不可用，请稍后重试。');}
    return data;
  }
  const rpc=(name:string,input:Record<string,unknown>)=>db(`rpc/${name}`,'POST',input);
  async function parseBody(request:Request){
    if(Number(request.headers.get('content-length')||0)>50000)throw new HttpError(413,'提交内容过长。');
    if(!request.headers.get('content-type')?.startsWith('application/json'))throw new HttpError(415,'请提交JSON数据。');
    const reader=request.body?.getReader();if(!reader)throw new HttpError(400,'没有收到提交内容。');
    const chunks:Uint8Array[]=[];let length=0;
    while(true){const {value,done}=await reader.read();if(done)break;length+=value.length;if(length>50000){await reader.cancel();throw new HttpError(413,'提交内容过长。');}chunks.push(value);}
    const bytes=new Uint8Array(length);let pos=0;for(const chunk of chunks){bytes.set(chunk,pos);pos+=chunk.length;}
    let value;try{value=JSON.parse(new TextDecoder().decode(bytes));}catch{throw new HttpError(400,'提交数据格式不正确。');}
    if(!value||typeof value!=='object'||Array.isArray(value))throw new HttpError(400,'提交数据格式不正确。');return value;
  }
  async function admin(request:Request){
    const auth=request.headers.get('authorization');if(!auth?.startsWith('Bearer '))throw new HttpError(401,'请先登录管理员账户。');
    // Never trust a decoded JWT or an email supplied by the browser.
    const response=await fetcher(`${env.SUPABASE_URL}/auth/v1/user`,{headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:auth}});
    const user=await response.json().catch(()=>null);
    if(!response.ok||!user?.id)throw new HttpError(401,'登录已过期，请重新登录管理员账户。');
    if(!user.email_confirmed_at||String(user.email).toLowerCase()!==env.ADMIN_EMAIL.toLowerCase())throw new HttpError(403,'当前账户没有密码管理权限。');
  }
  return async function handler(request:Request):Promise<Response>{
    const origin=request.headers.get('origin')||'',allowed=env.ALLOWED_ORIGINS.split(',').map(s=>s.trim()).filter(Boolean);
    const headers=new Headers({'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Vary':'Origin'});
    const reply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers});
    if(origin&&allowed.includes(origin)){headers.set('Access-Control-Allow-Origin',origin);headers.set('Access-Control-Allow-Methods','GET,POST,PATCH,OPTIONS');headers.set('Access-Control-Allow-Headers','Content-Type,Authorization,apikey,x-animal-session');headers.set('Access-Control-Max-Age','600');}
    if(origin&&!allowed.includes(origin))return reply({error:'当前网站地址未被允许访问测评服务。'},403);
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
    try{
      if(!env.SUPABASE_URL||!env.SUPABASE_SERVICE_ROLE_KEY||!env.ADMIN_EMAIL||!env.RATE_LIMIT_SALT||!allowed.length)throw new HttpError(503,'网站服务尚未配置完成。');
      const url=new URL(request.url),path=url.pathname.replace(/^.*\/animal-api/,'');
      const sessionToken=request.headers.get('x-animal-session')||'';
      const sessionHash=/^[a-f0-9]{48}$/.test(sessionToken)?await sha(sessionToken):'';
      if(path==='/health'&&request.method==='GET'){await rpc('animal_now',{});return reply({ok:true,questionnaireVersion});}
      if(path==='/access'&&request.method==='GET'){if(!sessionHash)throw new HttpError(401,'请先输入测试密码。');return reply(await rpc('animal_access',{p_session_hash:sessionHash}));}
      if(path==='/access'&&request.method==='POST'){
        // Supabase's gateway supplies the client address; the salted digest is the only value stored.
        const ip=request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()||'unknown';
        const limitKey=await sha(`${env.RATE_LIMIT_SALT}:access:${ip}`);
        if(!await rpc('animal_rate_limit',{p_key:limitKey,p_limit:20,p_window:900}))throw new HttpError(429,'尝试次数较多，请15分钟后再试。');
        const input=await parseBody(request),code=typeof input.code==='string'?input.code.trim().toUpperCase():'';
        if(!/^[A-Z0-9-]{6,40}$/.test(code))throw new HttpError(400,'请输入店铺提供的完整测试密码。');
        const token=randomToken(24),result=await rpc('animal_login',{p_code_hash:await sha(code),p_token_hash:await sha(token)});
        return reply({...result,sessionToken:token});
      }
      if(path==='/attempt/start'&&request.method==='POST'){
        if(!sessionHash)throw new HttpError(401,'请先输入测试密码。');
        return reply({...await rpc('animal_start',{p_session_hash:sessionHash,p_attempt_id:randomToken()}),questionnaireVersion});
      }
      if(path==='/attempt/submit'&&request.method==='POST'){
        if(!sessionHash)throw new HttpError(401,'请先输入测试密码。');
        const input=await parseBody(request);if(!idValid(input.attemptId))throw new HttpError(400,'答题进度有误，请回首页重新开始。');
        if(input.questionnaireVersion!==questionnaireVersion)throw new HttpError(409,'题目已升级，请回首页重新开始。未生成报告不会扣次数。',{restartRequired:true});
        let scored;try{scored=scoreAnswers(input.answers);}catch(e){if(e instanceof AnswerError)throw new HttpError(400,e.message,{questionIds:e.questionIds});throw e;}
        const report={id:randomToken(),resultKey:scored.resultKey,outer:scored.outer,inner:scored.inner,soft:scored.soft,createdAt:Date.now(),insightIds:scored.insightIds,insightContexts:scored.insightContexts,questionnaireVersion};
        return reply(await rpc('animal_submit',{p_session_hash:sessionHash,p_attempt_id:input.attemptId,p_report:report,p_answers:input.answers}));
      }
      if(path.startsWith('/results/')&&request.method==='GET'){
        const id=path.slice('/results/'.length);if(!idValid(id))throw new HttpError(404,'结果链接不完整。');
        return reply(await rpc('animal_result',{p_id:id,p_session_hash:sessionHash}));
      }
      if(path==='/admin/codes'){
        await admin(request);
        if(request.method==='GET'){
          const codes=await db('access_codes?select=id,hint,label,used,max_uses,enabled,created_at&order=created_at.desc&limit=200','GET');
          return reply({codes:codes.map((c:any)=>({id:c.id,hint:c.hint,label:c.label,used:c.used,maxUses:c.max_uses,enabled:c.enabled?1:0,createdAt:Number(c.created_at)}))});
        }
        if(request.method==='POST'){
          const input=await parseBody(request),count=Number(input.count),label=typeof input.label==='string'?input.label.trim().slice(0,80):'';
          if(!Number.isInteger(count)||count<1||count>100)throw new HttpError(400,'一次可生成1至100个密码。');
          const alphabet='23456789ABCDEFGHJKMNPQRSTUVWXYZ',codes=[];
          for(let i=0;i<count;i++){let letters='';while(letters.length<10){for(const n of crypto.getRandomValues(new Uint8Array(24))){if(n<Math.floor(256/alphabet.length)*alphabet.length)letters+=alphabet[n%alphabet.length];if(letters.length===10)break;}}codes.push(`AN-${letters.slice(0,5)}-${letters.slice(5)}`);}
          await db('access_codes','POST',await Promise.all(codes.map(async code=>({id:randomToken(),code_hash:await sha(code),hint:code.slice(-4),label,max_uses:3,used:0,enabled:true,created_at:Date.now()}))));
          return reply({codes:codes.map(code=>({code,maxUses:3,label}))});
        }
        if(request.method==='PATCH'){
          const input=await parseBody(request);if(!idValid(input.id)||typeof input.enabled!=='boolean')throw new HttpError(400,'操作参数不正确。');
          const rows=await db(`access_codes?id=eq.${input.id}`,'PATCH',{enabled:input.enabled});if(!rows.length)throw new HttpError(404,'密码记录不存在。');
          return reply({ok:true});
        }
      }
      throw new HttpError(404,'接口不存在。');
    }catch(e){if(e instanceof HttpError)return reply({error:e.message,...e.extra},e.status);console.error('Unhandled API failure',e instanceof Error?e.name:'unknown');return reply({error:'服务暂时不可用，请稍后重试。'},500);}
  };
}
// No Deno globals are accessed when the module is imported by Node tests.
const deno=(globalThis as any).Deno;
if(deno?.serve){const names=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','ADMIN_EMAIL','ALLOWED_ORIGINS','RATE_LIMIT_SALT'];deno.serve(createHandler({env:Object.fromEntries(names.map(name=>[name,deno.env.get(name)||''])) as Env}));}
