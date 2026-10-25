-- All application data is server-only. Public result reads go through the Edge Function.
create table public.access_codes (
  id text primary key check (id ~ '^[a-f0-9]{32}$'),
  code_hash text not null unique check (length(code_hash)=64),
  hint text not null, label text not null default '',
  max_uses integer not null default 3 check (max_uses=3),
  used integer not null default 0 check (used between 0 and max_uses),
  enabled boolean not null default true,
  created_at bigint not null
);
create table public.access_sessions (
  token_hash text primary key check (length(token_hash)=64),
  code_id text not null references public.access_codes(id), expires_at bigint not null
);
create table public.attempts (
  id text primary key check (id ~ '^[a-f0-9]{32}$'),
  code_id text not null references public.access_codes(id),
  session_hash text not null references public.access_sessions(token_hash),
  status text not null default 'active' check (status in ('active','done')),
  result_id text, created_at bigint not null
);
create unique index one_active_per_session on public.attempts(session_hash) where status='active';
create table public.results (
  id text primary key check (id ~ '^[a-f0-9]{32}$'),
  attempt_id text not null unique references public.attempts(id),
  code_id text not null references public.access_codes(id),
  report_json jsonb not null, answers_json jsonb not null, created_at bigint not null
);
alter table public.attempts add constraint attempt_result_fk foreign key(result_id) references public.results(id);
create table public.rate_limits (key text primary key,hits integer not null,expires_at bigint not null);
create index session_expiry on public.access_sessions(expires_at);
create index rate_expiry on public.rate_limits(expires_at);
create index code_newest on public.access_codes(created_at desc);
alter table public.access_codes enable row level security;
alter table public.access_sessions enable row level security;
alter table public.attempts enable row level security;
alter table public.results enable row level security;
alter table public.rate_limits enable row level security;
revoke all on public.access_codes,public.access_sessions,public.attempts,public.results,public.rate_limits from anon,authenticated;
grant all on public.access_codes,public.access_sessions,public.attempts,public.results,public.rate_limits to service_role;

create function public.animal_now() returns bigint language sql stable set search_path='' as $$
  select floor(extract(epoch from now())*1000)::bigint
$$;

create function public.animal_rate_limit(p_key text,p_limit integer,p_window integer) returns boolean
language plpgsql set search_path='' as $$
declare n bigint:=public.animal_now(); h integer;
begin
  insert into public.rate_limits(key,hits,expires_at) values(p_key,1,n+p_window*1000::bigint)
  on conflict(key) do update set hits=case when public.rate_limits.expires_at<=n then 1 else public.rate_limits.hits+1 end,
    expires_at=case when public.rate_limits.expires_at<=n then n+p_window*1000::bigint else public.rate_limits.expires_at end
  returning hits into h;
  -- Periodic bounded-size operational data cleanup; sessions with attempt references are retained.
  if random()<0.02 then delete from public.rate_limits where expires_at<n; end if;
  return h<=p_limit;
end $$;

create function public.animal_login(p_code_hash text,p_token_hash text) returns jsonb
language plpgsql set search_path='' as $$
declare c public.access_codes; n bigint:=public.animal_now();
begin
  select * into c from public.access_codes where code_hash=p_code_hash;
  if not found or not c.enabled then raise exception 'ACCESS_INVALID'; end if;
  if c.used>=c.max_uses then raise exception 'QUOTA_EXHAUSTED'; end if;
  insert into public.access_sessions(token_hash,code_id,expires_at) values(p_token_hash,c.id,n+604800000);
  return jsonb_build_object('remaining',c.max_uses-c.used,'hint',c.hint);
end $$;

create function public.animal_access(p_session_hash text) returns jsonb
language plpgsql set search_path='' as $$
declare c public.access_codes;
begin
  select ac.* into c from public.access_sessions s join public.access_codes ac on ac.id=s.code_id
    where s.token_hash=p_session_hash and s.expires_at>public.animal_now();
  if not found then raise exception 'SESSION_EXPIRED'; end if;
  return jsonb_build_object('remaining',c.max_uses-c.used,'hint',c.hint);
end $$;

create function public.animal_start(p_session_hash text,p_attempt_id text) returns jsonb
language plpgsql set search_path='' as $$
declare c public.access_codes; aid text; cid text;
begin
  select s.code_id into cid from public.access_sessions s where s.token_hash=p_session_hash and s.expires_at>public.animal_now();
  if not found then raise exception 'SESSION_EXPIRED'; end if;
  -- A single per-code lock serializes start/submit across every browser session.
  select * into c from public.access_codes where id=cid for update;
  if not c.enabled or c.used>=c.max_uses then raise exception 'QUOTA_EXHAUSTED'; end if;
  select id into aid from public.attempts where session_hash=p_session_hash and status='active';
  if aid is null then
    aid:=p_attempt_id;
    insert into public.attempts(id,code_id,session_hash,created_at) values(aid,c.id,p_session_hash,public.animal_now());
  end if;
  return jsonb_build_object('attemptId',aid,'remaining',c.max_uses-c.used);
end $$;

create function public.animal_submit(p_session_hash text,p_attempt_id text,p_report jsonb,p_answers jsonb) returns jsonb
language plpgsql set search_path='' as $$
declare c public.access_codes; a public.attempts; cid text; rid text:=p_report->>'id';
begin
  select code_id into cid from public.access_sessions where token_hash=p_session_hash and expires_at>public.animal_now();
  if not found then raise exception 'SESSION_EXPIRED'; end if;
  select * into c from public.access_codes where id=cid for update;
  select * into a from public.attempts where id=p_attempt_id and session_hash=p_session_hash and code_id=cid for update;
  if not found then raise exception 'ATTEMPT_FORBIDDEN'; end if;
  -- Retry after a successful commit always returns the original ID without charging.
  if a.result_id is not null then return jsonb_build_object('resultId',a.result_id); end if;
  if not c.enabled or c.used>=c.max_uses then raise exception 'QUOTA_EXHAUSTED'; end if;
  if a.status<>'active' then raise exception 'ATTEMPT_FORBIDDEN'; end if;
  insert into public.results(id,attempt_id,code_id,report_json,answers_json,created_at)
    values(rid,a.id,c.id,p_report,p_answers,(p_report->>'createdAt')::bigint);
  update public.access_codes set used=used+1 where id=c.id;
  update public.attempts set status='done',result_id=rid where id=a.id;
  return jsonb_build_object('resultId',rid);
end $$;

create function public.animal_result(p_id text,p_session_hash text) returns jsonb
language plpgsql set search_path='' as $$
declare r public.results; a public.attempts; c public.access_codes; is_owner boolean; report jsonb;
begin
  select * into r from public.results where id=p_id;
  if not found then raise exception 'RESULT_NOT_FOUND'; end if;
  select * into a from public.attempts where id=r.attempt_id;
  is_owner:=exists(select 1 from public.access_sessions where token_hash=p_session_hash and token_hash=a.session_hash and expires_at>public.animal_now());
  report:=r.report_json||jsonb_build_object('own',is_owner);
  if is_owner then
    select * into c from public.access_codes where id=r.code_id;
    report:=report||jsonb_build_object('remaining',c.max_uses-c.used);
  else report:=report-'insightContexts';
  end if;
  return report;
end $$;

-- Postgres grants function EXECUTE to PUBLIC by default: explicitly remove that access.
revoke all on function public.animal_now() from public,anon,authenticated;
revoke all on function public.animal_rate_limit(text,integer,integer) from public,anon,authenticated;
revoke all on function public.animal_login(text,text) from public,anon,authenticated;
revoke all on function public.animal_access(text) from public,anon,authenticated;
revoke all on function public.animal_start(text,text) from public,anon,authenticated;
revoke all on function public.animal_submit(text,text,jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.animal_result(text,text) from public,anon,authenticated;
grant execute on function public.animal_now(),public.animal_rate_limit(text,integer,integer),public.animal_login(text,text),public.animal_access(text),public.animal_start(text,text),public.animal_submit(text,text,jsonb,jsonb),public.animal_result(text,text) to service_role;
