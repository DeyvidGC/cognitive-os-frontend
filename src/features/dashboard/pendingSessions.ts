import type { Session } from "../../shared/api";
const priorities: Record<string, number> = {
  ready: 0,
  completed: 0,
  failed: 1,
  capturing: 2,
  uploading: 3,
  uploaded: 4,
};
export function pendingSessions(sessions: Session[]) {
  return sessions
    .filter((s) => s.status in priorities)
    .sort((a, b) => priorities[a.status] - priorities[b.status]);
}
