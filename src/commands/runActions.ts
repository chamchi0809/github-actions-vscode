import * as vscode from "vscode";
import type { GitHubApiService } from "../github/api.js";
import type { RepoInfo } from "../github/types.js";
import type { WorkflowRunTreeItem, JobTreeItem } from "../providers/treeItems.js";

export async function cancelRun(
  api: GitHubApiService,
  repo: RepoInfo,
  item: WorkflowRunTreeItem
): Promise<void> {
  try {
    await api.cancelRun(repo, item.run.id);
    vscode.window.showInformationMessage(
      `Cancelled run #${item.run.run_number}`
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(`Failed to cancel run: ${msg}`);
  }
}

export async function rerunWorkflow(
  api: GitHubApiService,
  repo: RepoInfo,
  item: WorkflowRunTreeItem
): Promise<void> {
  try {
    await api.rerunWorkflow(repo, item.run.id);
    vscode.window.showInformationMessage(
      `Rerun triggered for run #${item.run.run_number}`
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(`Failed to rerun workflow: ${msg}`);
  }
}

export async function rerunFailedJobs(
  api: GitHubApiService,
  repo: RepoInfo,
  item: WorkflowRunTreeItem
): Promise<void> {
  try {
    await api.rerunFailedJobs(repo, item.run.id);
    vscode.window.showInformationMessage(
      `Rerunning failed jobs for run #${item.run.run_number}`
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(
      `Failed to rerun failed jobs: ${msg}`
    );
  }
}

export async function openInBrowser(
  item: WorkflowRunTreeItem | JobTreeItem | { workflow: { html_url: string } }
): Promise<void> {
  let url: string;
  if ("run" in item) {
    url = item.run.html_url;
  } else if ("job" in item) {
    url = item.job.html_url;
  } else if ("workflow" in item) {
    url = item.workflow.html_url;
  } else {
    return;
  }
  await vscode.env.openExternal(vscode.Uri.parse(url));
}

export async function viewJobLogs(
  api: GitHubApiService,
  repo: RepoInfo,
  item: JobTreeItem
): Promise<void> {
  try {
    const logs = await api.getJobLogs(repo, item.job.id);
    const doc = await vscode.workspace.openTextDocument({
      content: typeof logs === "string" ? logs : JSON.stringify(logs),
      language: "log",
    });
    await vscode.window.showTextDocument(doc, { preview: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(`Failed to get job logs: ${msg}`);
  }
}
