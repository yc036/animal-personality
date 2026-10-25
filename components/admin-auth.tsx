import {useEffect,useState,type ReactNode} from 'react';
import {supabase} from '../lib/client';
export default function AdminAuth({children}:{children:ReactNode}){
  const [ready,setReady]=useState(false),[signed,setSigned]=useState(false),[email,setEmail]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  useEffect(()=>{if(!supabase){setReady(true);return;}void supabase.auth.getSession().then(({data,error})=>{setSigned(Boolean(data.session));setReady(true);if(error)setMessage(error.message);});const {data}=supabase.auth.onAuthStateChange((_event,session)=>setSigned(Boolean(session)));return()=>data.subscription.unsubscribe();},[]);
  async function login(event:React.FormEvent){event.preventDefault();if(!supabase||busy)return;setBusy(true);setMessage('');const {error}=await supabase.auth.signInWithOtp({email:email.trim(),options:{shouldCreateUser:false,emailRedirectTo:`${location.origin}${location.pathname}`}});setMessage(error?'暂时无法发送登录邮件，请确认管理员邮箱已配置，稍后重试。':'登录邮件已发送，请在当前浏览器打开邮件中的登录链接。');setBusy(false);}
  if(!ready)return <main className="empty-state">正在确认登录状态…</main>;
  if(signed)return <><div style={{padding:'12px 24px',textAlign:'right'}}><button className="button secondary" onClick={()=>void supabase!.auth.signOut()}>退出管理账户</button></div>{children}</>;
  return <main className="admin-main"><a href="#/">← 返回测评网站</a><h1>店主管理后台</h1><p>使用已登记的管理员邮箱接收登录链接。顾客无需注册账户。</p><form className="access-form" onSubmit={login}><label htmlFor="admin-email">管理员邮箱</label><div className="password-field"><input id="admin-email" type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="输入管理员邮箱"/></div><button className="button primary start-button" disabled={busy||!supabase}>{busy?'正在发送…':'发送登录邮件'}</button></form><p role="status">{!supabase?'网站服务尚未配置完成。':message}</p></main>;
}
