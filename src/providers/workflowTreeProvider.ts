import * as vscode from "vscode";
import type { GitHubApiService } from "../github/api.js";
import type { RepoInfo, Workflow } from "../github/types.js";
import { WorkflowTreeItem, MessageTreeItem, SeparatorTreeItem } from "./treeItems.js";

const PINNED_WORKFLOWS_KEY = "githubActions.pinnedWorkflows";

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

  constructor(
    private api: GitHubApiService,
    private context: vscode.ExtensionContext
  ) {}

  private getPinnedIds(): number[] {
    return this.context.workspaceState.get<number[]>(PINNED_WORKFLOWS_KEY, []);
  }

  private async setPinnedIds(ids: number[]): Promise<void> {
    await this.context.workspaceState.update(PINNED_WORKFLOWS_KEY, ids);
  }

  isPinned(workflowId: number): boolean {
    return this.getPinnedIds().includes(workflowId);
  }

  async pinWorkflow(workflowId: number): Promise<void> {
    const pinned = this.getPinnedIds();
    if (!pinned.includes(workflowId)) {
      pinned.push(workflowId);
      await this.setPinnedIds(pinned);
      this.refresh();
    }
  }

  async unpinWorkflow(workflowId: number): Promise<void> {
    const pinned = this.getPinnedIds().filter((id) => id !== workflowId);
    await this.setPinnedIds(pinned);
    this.refresh();
  }

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

      const pinnedIds = this.getPinnedIds();
      const pinned = this.workflows.filter((w) => pinnedIds.includes(w.id));
      const unpinned = this.workflows.filter((w) => !pinnedIds.includes(w.id));

      const items: vscode.TreeItem[] = [
        ...pinned.map((w) => new WorkflowTreeItem(w, true)),
        ...(pinned.length > 0 && unpinned.length > 0 ? [new SeparatorTreeItem()] : []),
        ...unpinned.map((w) => new WorkflowTreeItem(w, false)),
      ];

      return items;
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
