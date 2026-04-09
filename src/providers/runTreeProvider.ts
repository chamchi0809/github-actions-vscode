import * as vscode from "vscode";
import type { GitHubApiService } from "../github/api.js";
import type { RepoInfo, WorkflowRun, WorkflowJob } from "../github/types.js";
import {
  WorkflowRunTreeItem,
  JobTreeItem,
  StepTreeItem,
  MessageTreeItem,
} from "./treeItems.js";
import { getMaxRuns } from "../config.js";

export class RunTreeProvider
  implements vscode.TreeDataProvider<vscode.TreeItem>
{
  private _onDidChangeTreeData = new vscode.EventEmitter<
    vscode.TreeItem | undefined | null | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private runs: WorkflowRun[] = [];
  private jobsCache = new Map<number, WorkflowJob[]>();
  private repo: RepoInfo | null = null;
  private selectedWorkflowId: number | undefined;
  private loading = false;

  constructor(private api: GitHubApiService) {}

  setRepo(repo: RepoInfo | null): void {
    this.repo = repo;
    this.jobsCache.clear();
    this.refresh();
  }

  setWorkflowFilter(workflowId: number | undefined): void {
    this.selectedWorkflowId = workflowId;
    this.jobsCache.clear();
    this.refresh();
  }

  getRuns(): WorkflowRun[] {
    return this.runs;
  }

  refresh(): void {
    this.jobsCache.clear();
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(
    element?: vscode.TreeItem
  ): Promise<vscode.TreeItem[]> {
    if (!this.repo) {
      return [];
    }

    // Root level: list runs
    if (!element) {
      return this.getRootChildren();
    }

    // Run level: list jobs
    if (element instanceof WorkflowRunTreeItem) {
      return this.getRunChildren(element.run);
    }

    // Job level: list steps
    if (element instanceof JobTreeItem) {
      return this.getJobChildren(element.job);
    }

    return [];
  }

  private async getRootChildren(): Promise<vscode.TreeItem[]> {
    if (this.loading) {
      return [new MessageTreeItem("Loading runs...", "loading~spin")];
    }

    this.loading = true;

    try {
      this.runs = await this.api.listWorkflowRuns(this.repo!, {
        workflowId: this.selectedWorkflowId,
        perPage: getMaxRuns(),
      });
      this.loading = false;

      if (this.runs.length === 0) {
        return [new MessageTreeItem("No workflow runs found", "info")];
      }

      return this.runs.map((r) => new WorkflowRunTreeItem(r));
    } catch (err: unknown) {
      this.loading = false;
      const msg = err instanceof Error ? err.message : String(err);
      return [new MessageTreeItem(`Error: ${msg}`, "error")];
    }
  }

  private async getRunChildren(
    run: WorkflowRun
  ): Promise<vscode.TreeItem[]> {
    try {
      let jobs = this.jobsCache.get(run.id);
      if (!jobs) {
        jobs = await this.api.listJobsForRun(this.repo!, run.id);
        this.jobsCache.set(run.id, jobs);
      }

      if (jobs.length === 0) {
        return [new MessageTreeItem("No jobs found", "info")];
      }

      return jobs.map((j) => new JobTreeItem(j));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return [new MessageTreeItem(`Error: ${msg}`, "error")];
    }
  }

  private getJobChildren(job: WorkflowJob): vscode.TreeItem[] {
    if (!job.steps || job.steps.length === 0) {
      return [new MessageTreeItem("No steps", "info")];
    }
    return job.steps.map((s) => new StepTreeItem(s));
  }

  dispose(): void {
    this._onDidChangeTreeData.dispose();
    this.jobsCache.clear();
  }
}
