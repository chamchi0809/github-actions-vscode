import * as vscode from "vscode";
import { GitHubApiService } from "./github/api.js";
import { WorkflowTreeProvider } from "./providers/workflowTreeProvider.js";
import { RunTreeProvider } from "./providers/runTreeProvider.js";
import { RunWatcher } from "./notifications/runWatcher.js";
import { RunDetailPanel } from "./webview/runDetailPanel.js";
import { triggerWorkflow } from "./commands/triggerWorkflow.js";
import {
  cancelRun,
  rerunWorkflow,
  rerunFailedJobs,
  openInBrowser,
  viewJobLogs,
} from "./commands/runActions.js";
import type {
  WorkflowTreeItem,
  WorkflowRunTreeItem,
  JobTreeItem,
  StepTreeItem,
} from "./providers/treeItems.js";
export async function activate(
  context: vscode.ExtensionContext,
): Promise<void> {
  const api = new GitHubApiService(context);
  const workflowProvider = new WorkflowTreeProvider(api, context);
  const runProvider = new RunTreeProvider(api);
  const watcher = new RunWatcher(api, null);

  // Register tree views
  const workflowTree = vscode.window.createTreeView("githubActionsWorkflows", {
    treeDataProvider: workflowProvider,
    showCollapseAll: true,
  });

  const runTree = vscode.window.createTreeView("githubActionsRuns", {
    treeDataProvider: runProvider,
    showCollapseAll: true,
  });

  // Auto-detect repository from the current workspace
  async function detectAndSetRepo(): Promise<void> {
    try {
      const repo = await api.detectRepository();
      workflowProvider.setRepo(repo);
      runProvider.setRepo(repo);
      watcher.setRepo(repo);

      vscode.commands.executeCommand(
        "setContext",
        "github-actions.hasRepo",
        !!repo,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(
        `GitHub Actions: Failed to detect repo - ${msg}`,
      );
    }
  }

  await detectAndSetRepo();

  // Re-detect when workspace folders change
  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => detectAndSetRepo()),
  );

  // Listen for auth changes
  api.onDidChangeAuth(() => {
    workflowProvider.refresh();
    runProvider.refresh();
  });

  // Watch for run completions and refresh the tree
  watcher.onRunsChanged(() => {
    runProvider.refresh();
  });

  watcher.onRunCompleted(() => {
    runProvider.refresh();
  });

  // Auto-refresh: poll runs if there are active/queued runs
  let autoRefreshTimer: ReturnType<typeof setInterval> | null = null;

  function startAutoRefresh(): void {
    if (autoRefreshTimer) {
      return;
    }
    autoRefreshTimer = setInterval(() => {
      runProvider.refresh();
    }, 30000);
  }

  function stopAutoRefresh(): void {
    if (autoRefreshTimer) {
      clearInterval(autoRefreshTimer);
      autoRefreshTimer = null;
    }
  }

  startAutoRefresh();

  // ── Commands ────────────────────────────────────────────────────

  context.subscriptions.push(
    vscode.commands.registerCommand("github-actions.refreshWorkflows", () => {
      workflowProvider.refresh();
    }),

    vscode.commands.registerCommand("github-actions.refreshRuns", () => {
      runProvider.refresh();
    }),

    vscode.commands.registerCommand(
      "github-actions.triggerWorkflow",
      async (item?: WorkflowTreeItem) => {
        const repo = workflowProvider.getRepo();
        if (!repo) {
          vscode.window.showErrorMessage("No repository configured");
          return;
        }
        const runId = await triggerWorkflow(api, repo, item);
        if (runId) {
          // Watch the triggered run for completion
          const workflowName = item?.workflow.name || "Workflow";
          watcher.watchRun(runId, workflowName, 0);
          watcher.startPolling();
          runProvider.refresh();
        }
      },
    ),

    vscode.commands.registerCommand(
      "github-actions.cancelRun",
      async (item: WorkflowRunTreeItem) => {
        const repo = workflowProvider.getRepo();
        if (!repo) {
          return;
        }
        await cancelRun(api, repo, item);
        runProvider.refresh();
      },
    ),

    vscode.commands.registerCommand(
      "github-actions.rerunWorkflow",
      async (item: WorkflowRunTreeItem) => {
        const repo = workflowProvider.getRepo();
        if (!repo) {
          return;
        }
        await rerunWorkflow(api, repo, item);
        // Watch the rerun
        watcher.watchRun(
          item.run.id,
          item.run.name || "Workflow",
          item.run.run_number,
        );
        watcher.startPolling();
        runProvider.refresh();
      },
    ),

    vscode.commands.registerCommand(
      "github-actions.rerunFailedJobs",
      async (item: WorkflowRunTreeItem) => {
        const repo = workflowProvider.getRepo();
        if (!repo) {
          return;
        }
        await rerunFailedJobs(api, repo, item);
        watcher.watchRun(
          item.run.id,
          item.run.name || "Workflow",
          item.run.run_number,
        );
        watcher.startPolling();
        runProvider.refresh();
      },
    ),

    vscode.commands.registerCommand(
      "github-actions.viewRunDetail",
      async (item: WorkflowRunTreeItem) => {
        const repo = workflowProvider.getRepo();
        if (!repo) {
          return;
        }
        RunDetailPanel.show(api, repo, item.run.id, context.extensionUri);
      },
    ),

    vscode.commands.registerCommand(
      "github-actions.openInBrowser",
      async (item: WorkflowRunTreeItem | JobTreeItem | WorkflowTreeItem) => {
        await openInBrowser(item as any);
      },
    ),

    vscode.commands.registerCommand(
      "github-actions.viewJobLogs",
      async (item: JobTreeItem) => {
        const repo = workflowProvider.getRepo();
        if (!repo) {
          return;
        }
        await viewJobLogs(api, repo, item);
      },
    ),

    vscode.commands.registerCommand(
      "github-actions.pinWorkflow",
      async (item: WorkflowTreeItem) => {
        await workflowProvider.pinWorkflow(item.workflow.id);
      },
    ),

    vscode.commands.registerCommand(
      "github-actions.unpinWorkflow",
      async (item: WorkflowTreeItem) => {
        await workflowProvider.unpinWorkflow(item.workflow.id);
      },
    ),

    vscode.commands.registerCommand(
      "github-actions.viewStepLogs",
      async (item: StepTreeItem) => {
        const repo = workflowProvider.getRepo();
        if (!repo) {
          return;
        }
        try {
          const logs = await api.getJobLogs(repo, item.jobId);
          const logText =
            typeof logs === "string" ? logs : JSON.stringify(logs);
          // Find the step section in the logs
          const stepName = item.step.name;
          const doc = await vscode.workspace.openTextDocument({
            content: logText,
            language: "log",
          });
          const editor = await vscode.window.showTextDocument(doc, {
            preview: true,
          });
          // Search for the step name and scroll to it
          const text = doc.getText();
          const stepIndex = text.indexOf(stepName);
          if (stepIndex >= 0) {
            const pos = doc.positionAt(stepIndex);
            editor.revealRange(
              new vscode.Range(pos, pos),
              vscode.TextEditorRevealType.AtTop,
            );
            editor.selection = new vscode.Selection(pos, pos);
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          vscode.window.showErrorMessage(`Failed to get step logs: ${msg}`);
        }
      },
    ),

    vscode.commands.registerCommand("github-actions.setToken", async () => {
      const token = await vscode.window.showInputBox({
        prompt: "Enter your GitHub Personal Access Token (needs 'repo' scope)",
        password: true,
        placeHolder: "ghp_...",
        ignoreFocusOut: true,
      });
      if (token) {
        await api.setToken(token);
        vscode.window.showInformationMessage("GitHub token saved successfully");
        workflowProvider.refresh();
        runProvider.refresh();
      }
    }),
  );

  // ── Disposables ─────────────────────────────────────────────────

  context.subscriptions.push(
    workflowTree,
    runTree,
    workflowProvider,
    watcher,
    api,
    { dispose: () => stopAutoRefresh() },
  );
}

export function deactivate(): void {
  // Cleanup handled by disposables
}
