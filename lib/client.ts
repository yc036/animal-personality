import {createClient} from '@supabase/supabase-js';
const url=import.meta.env.VITE_SUPABASE_URL as string|undefined;
const key=import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string|undefined;
export const configured=Boolean(url&&key&&url.startsWith('https://'));
export const supabase=configured?createClient(url!,key!,{auth:{flowType:'pkce',detectSessionInUrl:true,persistSession:true,autoRefreshToken:true}}):null;
const storageKey=`animal-access:${url??'unconfigured'}`;
let memoryToken='';
function token(){try{return localStorage.getItem(storageKey)||memoryToken;}catch{return memoryToken;}}
function saveToken(value:string){memoryToken=value;try{localStorage.setItem(storageKey,value);}catch{}}
export class ApiError extends Error{constructor(message:string,public status:number,public data:Record<string,unknown>){super(message);}}
export async function api<T>(path:string,options:RequestInit={}):Promise<T>{
  if(!configured)throw new ApiError('网站服务尚未配置完成，请稍后再试。',503,{});
  const headers=new Headers(options.headers);headers.set('Content-Type','application/json');headers.set('apikey',key!);
  const access=token();if(access)headers.set('x-animal-session',access);
  if(path.startsWith('/api/admin/')){const session=await supabase!.auth.getSession();if(session.data.session)headers.set('Authorization',`Bearer ${session.data.session.access_token}`);}
  let response:Response;
  try{response=await fetch(`${url}/functions/v1/animal-api${path.replace(/^\/api/,'')}`,{...options,headers,cache:'no-store',credentials:'omit'});}catch{throw new ApiError('暂时连接不上测评服务，请检查网络后重试。',0,{});}
  const data=await response.json().catch(()=>({error:'测评服务暂时不可用，请稍后重试。'})) as T&{error?:string;sessionToken?:string};
  if(!response.ok)throw new ApiError(data.error||'请求没有成功，请稍后重试。',response.status,data as Record<string,unknown>);
  if(data.sessionToken)saveToken(data.sessionToken);
  return data;
}
