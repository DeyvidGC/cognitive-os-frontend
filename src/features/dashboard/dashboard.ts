export type DailyCount = { day: string; total: number };
export type TopQuestion = { topic: string; total: number };
export type UsageSummary = {
  since: string;
  questions: number;
  answered: number;
  coverage: number | null;
  answered_today: number;
  open_gaps: number;
  per_day: DailyCount[];
  top_questions: TopQuestion[];
};
export type KnowledgeGap = {
  id: string;
  question: string;
  asked_count: number;
  status: string;
  best_score: number | null;
  created_at: string;
  last_asked_at: string;
};
export type ActiveSession = {
  id: string;
  objective: string;
  application_name: string;
  status: string;
  author_name: string;
};
export type ActivityEntry = {
  id: string;
  actor_name: string;
  action: string;
  label: string;
  resource_type: string;
  resource_id: string;
  details: Record<string, unknown>;
  created_at: string;
};
export type HomeSummary = {
  answered_today: number;
  coverage: number | null;
  open_gaps: number;
  active_sessions: ActiveSession[];
  recent_activity: ActivityEntry[];
};
