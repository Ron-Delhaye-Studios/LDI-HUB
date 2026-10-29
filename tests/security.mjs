// Uses an isolated in-memory Postgres instance; never connects to Supabase.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const owner = '11111111-1111-4111-8111-111111111111';
const stranger = '22222222-2222-4222-8222-222222222222';
await db.exec(`
  create role anon;
  create role authenticated;
  create schema auth;
  create table auth.users (id uuid primary key, email text, is_anonymous boolean);
  insert into auth.users values ('${owner}', 'owner@example.test', false);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create function auth.jwt() returns jsonb language sql stable as
    $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
  grant usage on schema auth to authenticated, anon;
  create table public.projects (id uuid primary key default gen_random_uuid(), title text);
  create table public.payloads (id uuid primary key default gen_random_uuid(), title text);
  create table public.system_nodes (id uuid primary key default gen_random_uuid(), title text);
`);
for (const table of ['projects', 'payloads', 'system_nodes']) {
  // Deliberately broad legacy policy: owner boundary must still exclude outsiders.
  await db.exec(`create policy legacy_open on public.${table} for all to public using (true) with check (true)`);
}
const sql = await readFile(new URL('../sql/dashboard-access.sql', import.meta.url), 'utf8');
await db.exec(sql);
await db.exec(sql); // Reapplication must be safe.

async function asUser(role, sub, query) {
  await db.exec(`begin; set local role ${role}; select set_config('request.jwt.claim.sub', '${sub}', true);`);
  const email = sub === owner ? 'rondelhayestudios@gmail.com' : 'outsider@example.test';
  await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub, email, is_anonymous: false })]);
  try { return await db.query(query); }
  finally { await db.exec('rollback'); }
}
for (const table of ['projects', 'payloads', 'system_nodes']) {
  // Owner: all four operations succeed in one transaction.
  await db.exec(`begin; set local role authenticated; select set_config('request.jwt.claim.sub', '${owner}', true)`);
  await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: owner, email: 'rondelhayestudios@gmail.com', is_anonymous: false })]);
  const inserted = await db.query(`insert into public.${table}(title) values ('test') returning id`);
  const id = inserted.rows[0].id;
  assert.equal((await db.query(`select * from public.${table}`)).rows.length, 1);
  assert.equal((await db.query(`update public.${table} set title='changed' where id='${id}' returning id`)).rows.length, 1);
  assert.equal((await db.query(`delete from public.${table} where id='${id}' returning id`)).rows.length, 1);
  await db.exec('rollback');

  // Persist a protected row as the administrator.
  await db.exec(`insert into public.${table}(title) values ('protected')`);
  assert.equal((await asUser('authenticated', stranger, `select * from public.${table}`)).rows.length, 0);
  assert.equal((await asUser('authenticated', stranger, `update public.${table} set title='hacked' returning id`)).rows.length, 0);
  assert.equal((await asUser('authenticated', stranger, `delete from public.${table} returning id`)).rows.length, 0);
  await assert.rejects(asUser('authenticated', stranger, `insert into public.${table}(title) values ('hacked')`), /row-level security/i);
  for (const query of [
    `select * from public.${table}`,
    `insert into public.${table}(title) values ('hacked')`,
    `update public.${table} set title='hacked'`,
    `delete from public.${table}`,
  ]) await assert.rejects(asUser('anon', '', query), /permission denied/i);
  // CRUD grants must not leave inherited TRUNCATE privileges.
  await assert.rejects(asUser('authenticated', owner, `truncate public.${table}`), /permission denied/i);
  console.log(`${table}: owner CRUD, outsider isolation, anonymous denial and TRUNCATE denial passed`);
}
await db.close();
