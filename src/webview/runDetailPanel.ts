import * as vscode from "vscode";
import type { GitHubApiService } from "../github/api.js";
import type { RepoInfo } from "../github/types.js";

export class RunDetailPanel {
  private static panels = new Map<number, RunDetailPanel>();
  private panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  private constructor(
    private api: GitHubApiService,
    private repo: RepoInfo,
    private runId: number,
    private extensionUri: vscode.Uri
  ) {
    this.panel = vscode.window.createWebviewPanel(
      "githubActionsRunDetail",
      "Workflow Run",
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(extensionUri, "webview-ui", "dist"),
        ],
      }
    );

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

    this.panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.command) {
          case "refresh":
            await this.loadData();
            break;
          case "cancelRun":
            await this.api.cancelRun(this.repo, this.runId);
            await this.loadData();
            break;
          case "rerunWorkflow":
            await this.api.rerunWorkflow(this.repo, this.runId);
            await this.loadData();
            break;
          case "rerunFailedJobs":
            await this.api.rerunFailedJobs(this.repo, this.runId);
            await this.loadData();
            break;
          case "openInBrowser":
            if (message.url) {
              vscode.env.openExternal(vscode.Uri.parse(message.url));
            }
            break;
          case "viewJobLogs":
            if (message.jobId) {
              await this.showJobLogs(message.jobId);
            }
            break;
        }
      },
      null,
      this.disposables
    );

    this.panel.webview.html = this.getHtml();
    this.loadData();
    this.startPolling();
  }

  static show(
    api: GitHubApiService,
    repo: RepoInfo,
    runId: number,
    extensionUri: vscode.Uri
  ): RunDetailPanel {
    const existing = RunDetailPanel.panels.get(runId);
    if (existing) {
      existing.panel.reveal();
      return existing;
    }

    const instance = new RunDetailPanel(api, repo, runId, extensionUri);
    RunDetailPanel.panels.set(runId, instance);
    return instance;
  }

  private async loadData(): Promise<void> {
    try {
      const [run, jobs] = await Promise.all([
        this.api.getWorkflowRun(this.repo, this.runId),
        this.api.listJobsForRun(this.repo, this.runId),
      ]);

      this.panel.title = `Run #${run.run_number}: ${run.display_title || run.name || "Workflow Run"}`;

      await this.panel.webview.postMessage({
        type: "update",
        data: { run, jobs },
      });

      // Stop polling if run is completed
      if (run.status === "completed") {
        this.stopPolling();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      await this.panel.webview.postMessage({
        type: "error",
        message: msg,
      });
    }
  }

  private async showJobLogs(jobId: number): Promise<void> {
    try {
      const logs = await this.api.getJobLogs(this.repo, jobId);
      const doc = await vscode.workspace.openTextDocument({
        content: typeof logs === "string" ? logs : JSON.stringify(logs),
        language: "log",
      });
      await vscode.window.showTextDocument(doc, {
        viewColumn: vscode.ViewColumn.Beside,
        preview: true,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(`Failed to get logs: ${msg}`);
    }
  }

  private startPolling(): void {
    this.pollTimer = setInterval(() => this.loadData(), 15000);
  }

  private stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private getHtml(): string {
    const webview = this.panel.webview;
    const distPath = vscode.Uri.joinPath(
      this.extensionUri,
      "webview-ui",
      "dist"
    );

    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(distPath, "assets", "index.js")
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(distPath, "assets", "index.css")
    );

    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; font-src ${webview.cspSource};">
  <link rel="stylesheet" href="${styleUri}">
  <title>Workflow Run Details</title>
</head>
<body>
  <div id="app"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  private dispose(): void {
    RunDetailPanel.panels.delete(this.runId);
    this.stopPolling();
    this.panel.dispose();
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables = [];
  }
}

function getNonce(): string {
  let text = "";
  const possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
