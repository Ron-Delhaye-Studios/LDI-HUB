'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { getSupabase } from '../lib/supabase';
import { ownerEmail } from '../lib/public-config';

const agents = ['THALEIA', 'LUNA', 'GPT', 'INDY'] as const;
const statuses = ['draft', 'queued', 'in_progress', 'completed'] as const;
type Project = { id: string; title: string; description: string | null; status: string };
type Payload = {
  id: string; project_id: string; title: string; payload_chunk_type: string;
  assigned_agent: string | null; status: string; content_payload: unknown;
};
type Draft = {
  title: string; chunk: string; agent: string; status: string;
  instructions: string; drive: string; github: string; summary: string;
};
const empty: Draft = { title: '', chunk: 'task', agent: '', status: 'draft', instructions: '', drive: '', github: '', summary: '' };
function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}
function field(data: Record<string, unknown>, key: string) {
  return typeof data[key] === 'string' ? data[key] as string : '';
}
function message(error: unknown) {
  if (error && typeof error === 'object' && 'message' in error) return String(error.message);
  return String(error);
}
function safeLink(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : null; }
  catch { return null; }
}

function Content({ payload }: { payload: unknown }) {
  const data = object(payload);
  const drive = safeLink(data.drive_link);
  const github = safeLink(data.github_link);
  return <details className="content"><summary>View instructions & links</summary>
    <p className="instructions">{field(data, 'instructions') || 'No instructions yet.'}</p>
    {(drive || github) && <div className="links">
      {drive && <a href={drive} target="_blank" rel="noopener noreferrer">Open Drive ↗</a>}
      {github && <a href={github} target="_blank" rel="noopener noreferrer">Open GitHub ↗</a>}
    </div>}
    {field(data, 'output_summary') && <><h4>Output summary</h4><p className="instructions">{field(data, 'output_summary')}</p></>}
  </details>;
}

export default function Page() {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState(ownerEmail);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [agentFilter, setAgentFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [rows, setRows] = useState<Payload[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<Payload | null>(null);
  const [draft, setDraft] = useState<Draft>({ ...empty });
  const [refresh, setRefresh] = useState(0);
  const listVersion = useRef(0);

  useEffect(() => {
    let live = true;
    try {
      const db = getSupabase();
      // Subscribe first; avoid a stale initial getSession result replacing a login.
      let changed = false;
      const { data: { subscription } } = db.auth.onAuthStateChange((_event, next) => {
        changed = true;
        if (live) { setSession(next); setReady(true); }
      });
      void db.auth.getSession().then(({ data, error }) => {
        if (!live) return;
        if (error) setError(error.message);
        if (!changed) setSession(data.session);
        setReady(true);
      }).catch(e => { if (live) { setError(message(e)); setReady(true); } });
      return () => { live = false; subscription.unsubscribe(); };
    } catch (e) { setError(message(e)); setReady(true); }
    return () => { live = false; };
  }, []);

  const isOwner = session?.user.email?.toLowerCase() === ownerEmail.toLowerCase();
  const userId = isOwner ? session?.user.id : undefined;
  useEffect(() => {
    let live = true;
    setProjects([]); setProjectId(''); setRows([]); setEditing(null); setDraft({ ...empty });
    if (!userId) return;
    void (async () => {
      try {
        const { data, error } = await getSupabase().from('projects').select('*').order('created_at');
        if (!live) return;
        if (error) throw error;
        const items = data as Project[];
        setProjects(items); setProjectId(items[0]?.id ?? '');
      } catch (e) { if (live) setError(message(e)); }
    })();
    return () => { live = false; };
  }, [userId]);

  useEffect(() => {
    let live = true;
    const version = ++listVersion.current;
    setRows([]);
    if (!userId || !projectId) { setLoading(false); return; }
    setLoading(true);
    void (async () => {
      try {
        let query = getSupabase().from('payloads').select('*').eq('project_id', projectId).order('title').order('id');
        if (agentFilter === 'unassigned') query = query.is('assigned_agent', null);
        else if (agentFilter) query = query.eq('assigned_agent', agentFilter);
        if (statusFilter) query = query.eq('status', statusFilter);
        const { data, error } = await query.limit(200);
        if (!live || version !== listVersion.current) return;
        if (error) throw error;
        setRows(data as Payload[]);
      } catch (e) { if (live && version === listVersion.current) setError(message(e)); }
      finally { if (live && version === listVersion.current) setLoading(false); }
    })();
    return () => { live = false; };
  }, [userId, projectId, agentFilter, statusFilter, refresh]);

  async function action(fn: () => Promise<void>) {
    setBusy(true); setError(''); setNotice('');
    try { await fn(); } catch (e) { setError(message(e)); }
    finally { setBusy(false); }
  }
  function update(key: keyof Draft, value: string) { setDraft(d => ({ ...d, [key]: value })); }
  function edit(row: Payload) {
    if (row.content_payload === null || typeof row.content_payload !== 'object' || Array.isArray(row.content_payload)) {
      setError('This payload contains legacy content that is not a JSON object. Convert it before editing here.'); return;
    }
    const c = object(row.content_payload);
    setEditing(row);
    setDraft({ title: row.title, chunk: row.payload_chunk_type, agent: row.assigned_agent ?? '', status: row.status,
      instructions: field(c, 'instructions'), drive: field(c, 'drive_link'), github: field(c, 'github_link'), summary: field(c, 'output_summary') });
    setError(''); setNotice('');
  }
  function save(event: FormEvent) {
    event.preventDefault();
    void action(async () => {
      if (!projectId) throw new Error('Choose a project first.');
      if (!draft.title.trim() || !draft.chunk.trim()) throw new Error('Title and chunk type are required.');
      for (const link of [draft.drive, draft.github]) {
        if (link.trim() && !['https:', 'http:'].includes(new URL(link.trim()).protocol)) throw new Error('Links must begin with https:// or http://.');
      }
      const values = {
        project_id: projectId, title: draft.title.trim(), payload_chunk_type: draft.chunk.trim(),
        assigned_agent: draft.agent || null, status: draft.status,
        content_payload: { ...object(editing?.content_payload), instructions: draft.instructions,
          drive_link: draft.drive.trim(), github_link: draft.github.trim(), output_summary: draft.summary },
      };
      const db = getSupabase();
      const query = editing
        ? db.from('payloads').update(values).eq('id', editing.id).eq('project_id', projectId)
        : db.from('payloads').insert(values);
      const { error } = await query.select('id').single();
      if (error) throw error;
      setEditing(null); setDraft({ ...empty }); setRefresh(v => v + 1);
      setNotice('Payload saved. If it does not appear, check your filters.');
    });
  }

  const currentProject = projects.find(p => p.id === projectId);
  return <main>
    <header><div className="brand"><span className="mark" aria-hidden="true">L.</span><div><small>LDI NETWORK / WORKSPACE</small><h1>Payload Hub</h1></div></div>
      {session && <button disabled={busy} onClick={() => void action(async () => {
        const { error } = await getSupabase().auth.signOut(); if (error) throw error;
        setError(''); setNotice('');
      })}>Sign out</button>}
    </header>
    {error && <p role="alert" className="error">{error}</p>}
    {notice && <p role="status" className="notice">{notice}</p>}
    {!ready ? <p role="status">Opening your workspace…</p> : !session ? <div className="login-layout"><div className="intro">
      <small>ONE PROJECT. EVERY HANDOFF.</small><h2>Keep the work<br />moving forward.</h2>
      <p>A shared home for your projects, instructions, and agent payloads.</p>
      <div className="agent-labels">{agents.map(agent => <span key={agent}>{agent}</span>)}</div>
      <p className="motto">AD ASTRA PROCEDAMUS</p>
    </div><section className="login">
      <h2>Welcome back</h2><p>Sign in to your owner workspace.</p>
      <form onSubmit={e => { e.preventDefault(); void action(async () => {
        const { error } = await getSupabase().auth.signInWithPassword({ email, password });
        if (error) throw error; setPassword('');
      }); }}>
        <label>Email<input type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} /></label>
        <label>Password<input type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} /></label>
        <button disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </section></div> : !isOwner ? <section><h2>Owner access required</h2><p>This workspace belongs to {ownerEmail}. Sign out and use that account.</p></section> : <>
      <div className="workspace-heading"><div><small>YOUR WORKSPACE</small><h2>Projects & payloads</h2><p>Choose a project, assign the work, and keep every handoff in view.</p></div>
        <span className="owner-tag">Owner workspace</span>
      </div>
      <section className="project-panel"><h2>Project</h2>
        <label>Current project<select disabled={busy} value={projectId} onChange={e => {
          ++listVersion.current; setRows([]); setProjectId(e.target.value); setEditing(null); setDraft({ ...empty }); setNotice('');
        }}><option value="">Choose a project</option>{projects.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}</select></label>
        {currentProject && <p className="project-description">{currentProject.description || 'A workspace for this project’s payloads.'}</p>}
        <details><summary>Create a project</summary><form onSubmit={e => {
          e.preventDefault(); void action(async () => {
            if (!newTitle.trim()) throw new Error('Enter a project title.');
            const { data, error } = await getSupabase().from('projects').insert({ title: newTitle.trim(), description: newDescription.trim() || null }).select('*').single();
            if (error) throw error;
            setProjects(p => [...p, data as Project]); setProjectId(data.id);
            setEditing(null); setDraft({ ...empty }); setNewTitle(''); setNewDescription(''); setNotice('Project created.');
          });
        }}>
          <label>Project title<input disabled={busy} required value={newTitle} onChange={e => setNewTitle(e.target.value)} /></label>
          <label>Description<textarea disabled={busy} value={newDescription} onChange={e => setNewDescription(e.target.value)} /></label>
          <button disabled={busy}>Create project</button>
        </form></details>
      </section>
      <div className="columns"><section><div className="section-heading"><h2>Payloads</h2><span className="count">{loading ? '…' : rows.length}</span></div>
        <div className="filters">
          <label>Agent<select value={agentFilter} onChange={e => setAgentFilter(e.target.value)}>
            <option value="">All agents</option><option value="unassigned">Unassigned</option>{agents.map(a => <option key={a}>{a}</option>)}
          </select></label>
          <label>Status<select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="">All statuses</option>{statuses.map(s => <option key={s} value={s}>{s.replaceAll('_', ' ')}</option>)}
          </select></label>
          <button disabled={busy || loading} onClick={() => setRefresh(v => v + 1)}>Refresh</button>
        </div>
        {loading ? <p role="status">Loading payloads…</p> : !projectId ? <p className="empty">Create or choose a project to begin.</p> : rows.length === 0 ? <p className="empty">No payloads here yet. Add one or adjust your filters.</p> : <ul className="payloads">{rows.map(row => <li key={row.id}>
          <div className="section-heading"><h3>{row.title}</h3><span className={`status status-${row.status}`}>{row.status.replaceAll('_', ' ')}</span></div>
          <p>{row.assigned_agent ?? 'Unassigned'} · {row.payload_chunk_type}</p>
          <Content payload={row.content_payload} />
          <button disabled={busy} onClick={() => edit(row)}>Edit</button>
          <button className="danger secondary" disabled={busy} onClick={() => {
            if (!window.confirm(`Delete “${row.title}”?`)) return;
            void action(async () => {
              const { error } = await getSupabase().from('payloads').delete().eq('id', row.id).eq('project_id', projectId).select('id').single();
              if (error) throw error;
              if (editing?.id === row.id) { setEditing(null); setDraft({ ...empty }); }
              setRefresh(v => v + 1); setNotice('Payload deleted.');
            });
          }}>Delete</button>
        </li>)}</ul>}
        {rows.length === 200 && <p>Showing the first 200 results. Narrow the agent or status filter.</p>}
      </section>
      <section className="editor"><h2>{editing ? 'Edit payload' : 'New payload'}</h2><p>Give the next agent everything they need.</p>
        <form onSubmit={save}><fieldset disabled={busy || !projectId}>
          <label>Title<input placeholder="What needs to happen?" required value={draft.title} onChange={e => update('title', e.target.value)} /></label>
          <details><summary>Payload type: {draft.chunk}</summary><label>Chunk type<input required value={draft.chunk} onChange={e => update('chunk', e.target.value)} /></label></details>
          <label>Assigned agent<select value={draft.agent} onChange={e => update('agent', e.target.value)}>
            <option value="">Unassigned</option>{agents.map(a => <option key={a}>{a}</option>)}
          </select></label>
          <label>Status<select value={draft.status} onChange={e => update('status', e.target.value)}>
            {statuses.map(s => <option key={s} value={s}>{s.replaceAll('_', ' ')}</option>)}
          </select></label>
          <label>Instructions<textarea placeholder="Describe the task, context, and expected result…" rows={6} value={draft.instructions} onChange={e => update('instructions', e.target.value)} /></label>
          <label>Drive link <span className="optional">Optional</span><input placeholder="https://drive.google.com/…" type="url" value={draft.drive} onChange={e => update('drive', e.target.value)} /></label>
          <label>GitHub link <span className="optional">Optional</span><input placeholder="https://github.com/…" type="url" value={draft.github} onChange={e => update('github', e.target.value)} /></label>
          <label>Output summary<textarea rows={4} value={draft.summary} onChange={e => update('summary', e.target.value)} /></label>
          <button>{busy ? 'Saving…' : 'Save payload'}</button>
          {editing && <button className="secondary" type="button" onClick={() => { setEditing(null); setDraft({ ...empty }); }}>Cancel edit</button>}
        </fieldset></form>
      </section></div>
    </>}
    <footer><span>LDI NETWORK</span><span>AD ASTRA PROCEDAMUS</span></footer>
  </main>;
}
