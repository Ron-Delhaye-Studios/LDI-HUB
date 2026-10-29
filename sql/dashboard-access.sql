-- LDI-HUB-005: fix email matching and remove unsafe default browser grants.
-- Does not recreate or delete tables or data. Safe to rerun.
begin;
do $migration$
declare
  table_name text;
  owner_check constant text := $check$
    (select lower(auth.jwt() ->> 'email')) = 'rondelhayestudios@gmail.com'
    and not coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false)
  $check$;
begin
  foreach table_name in array array['projects', 'payloads', 'system_nodes'] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on table public.%I from PUBLIC, anon, authenticated', table_name);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', table_name);

    execute format('drop policy if exists %I on public.%I', 'Owner full access on ' || table_name, table_name);
    execute format('drop policy if exists ldi_owner_access on public.%I', table_name);
    execute format('drop policy if exists ldi_owner_boundary on public.%I', table_name);
    execute format(
      'create policy ldi_owner_access on public.%I as permissive for all to authenticated
       using (%s) with check (%s)', table_name, owner_check, owner_check
    );
    execute format(
      'create policy ldi_owner_boundary on public.%I as restrictive for all to PUBLIC
       using (%s) with check (%s)', table_name, owner_check, owner_check
    );
  end loop;
end;
$migration$;
grant usage on schema public to authenticated;
commit;
