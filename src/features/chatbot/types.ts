export type ChatCitation = {
  recording_id: string;
  session_objective: string | null;
  label: string;
  score: number;
};
export type ChatAnswer = {
  gap_detected: boolean;
  answer: string | null;
  citation: ChatCitation | null;
  gap: { id: string } | null;
};
export type ChatHistoryEntry = {
  id: string;
  question: string;
  answered: boolean;
  session_objective: string | null;
  recording_id: string | null;
  policy_id: string | null;
  created_at: string;
};
export type ChatTurn = {
  id: string;
  question: string;
  status: "pending" | "answered" | "gap" | "error";
  answer?: string;
  citation?: ChatCitation;
  error?: string;
};
