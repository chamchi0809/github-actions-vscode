import * as vscode from "vscode";
import type { GitHubApiService } from "../github/api.js";
import type { RepoInfo, WorkflowRun, RunConclusion } from "../github/types.js";
import { getPollingInterval, getShowNotifications } from "../config.js";

interface WatchedRun {
  runId: number;
  workflowName: string;
  runNumber: number;
  lastStatus: string | null;
}

export class RunWatcher implements vscode.Disposable {
  private watchedRuns = new Map<number, WatchedRun>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private _onRunCompleted = new vscode.EventEmitter<WorkflowRun>();
  readonly onRunCompleted = this._onRunCompleted.event;
  private _onRunsChanged = new vscode.EventEmitter<void>();
  readonly onRunsChanged = this._onRunsChanged.event;

  constructor(
    private api: GitHubApiService,
    private repo: RepoInfo | null
  ) {}

  setRepo(repo: RepoInfo | null): void {
    this.repo = repo;
    if (!repo) {
      this.stopPolling();
      this.watchedRuns.clear();
    }
  }

  watchRun(runId: number, workflowName: string, runNumber: number): void {
    this.watchedRuns.set(runId, {
      runId,
      workflowName,
      runNumber,
      lastStatus: null,
    });

    if (!this.timer) {
      this.startPolling();
    }
  }

  startPolling(): void {
    if (this.timer) {
      return;
    }

    const intervalMs = getPollingInterval() * 1000;
    this.timer = setInterval(() => this.poll(), intervalMs);
    // Also poll immediately
    this.poll();
  }

  stopPolling(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async poll(): Promise<void> {
    if (!this.repo) {
      return;
    }

    let hasActiveRuns = false;
    let anyChanged = false;

    for (const [runId, watched] of this.watchedRuns) {
      try {
        const run = await this.api.getWorkflowRun(this.repo, runId);

        if (run.status !== watched.lastStatus) {
          anyChanged = true;
          watched.lastStatus = run.status;
        }

        if (run.status === "completed") {
          this.watchedRuns.delete(runId);
          this._onRunCompleted.fire(run);
          this.showCompletionNotification(
            watched.workflowName,
            run.run_number,
            run.conclusion,
            run.html_url
          );
        } else {
          hasActiveRuns = true;
        }
      } catch {
        // Silently ignore polling errors
      }
    }

    if (anyChanged) {
      this._onRunsChanged.fire();
    }

    if (!hasActiveRuns && this.watchedRuns.size === 0) {
      this.stopPolling();
    }
  }

  private showCompletionNotification(
    workflowName: string,
    runNumber: number,
    conclusion: RunConclusion,
    htmlUrl: string
  ): void {
    if (!getShowNotifications()) {
      return;
    }

    const statusText =
      conclusion === "success"
        ? "succeeded"
        : conclusion === "failure"
          ? "failed"
          : conclusion === "cancelled"
            ? "was cancelled"
            : `completed with ${conclusion}`;

    const message = `Workflow "${workflowName}" #${runNumber} ${statusText}`;

    if (conclusion === "success") {
      vscode.window
        .showInformationMessage(message, "Open in Browser")
        .then((action) => {
          if (action === "Open in Browser") {
            vscode.env.openExternal(vscode.Uri.parse(htmlUrl));
          }
        });
    } else {
      vscode.window
        .showWarningMessage(message, "Open in Browser", "Rerun")
        .then((action) => {
          if (action === "Open in Browser") {
            vscode.env.openExternal(vscode.Uri.parse(htmlUrl));
          }
          // Rerun is handled by the caller through events
        });
    }
  }

  hasWatchedRuns(): boolean {
    return this.watchedRuns.size > 0;
  }

  dispose(): void {
    this.stopPolling();
    this._onRunCompleted.dispose();
    this._onRunsChanged.dispose();
    this.watchedRuns.clear();
  }
}
