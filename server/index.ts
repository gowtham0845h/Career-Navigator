import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { z } from 'zod';
import { db, seedCatalog } from './db.js';
import { answerFollowUp, generateRoadmap } from './mentor.js';

const app = express();
app.use(cors({ origin: process.env.CLIENT_ORIGIN?.split(',') ?? true }));
app.use(express.json({ limit: '1mb' }));
const fail = (res: express.Response, status: number, code: string, message: string) => res.status(status).json({ error: { code, message } });
app.use((req, res, next) => {
  if (!db && req.path !== '/api/health') return fail(res, 503, 'SUPABASE_NOT_CONFIGURED', 'Connect your Supabase project to load and save Career Navigator data.');
  next();
});
async function userId(req: express.Request) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token || !db) return null;
  const { data, error } = await db.auth.getUser(token);
  return error ? null : data.user?.id ?? null;
}
const requireUser = async (req: express.Request, res: express.Response) => {
  const id = await userId(req);
  if (!id) fail(res, 401, 'UNAUTHORIZED', 'Please sign in to continue.');
  return id;
};
const statusFor = (job: { opens_at: string; closes_at: string }) => {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const opens = new Date(`${job.opens_at}T00:00:00`); const closes = new Date(`${job.closes_at}T23:59:59`);
  const days = Math.ceil((closes.getTime() - today.getTime()) / 86400000);
  return today < opens ? 'Upcoming' : today > closes ? 'Closed' : days <= 7 ? 'Closing Soon' : 'Open';
};
app.get('/api/health', (_req, res) => res.json({ ok: true, supabase: Boolean(db) }));
app.get('/api/roles', async (_req, res) => { const { data, error } = await db!.from('roles').select('*').order('name'); if (error) return fail(res, 500, 'DATABASE_ERROR', 'Roles could not be loaded.'); res.json(data); });
app.get('/api/roles/:id', async (req, res) => { const { data, error } = await db!.from('roles').select('*').eq('id', req.params.id).maybeSingle(); if (error) return fail(res, 500, 'DATABASE_ERROR', 'Role could not be loaded.'); if (!data) return fail(res, 404, 'NOT_FOUND', 'That role was not found.'); res.json(data); });
app.get('/api/jobs', async (req, res) => {
  const schema = z.object({ company: z.enum(['Google','Microsoft','Amazon']).optional(), role: z.string().trim().min(1).max(100).optional(), status: z.enum(['Upcoming','Open','Closing Soon','Closed']).optional(), location: z.string().trim().max(120).optional(), workType: z.enum(['On-site','Remote','Hybrid']).optional() });
  const parsed = schema.safeParse(req.query); if (!parsed.success) return fail(res, 400, 'VALIDATION_ERROR', 'One or more job filters are invalid.');
  let query = db!.from('jobs').select('*'); const f = parsed.data;
  if (f.company) query = query.eq('company', f.company); if (f.role) query = query.eq('role', f.role); if (f.location) query = query.ilike('location', `%${f.location}%`); if (f.workType) query = query.eq('work_type', f.workType);
  const { data, error } = await query.order('closes_at'); if (error) return fail(res, 500, 'DATABASE_ERROR', 'Jobs could not be loaded.');
  const rows = (data ?? []).map((j) => ({ ...j, status: statusFor(j) })).filter((j) => !f.status || j.status === f.status); res.json(rows);
});
app.post('/api/jobs/:id/save', async (req, res) => { const uid = await requireUser(req, res); if (!uid) return; const { error } = await db!.from('saved_jobs').upsert({ user_id: uid, job_id: req.params.id }); if (error) return fail(res, 400, 'SAVE_FAILED', 'This job could not be saved.'); res.json({ saved: true }); });
app.delete('/api/jobs/:id/save', async (req, res) => { const uid = await requireUser(req, res); if (!uid) return; const { error } = await db!.from('saved_jobs').delete().eq('user_id', uid).eq('job_id', req.params.id); if (error) return fail(res, 400, 'REMOVE_FAILED', 'This saved job could not be removed.'); res.json({ saved: false }); });
app.get('/api/jobs/:id/calendar.ics', async (req, res) => { const { data, error } = await db!.from('jobs').select('*').eq('id', req.params.id).maybeSingle(); if (error || !data) return fail(res, 404, 'NOT_FOUND', 'Job not found.'); const date = data.closes_at.replaceAll('-', ''); const dayAfter = new Date(`${data.closes_at}T12:00:00`); dayAfter.setDate(dayAfter.getDate()+1); const endDate = dayAfter.toISOString().slice(0,10).replaceAll('-',''); const escape = (s: string) => s.replaceAll('\\', '\\\\').replaceAll(',', '\\,').replaceAll(';', '\\;').replaceAll('\n', '\\n'); const ics = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Career Navigator//EN\r\nBEGIN:VEVENT\r\nUID:${data.id}@careernavigator\r\nDTSTAMP:${new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'')}\r\nDTSTART;VALUE=DATE:${date}\r\nDTEND;VALUE=DATE:${endDate}\r\nSUMMARY:${escape(`Application deadline: ${data.title} — ${data.company}`)}\r\nDESCRIPTION:${escape(`Apply: ${data.apply_url}`)}\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n`; res.setHeader('Content-Type', 'text/calendar; charset=utf-8'); res.setHeader('Content-Disposition', `attachment; filename="${data.id}-deadline.ics"`); res.send(ics); });
const companyInput = z.enum(['Google','Microsoft','Amazon']);
const roadmapInput = z.object({ role: z.string().trim().min(1).max(100), skills: z.array(z.string().trim().min(1).max(120)).max(80), companies: z.array(companyInput).max(3), months: z.number().int().min(1).max(12) });
app.post('/api/mentor/roadmap', async (req, res) => { const uid = await requireUser(req, res); if (!uid) return; const parsed = roadmapInput.safeParse(req.body); if (!parsed.success) return fail(res, 400, 'VALIDATION_ERROR', 'Add a role and a timeline between 1 and 12 months.'); const { data: role } = await db!.from('roles').select('id').eq('name', parsed.data.role).maybeSingle(); if (!role) return fail(res, 404, 'ROLE_NOT_FOUND', 'Choose a role from the role explorer.'); const steps = generateRoadmap(parsed.data).map((s, index) => ({ ...s, user_id: uid, role_id: role.id, sort_order: index, resources: s.resources })); const { error } = await db!.from('roadmap_steps').delete().eq('user_id', uid); if (error) return fail(res, 500, 'ROADMAP_FAILED', 'Your roadmap could not be prepared.'); const { error: insertError } = await db!.from('roadmap_steps').insert(steps); if (insertError) return fail(res, 500, 'ROADMAP_FAILED', 'Your roadmap could not be saved.'); const { error: preferenceError } = await db!.from('mentor_preferences').upsert({ user_id: uid, role_id: role.id, skill_names: parsed.data.skills, companies: parsed.data.companies, months: parsed.data.months, updated_at: new Date().toISOString() }); if (preferenceError) return fail(res, 500, 'ROADMAP_FAILED', 'Your roadmap was created, but its preferences could not be saved.'); res.json(steps); });
app.post('/api/mentor/chat', async (req, res) => { const uid = await requireUser(req, res); if (!uid) return; const parsed = z.object({ question: z.string().trim().min(2).max(1200), role: z.string().trim().min(1).max(100), companies: z.array(companyInput).max(3).default([]) }).safeParse(req.body); if (!parsed.success) return fail(res, 400, 'VALIDATION_ERROR', 'Enter a question of 2 to 1,200 characters.'); const { data: role } = await db!.from('roles').select('id').eq('name', parsed.data.role).maybeSingle(); if (!role) return fail(res, 404, 'ROLE_NOT_FOUND', 'Choose a role from the role explorer.'); const reply = answerFollowUp(parsed.data.question, parsed.data.role, parsed.data.companies); const { error } = await db!.from('mentor_messages').insert([{ user_id: uid, role_id: role.id, sender: 'you', content: parsed.data.question }, { user_id: uid, role_id: role.id, sender: 'mentor', content: reply.answer }]); if (error) return fail(res, 500, 'CHAT_SAVE_FAILED', 'Your mentor response could not be saved.'); res.json(reply); });
app.get('/api/profile', async (req, res) => { const uid = await requireUser(req, res); if (!uid) return; const { data, error } = await db!.from('profiles').select('*').eq('id', uid).maybeSingle(); if (error) return fail(res, 500, 'DATABASE_ERROR', 'Profile could not be loaded.'); if (!data) { const { data: created, error: createError } = await db!.from('profiles').insert({ id: uid }).select().single(); if (createError) return fail(res, 500, 'DATABASE_ERROR', 'Profile could not be created.'); return res.json(created); } res.json(data); });
const profileInput = z.object({ name: z.string().trim().max(100), college: z.string().trim().max(160), branch: z.string().trim().max(100), year: z.string().max(40), target_role: z.string().max(100), target_companies: z.array(companyInput).max(3), theme: z.enum(['light','dark']) });
app.put('/api/profile', async (req, res) => { const uid = await requireUser(req, res); if (!uid) return; const parsed = profileInput.safeParse(req.body); if (!parsed.success) return fail(res, 400, 'VALIDATION_ERROR', 'Check the profile fields and try again.'); const { data, error } = await db!.from('profiles').upsert({ id: uid, ...parsed.data, updated_at: new Date().toISOString() }).select().single(); if (error) return fail(res, 500, 'SAVE_FAILED', 'Profile could not be saved.'); res.json(data); });
app.get('/api/progress', async (req, res) => { const uid = await requireUser(req, res); if (!uid) return; const [checklist, roadmap, saved, mentorPreferences, mentorMessages] = await Promise.all([db!.from('checklist_progress').select('*').eq('user_id', uid), db!.from('roadmap_steps').select('*').eq('user_id', uid).order('sort_order'), db!.from('saved_jobs').select('job_id,created_at,jobs(*)').eq('user_id', uid), db!.from('mentor_preferences').select('*').eq('user_id', uid).maybeSingle(), db!.from('mentor_messages').select('*').eq('user_id', uid).order('created_at', { ascending: false }).limit(100)]); if (checklist.error || roadmap.error || saved.error || mentorPreferences.error || mentorMessages.error) return fail(res, 500, 'DATABASE_ERROR', 'Journey progress could not be loaded.'); res.json({ checklist: checklist.data, roadmap: roadmap.data, saved: saved.data, mentorPreferences: mentorPreferences.data, mentorMessages: [...(mentorMessages.data ?? [])].reverse() }); });
app.put('/api/progress', async (req, res) => { const uid = await requireUser(req, res); if (!uid) return; const parsed = z.object({ role_id: z.string().min(1), checklist: z.array(z.object({ skill_name: z.string().min(1).max(200), completed: z.boolean() })).max(100), roadmap: z.array(z.object({ id: z.string().min(1), completed: z.boolean() })).max(100) }).safeParse(req.body); if (!parsed.success) return fail(res, 400, 'VALIDATION_ERROR', 'Progress data is invalid.'); const [a, roadmapResults] = await Promise.all([db!.from('checklist_progress').upsert(parsed.data.checklist.map((item) => ({ user_id: uid, role_id: parsed.data.role_id, ...item, updated_at: new Date().toISOString() })), { onConflict: 'user_id,role_id,skill_name' }), Promise.all(parsed.data.roadmap.map((step) => db!.from('roadmap_steps').update({ completed: step.completed, completed_at: step.completed ? new Date().toISOString() : null }).eq('id', step.id).eq('user_id', uid)))]); if (a.error || roadmapResults.some((r) => r.error)) return fail(res, 500, 'SAVE_FAILED', 'Progress could not be saved.'); res.json({ saved: true }); });
app.use((_req, res) => fail(res, 404, 'NOT_FOUND', 'The requested API route was not found.'));
app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled API error:', error);
  fail(res, 500, 'INTERNAL_ERROR', 'Something went wrong. Please try again.');
});
const port = Number(process.env.PORT ?? 3001);
void seedCatalog().catch((error) => console.error('Catalog seed failed:', error)).finally(() => app.listen(port, () => console.log(`Career Navigator API listening on ${port}`)));
