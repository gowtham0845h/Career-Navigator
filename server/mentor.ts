type Input = { role: string; skills: string[]; companies: string[]; months: number };
const resources: Record<string, string[]> = {
  'AI/ML Engineer': ['Google Machine Learning Crash Course', 'PyTorch Tutorials'],
  'Data Scientist': ['Kaggle Learn: Pandas', 'StatQuest: Statistics'],
  'Machine Learning Engineer': ['Full Stack Deep Learning', 'Made With ML'],
  'Full Stack Developer': ['MDN Web Docs', 'Full Stack Open'],
  'Backend Developer': ['System Design Primer', 'PostgreSQL Tutorial'],
  'Frontend Developer': ['web.dev Learn', 'React Learn'],
  'DevOps Engineer': ['Docker getting started', 'Kubernetes Basics'],
  'Cloud Engineer': ['AWS Skill Builder', 'Terraform tutorials'],
  'Cybersecurity Analyst': ['PortSwigger Web Security Academy', 'Microsoft Learn: Security'],
  'Data Analyst': ['SQLBolt', 'Microsoft Learn: Power BI']
};
const phaseTemplates = [
  ['Foundation', 'Strengthen the fundamentals', 'Review the concepts and core tools you will use throughout this path.'],
  ['Core Skills', 'Build role-ready skills', 'Practice the technical skills employers commonly expect for this role.'],
  ['Projects', 'Show your skills in a real project', 'Create a focused, documented project that demonstrates practical judgment.'],
  ['Interview Prep', 'Practice explaining your decisions', 'Work through coding, role-specific, and behavioral interview practice.'],
  ['Applications', 'Turn preparation into conversations', 'Tailor your materials and apply to a focused set of relevant openings.']
];

// Provider seam: replace this function's implementation with an LLM adapter later.
export function generateRoadmap(input: Input) {
  const months = Math.max(1, Math.min(12, input.months));
  const pool = resources[input.role] ?? ['Official documentation', 'Hands-on practice'];
  const totalWeeks = Math.max(5, months * 4);
  const weights = [.18, .28, .24, .18, .12];
  const slices = weights.map((weight, index) => index === weights.length - 1 ? totalWeeks - weights.slice(0, -1).reduce((sum, n) => sum + Math.max(1, Math.round(totalWeeks * n)), 0) : Math.max(1, Math.round(totalWeeks * weight)));
  return phaseTemplates.map(([phase, title, goal], index) => ({
    id: `${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`, phase, title,
    goal: index === 1 && input.skills.length ? `${goal} — build on your experience with ${input.skills.slice(0, 2).join(' and ')}.` : goal,
    resources: [pool[index % pool.length], pool[(index + 1) % pool.length]],
    estimate: slices[index] >= 8 ? `${Math.round(slices[index] / 4)} months` : `${slices[index]} ${slices[index] === 1 ? 'week' : 'weeks'}`,
    completed: false
  }));
}

export function answerFollowUp(question: string, role: string, companies: string[]) {
  const focus = question.toLowerCase().includes('interview')
    ? `For ${role}, practice explaining your reasoning aloud, then review one focused coding or role-specific problem each day. Keep a short log of what you would improve next time.`
    : question.toLowerCase().includes('project')
      ? `Choose a small ${role} project with a real user or decision in mind. Write down the problem, your key trade-offs, and how you measured the result; that story will help in interviews.`
      : `For ${role}, take the next incomplete roadmap step and turn it into a 30–45 minute session today. If you are targeting ${companies.join(', ') || 'your target companies'}, tailor the examples you practice to their published role requirements. You can adjust the pace to fit your semester.`;
  return { answer: focus, suggestedNextStep: 'Pick one small action for this week and add it to your journey.' };
}
