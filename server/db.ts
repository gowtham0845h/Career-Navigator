import { createClient } from '@supabase/supabase-js';
import seed from '../data/seed.json' with { type: 'json' };

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
export const db = url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;

export async function seedCatalog() {
  if (!db) return;
  const roles = seed.roles.map((r) => ({ id: r.id, name: r.name, category: r.category, summary: r.summary, skills: r.skills, languages: r.languages, company_notes: r.companyNotes }));
  const jobs = seed.jobs.map((j) => {
    const day = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
    return { id: j.id, company: j.company, title: j.title, role: j.role, location: j.location, work_type: j.workType, experience: j.experience, opens_at: day(j.opensIn), closes_at: day(j.closesIn), apply_url: j.url };
  });
  const [roleResult, jobResult] = await Promise.all([db.from('roles').upsert(roles), db.from('jobs').upsert(jobs)]);
  if (roleResult.error) console.error('Role seed failed:', roleResult.error.message);
  if (jobResult.error) console.error('Job seed failed:', jobResult.error.message);
}
