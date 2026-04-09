import * as vscode from "vscode";
import type { GitHubApiService } from "../github/api.js";
import type { RepoInfo, Workflow } from "../github/types.js";
import { WorkflowTreeItem, MessageTreeItem } from "./treeItems.js";

export class WorkflowTreeProvider
  implements vscode.TreeDataProvider<vscode.TreeItem>
{
  private _onDidChangeTreeData = new vscode.EventEmitter<
    vscode.TreeItem | undefined | null | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private workflows: Workflow[] = [];
  private repo: RepoInfo | null = null;
  private loading = false;

  constructor(private api: GitHubApiService) {}

  setRepo(repo: RepoInfo | null): void {
    this.repo = repo;
    this.refresh();
  }

  getRepo(): RepoInfo | null {
    return this.repo;
  }

  getWorkflows(): Workflow[] {
    return this.workflows;
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(
    element?: vscode.TreeItem
  ): Promise<vscode.TreeItem[]> {
    if (element) {
      return [];
    }

    if (!this.repo) {
      return [
        new MessageTreeItem(
          "No GitHub repository detected",
          "warning"
        ),
        new MessageTreeItem(
          "Open a folder with a GitHub remote",
          "info"
        ),
      ];
    }

    if (this.loading) {
      return [new MessageTreeItem("Loading workflows...", "loading~spin")];
    }

    this.loading = true;

    try {
      this.workflows = await this.api.listWorkflows(this.repo);
      this.loading = false;

      if (this.workflows.length === 0) {
        return [
          new MessageTreeItem("No workflows found", "info"),
        ];
      }

      return this.workflows.map((w) => new WorkflowTreeItem(w));
    } catch (err: unknown) {
      this.loading = false;
      const msg = err instanceof Error ? err.message : String(err);
      return [new MessageTreeItem(`Error: ${msg}`, "error")];
    }
  }

  dispose(): void {
    this._onDidChangeTreeData.dispose();
  }
}
