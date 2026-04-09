export interface RepoInfo {
  owner: string;
  repo: string;
}

export interface Workflow {
  id: number;
  name: string;
  path: string;
  state: "active" | "disabled_manually" | "disabled_inactivity";
  html_url: string;
  badge_url: string;
  created_at: string;
  updated_at: string;
}

export interface WorkflowRun {
  id: number;
  name: string | null;
  workflow_id: number;
  head_branch: string | null;
  head_sha: string;
  run_number: number;
  run_attempt: number;
  event: string;
  status: RunStatus | null;
  conclusion: RunConclusion | null;
  html_url: string;
  created_at: string;
  updated_at: string;
  actor: {
    login: string;
    avatar_url: string;
  } | null;
  triggering_actor?: {
    login: string;
    avatar_url: string;
  } | null;
  display_title: string;
}

export type RunStatus =
  | "queued"
  | "in_progress"
  | "completed"
  | "waiting"
  | "requested"
  | "pending";

export type RunConclusion =
  | "success"
  | "failure"
  | "cancelled"
  | "skipped"
  | "timed_out"
  | "action_required"
  | "neutral"
  | "stale"
  | "startup_failure"
  | null;

export interface WorkflowJob {
  id: number;
  run_id: number;
  name: string;
  status: RunStatus | null;
  conclusion: RunConclusion | null;
  started_at: string | null;
  completed_at: string | null;
  html_url: string;
  steps?: JobStep[];
  runner_name: string | null;
  labels: string[];
}

export interface JobStep {
  name: string;
  status: "queued" | "in_progress" | "completed";
  conclusion: "success" | "failure" | "cancelled" | "skipped" | null;
  number: number;
  started_at: string | null;
  completed_at: string | null;
}

export interface WorkflowDispatchInput {
  name: string;
  description: string;
  required: boolean;
  default?: string;
  type?: "string" | "boolean" | "choice" | "number" | "environment";
  options?: string[];
}

export interface WorkflowDispatchConfig {
  inputs: Record<string, WorkflowDispatchInput>;
}
