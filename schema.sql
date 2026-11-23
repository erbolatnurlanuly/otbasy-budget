-- Отбасылық бюджет: екі (немесе одан көп) аккаунт бір отбасы бюджетін бөліседі.
-- Ортақ деректер: docs (family_id бойынша). Жеке деректер: private_docs (user_id бойынша).

create table public.families (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Отбасы',
  code text not null unique,
  created_at timestamptz not null default now()
);

create table public.members (
  family_id uuid not null references public.families(id) on delete cascade,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  display_name text,
  joined_at timestamptz not null default now(),
  primary key (family_id, user_id)
);

create table public.docs (
  family_id uuid not null references public.families(id) on delete cascade,
  coll text not null,
  id text not null,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  primary key (family_id, coll, id)
);

create table public.private_docs (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  coll text not null,
  id text not null,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, coll, id)
);

alter table public.families enable row level security;
alter table public.members enable row level security;
alter table public.docs enable row level security;
alter table public.private_docs enable row level security;

create or replace function public.my_family() returns uuid
language sql stable security definer set search_path = '' as $$
  select family_id from public.members where user_id = (select auth.uid())
$$;

create policy fam_read on public.families for select to authenticated
  using (id = (select public.my_family()));
create policy mem_read on public.members for select to authenticated
  using (family_id = (select public.my_family()));
create policy mem_rename on public.members for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy docs_all on public.docs for all to authenticated
  using (family_id = (select public.my_family()))
  with check (family_id = (select public.my_family()));

create policy priv_all on public.private_docs for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Жаңа отбасы ашу: кодты қайтарады
create or replace function public.create_family(p_name text, p_display text) returns text
language plpgsql security definer set search_path = '' as $$
declare v_code text; v_id uuid;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if exists (select 1 from public.members where user_id = auth.uid()) then
    raise exception 'already in a family';
  end if;
  loop
    v_code := upper(substr(translate(encode(extensions.gen_random_bytes(6), 'base64'), '+/=0O1Il', ''), 1, 6));
    exit when length(v_code) = 6 and not exists (select 1 from public.families where code = v_code);
  end loop;
  insert into public.families(name, code) values (coalesce(nullif(trim(p_name), ''), 'Отбасы'), v_code) returning id into v_id;
  insert into public.members(family_id, user_id, display_name) values (v_id, auth.uid(), nullif(trim(p_display), ''));
  return v_code;
end $$;

-- Код арқылы отбасына қосылу
create or replace function public.join_family(p_code text, p_display text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if exists (select 1 from public.members where user_id = auth.uid()) then
    raise exception 'already in a family';
  end if;
  select id into v_id from public.families where code = upper(trim(p_code));
  if v_id is null then raise exception 'bad code'; end if;
  if (select count(*) from public.members where family_id = v_id) >= 6 then
    raise exception 'family full';
  end if;
  insert into public.members(family_id, user_id, display_name) values (v_id, auth.uid(), nullif(trim(p_display), ''));
  return v_id;
end $$;

-- Құжатқа өрістерді біріктіру (update)
create or replace function public.doc_merge(p_coll text, p_id text, p_patch jsonb) returns void
language plpgsql security invoker set search_path = '' as $$
declare f uuid := public.my_family();
begin
  if f is null then raise exception 'no family'; end if;
  insert into public.docs(family_id, coll, id, data) values (f, p_coll, p_id, p_patch)
  on conflict (family_id, coll, id)
  do update set data = public.docs.data || excluded.data, updated_at = now(), updated_by = auth.uid();
end $$;

create or replace function public.priv_merge(p_coll text, p_id text, p_patch jsonb) returns void
language plpgsql security invoker set search_path = '' as $$
begin
  insert into public.private_docs(user_id, coll, id, data) values (auth.uid(), p_coll, p_id, p_patch)
  on conflict (user_id, coll, id)
  do update set data = public.private_docs.data || excluded.data, updated_at = now();
end $$;

revoke execute on function public.my_family() from public, anon;
revoke execute on function public.create_family(text, text) from public, anon;
revoke execute on function public.join_family(text, text) from public, anon;
revoke execute on function public.doc_merge(text, text, jsonb) from public, anon;
revoke execute on function public.priv_merge(text, text, jsonb) from public, anon;
grant execute on function public.my_family() to authenticated;
grant execute on function public.create_family(text, text) to authenticated;
grant execute on function public.join_family(text, text) to authenticated;
grant execute on function public.doc_merge(text, text, jsonb) to authenticated;
grant execute on function public.priv_merge(text, text, jsonb) to authenticated;

-- Тікелей уақытта жаңару (екі телефон бірден көреді)
alter table public.docs replica identity full;
alter table public.private_docs replica identity full;
alter publication supabase_realtime add table public.docs, public.private_docs;
