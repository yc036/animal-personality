import {useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import AssessmentSite from './components/assessment-site';
import AdminPanel from './components/admin-panel';
import AdminAuth from './components/admin-auth';
import {supabase} from './lib/client';
import './styles/site.css';
import './styles/journey.css';
function App(){
  const [route,setRoute]=useState(location.hash.slice(1)||'/');
  useEffect(()=>{const change=()=>setRoute(location.hash.slice(1)||'/');window.addEventListener('hashchange',change);return()=>window.removeEventListener('hashchange',change);},[]);
  useEffect(()=>{if(!new URL(location.href).searchParams.has('code')||!supabase)return;void supabase.auth.getSession().then(({data,error})=>{if(!error&&data.session){history.replaceState(null,'',`${location.pathname}#/admin`);setRoute('/admin');}});},[]);
  if(route==='/admin')return <AdminAuth><AdminPanel/></AdminAuth>;
  const result=route.match(/^\/result\/([a-f0-9]{32})$/);
  if(route.startsWith('/result/')&&!result)return <main className="empty-state"><h1>结果链接不完整</h1><a className="button primary" href="#/">回到首页</a></main>;
  return <AssessmentSite key={result?.[1]||'home'} resultId={result?.[1]}/>;
}
createRoot(document.getElementById('root')!).render(<App/>);
