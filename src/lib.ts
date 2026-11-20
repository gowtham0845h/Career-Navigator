import { createClient, type Session } from '@supabase/supabase-js';

const env = import.meta.env as Record<string, string | undefined>;
export const supabase = env.VITE_SUPABASE_URL && env.VITE_SUPABASE_ANON_KEY
  ? createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)
  : null;
export type UserProfile = { id?: string; name: string; college: string; branch: string; year: string; target_role: string; target_companies: string[]; theme: 'light'|'dark' };
export type Role = { id: string; name: string; category: string; summary: string; skills: {group:string;name:string;detail:string}[]; languages: {name:string;importance:number;order:number;reason:string}[]; company_notes: Record<string,{technical:string[];dsa:string;systemDesign:string;behavioral:string}> };
export type Job = { id: string; company: string; title: string; role: string; location: string; work_type: string; experience: string; opens_at: string; closes_at: string; apply_url: string; status: string };
export type Step = { id: string; phase: string; title: string; goal: string; resources: string[]; estimate: string; completed: boolean; sort_order?: number };
export async function api<T>(path: string, session: Session | null, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers); headers.set('Content-Type','application/json');
  if (session?.access_token) headers.set('Authorization', `Bearer ${session.access_token}`);
  let response: Response;
  try { response = await fetch(`${env.VITE_API_URL ?? 'http://localhost:3001'}${path}`, { ...init, headers }); }
  catch { throw new Error('Could not reach Career Navigator. Make sure the API server is running.'); }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error?.message ?? 'Something went wrong. Please try again.');
  return body as T;
}
