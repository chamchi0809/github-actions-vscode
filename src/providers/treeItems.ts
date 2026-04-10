import * as vscode from "vscode";
import type {
  Workflow,
  WorkflowRun,
  WorkflowJob,
  JobStep,
  RunConclusion,
  RunStatus,
} from "../github/types.js";

// ── Status Icons ──────────────────────────────────────────────────

function getRunStatusIcon(
  status: RunStatus | null,
  conclusion: RunConclusion | null
): vscode.ThemeIcon {
  if (status === "completed") {
    switch (conclusion) {
      case "success":
        return new vscode.ThemeIcon(
          "pass-filled",
          new vscode.ThemeColor("testing.iconPassed")
        );
      case "failure":
        return new vscode.ThemeIcon(
          "error",
          new vscode.ThemeColor("testing.iconFailed")
        );
      case "cancelled":
        return new vscode.ThemeIcon(
          "circle-slash",
          new vscode.ThemeColor("disabledForeground")
        );
      case "skipped":
        return new vscode.ThemeIcon(
          "debug-step-over",
          new vscode.ThemeColor("disabledForeground")
        );
      case "timed_out":
        return new vscode.ThemeIcon(
          "watch",
          new vscode.ThemeColor("testing.iconFailed")
        );
      case "action_required":
        return new vscode.ThemeIcon(
          "bell",
          new vscode.ThemeColor("notificationsWarningIcon.foreground")
        );
      default:
        return new vscode.ThemeIcon("circle-outline");
    }
  }

  switch (status) {
    case "in_progress":
      return new vscode.ThemeIcon(
        "sync~spin",
        new vscode.ThemeColor("progressBar.background")
      );
    case "queued":
    case "waiting":
    case "pending":
    case "requested":
      return new vscode.ThemeIcon(
        "clock",
        new vscode.ThemeColor("notificationsWarningIcon.foreground")
      );
    default:
      return new vscode.ThemeIcon("circle-outline");
  }
}

function getWorkflowIcon(state: string): vscode.ThemeIcon {
  switch (state) {
    case "active":
      return new vscode.ThemeIcon("play-circle");
    case "disabled_manually":
    case "disabled_inactivity":
      return new vscode.ThemeIcon(
        "circle-slash",
        new vscode.ThemeColor("disabledForeground")
      );
    default:
      return new vscode.ThemeIcon("circle-outline");
  }
}

// ── Time Formatting ─────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const seconds = Math.floor((now - then) / 1000);

  if (seconds < 60) {
    return `${seconds}s ago`;
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatDuration(start: string | null, end: string | null): string {
  if (!start) {
    return "";
  }
  const startTime = new Date(start).getTime();
  const endTime = end ? new Date(end).getTime() : Date.now();
  const seconds = Math.floor((endTime - startTime) / 1000);

  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainSec = seconds % 60;
  if (minutes < 60) {
    return `${minutes}m ${remainSec}s`;
  }
  const hours = Math.floor(minutes / 60);
  const remainMin = minutes % 60;
  return `${hours}h ${remainMin}m`;
}

// ── Tree Items ──────────────────────────────────────────────────

export class WorkflowTreeItem extends vscode.TreeItem {
  constructor(
    public readonly workflow: Workflow,
    public readonly pinned: boolean = false,
    public readonly dispatchable: boolean = true
  ) {
    super(workflow.name, vscode.TreeItemCollapsibleState.None);

    const base = dispatchable ? "workflow-dispatchable" : "workflow";
    this.contextValue = pinned ? `${base}-pinned` : base;

    // Icon priority: dispatchable green play > pinned > default state icon
    if (dispatchable) {
      this.iconPath = new vscode.ThemeIcon(
        "debug-start",
        new vscode.ThemeColor("testing.iconPassed")
      );
    } else if (pinned) {
      this.iconPath = new vscode.ThemeIcon(
        "pinned",
        new vscode.ThemeColor("charts.yellow")
      );
    } else {
      this.iconPath = getWorkflowIcon(workflow.state);
    }

    this.description = workflow.state === "active" ? workflow.path.replace(".github/workflows/", "") : `(${workflow.state})`;

    // Pinned indicator in label suffix
    if (pinned) {
      this.description = `$(pinned) ${this.description}`;
    }

    this.tooltip = new vscode.MarkdownString(
      `**${workflow.name}**${pinned ? " 📌" : ""}\n\n` +
        `- Path: \`${workflow.path}\`\n` +
        `- State: ${workflow.state}\n` +
        `- Updated: ${timeAgo(workflow.updated_at)}`
    );

    // Click to trigger for dispatchable workflows
    if (dispatchable) {
      this.command = {
        command: "github-actions.triggerWorkflow",
        title: "Trigger Workflow",
        arguments: [this],
      };
    }
  }
}

export class WorkflowRunTreeItem extends vscode.TreeItem {
  constructor(
    public readonly run: WorkflowRun,
    hasChildren: boolean = true
  ) {
    super(
      run.display_title || run.name || `Run #${run.run_number}`,
      hasChildren
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None
    );

    const effectiveStatus =
      run.status === "completed" ? (run.conclusion ?? "completed") : (run.status ?? "unknown");
    this.contextValue = `run-${effectiveStatus}`;
    this.iconPath = getRunStatusIcon(run.status, run.conclusion);

    const branch = run.head_branch ? `${run.head_branch}` : "";
    const actor = run.triggering_actor?.login || run.actor?.login || "";
    this.description = `#${run.run_number} ${branch} ${timeAgo(run.created_at)}`;

    this.tooltip = new vscode.MarkdownString(
      `**${run.display_title || run.name}**\n\n` +
        `- Run: #${run.run_number} (attempt ${run.run_attempt})\n` +
        `- Status: ${run.status}${run.conclusion ? ` (${run.conclusion})` : ""}\n` +
        `- Branch: ${run.head_branch || "N/A"}\n` +
        `- Event: ${run.event}\n` +
        `- Actor: ${actor}\n` +
        `- Started: ${timeAgo(run.created_at)}`
    );
  }
}

export class JobTreeItem extends vscode.TreeItem {
  constructor(public readonly job: WorkflowJob) {
    super(
      job.name,
      job.steps && job.steps.length > 0
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None
    );

    const effectiveStatus =
      job.status === "completed" ? (job.conclusion ?? "completed") : (job.status ?? "unknown");
    this.contextValue = `job-${effectiveStatus}`;
    this.iconPath = getRunStatusIcon(job.status, job.conclusion);

    const duration = formatDuration(job.started_at, job.completed_at);
    this.description = duration || (job.status ?? "");

    this.tooltip = new vscode.MarkdownString(
      `**${job.name}**\n\n` +
        `- Status: ${job.status}${job.conclusion ? ` (${job.conclusion})` : ""}\n` +
        `- Duration: ${duration || "N/A"}\n` +
        `- Runner: ${job.runner_name || "N/A"}\n` +
        `- Labels: ${job.labels.join(", ") || "N/A"}`
    );
  }
}

export class StepTreeItem extends vscode.TreeItem {
  constructor(public readonly step: JobStep) {
    super(step.name, vscode.TreeItemCollapsibleState.None);

    this.iconPath = getRunStatusIcon(
      step.status as RunStatus,
      step.conclusion as RunConclusion
    );

    const duration = formatDuration(step.started_at, step.completed_at);
    this.description = duration || (step.status ?? "");
    this.contextValue = "step";
  }
}

export class MessageTreeItem extends vscode.TreeItem {
  constructor(message: string, icon?: string) {
    super(message, vscode.TreeItemCollapsibleState.None);
    this.iconPath = icon ? new vscode.ThemeIcon(icon) : undefined;
    this.contextValue = "message";
  }
}
