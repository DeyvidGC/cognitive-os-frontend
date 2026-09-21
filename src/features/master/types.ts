import type { DailyCount, TopQuestion } from "../dashboard/dashboard";

export type OrganizationSummary = {
  id: string;
  name: string;
};
export type MasterUsageEntry = {
  organization_id: string;
  organization_name: string;
  since: string;
  questions: number;
  answered: number;
  coverage: number | null;
  answered_today: number;
  open_gaps: number;
  per_day: DailyCount[];
  top_questions: TopQuestion[];
};
export type MasterAnswerEntry = {
  organization_id: string;
  organization_name: string;
  answer: string | null;
};
