import { Octokit } from "@octokit/rest";
import * as vscode from "vscode";
import type {
  RepoInfo,
  Workflow,
  WorkflowRun,
  WorkflowJob,
  WorkflowDispatchConfig,
  WorkflowDispatchInput,
} from "./types.js";

export class GitHubApiService {
  private octokit: Octokit | null = null;
  private _onDidChangeAuth = new vscode.EventEmitter<void>();
  readonly onDidChangeAuth = this._onDidChangeAuth.event;
  private outputChannel: vscode.OutputChannel;

  constructor(private context: vscode.ExtensionContext) {
    this.outputChannel = vscode.window.createOutputChannel("GitHub Actions");
  }

  async ensureAuthenticated(): Promise<Octokit> {
    if (this.octokit) {
      return this.octokit;
    }

    // Try VS Code's built-in GitHub authentication first
    try {
      const session = await vscode.authentication.getSession("github", ["repo"], {
        createIfNone: true,
      });
      if (session) {
        this.octokit = new Octokit({ auth: session.accessToken });
        this._onDidChangeAuth.fire();
        return this.octokit;
      }
    } catch {
      // Fall through to stored token
    }

    // Try stored token
    const storedToken = await this.context.secrets.get("github-actions.token");
    if (storedToken) {
      this.octokit = new Octokit({ auth: storedToken });
      this._onDidChangeAuth.fire();
      return this.octokit;
    }

    throw new Error(
      'Not authenticated. Use "GitHub Actions: Set GitHub Token" or sign in with GitHub.'
    );
  }

  async setToken(token: string): Promise<void> {
    await this.context.secrets.store("github-actions.token", token);
    this.octokit = new Octokit({ auth: token });
    this._onDidChangeAuth.fire();
  }

  async clearAuth(): Promise<void> {
    await this.context.secrets.delete("github-actions.token");
    this.octokit = null;
    this._onDidChangeAuth.fire();
  }

  // ── Repository Detection ──────────────────────────────────────────

  async detectRepository(): Promise<RepoInfo | null> {
    const log = this.outputChannel;

    const gitExtension = vscode.extensions.getExtension("vscode.git");
    if (!gitExtension) {
      log.appendLine("[detectRepository] vscode.git extension not found");
      return null;
    }

    const git = gitExtension.isActive
      ? gitExtension.exports
      : await gitExtension.activate();
    const gitApi = git.getAPI(1);

    log.appendLine(
      `[detectRepository] git API ready, repos: ${gitApi.repositories.length}`
    );

    // Git extension may not have loaded repos yet — wait for one
    if (gitApi.repositories.length === 0) {
      log.appendLine("[detectRepository] waiting for repository to open...");
      const opened = await new Promise<boolean>((resolve) => {
        const timeout = setTimeout(() => {
          disposable.dispose();
          resolve(false);
        }, 10000);

        const disposable = gitApi.onDidOpenRepository(() => {
          clearTimeout(timeout);
          disposable.dispose();
          resolve(true);
        });
      });

      if (!opened || gitApi.repositories.length === 0) {
        log.appendLine("[detectRepository] timed out waiting for repository");
        return null;
      }
      log.appendLine(
        `[detectRepository] repository opened, repos: ${gitApi.repositories.length}`
      );
    }

    const repo = gitApi.repositories[0];

    // Remotes may not be loaded yet — wait for state change
    if (repo.state.remotes.length === 0) {
      log.appendLine("[detectRepository] remotes empty, waiting for state change...");
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          disposable.dispose();
          resolve();
        }, 10000);

        const disposable = repo.state.onDidChange(() => {
          if (repo.state.remotes.length > 0) {
            clearTimeout(timeout);
            disposable.dispose();
            resolve();
          }
        });
      });
    }

    const remotes = repo.state.remotes;
    log.appendLine(
      `[detectRepository] remotes: ${remotes.map((r: { name: string }) => r.name).join(", ")}`
    );

    const origin = remotes.find(
      (r: { name: string }) => r.name === "origin"
    );
    if (!origin) {
      log.appendLine("[detectRepository] no 'origin' remote found");
      return null;
    }

    const url: string = origin.fetchUrl || origin.pushUrl || "";
    log.appendLine(`[detectRepository] origin URL: ${url}`);
    const result = this.parseGitHubUrl(url);
    log.appendLine(
      `[detectRepository] parsed: ${result ? `${result.owner}/${result.repo}` : "null"}`
    );
    return result;
  }

  parseGitHubUrl(url: string): RepoInfo | null {
    // SSH: git@github.com:owner/repo.git
    const sshMatch = url.match(/git@github\.com:([^/]+)\/([^/.]+)/);
    if (sshMatch) {
      return { owner: sshMatch[1], repo: sshMatch[2] };
    }

    // HTTPS: https://github.com/owner/repo.git
    const httpsMatch = url.match(
      /https?:\/\/github\.com\/([^/]+)\/([^/.]+)/
    );
    if (httpsMatch) {
      return { owner: httpsMatch[1], repo: httpsMatch[2] };
    }

    return null;
  }

  // ── Workflows ─────────────────────────────────────────────────────

  async listWorkflows(repo: RepoInfo): Promise<Workflow[]> {
    const octokit = await this.ensureAuthenticated();
    const result: Workflow[] = [];
    let page = 1;

    while (true) {
      const response = await octokit.actions.listRepoWorkflows({
        owner: repo.owner,
        repo: repo.repo,
        per_page: 100,
        page,
      });

      result.push(...(response.data.workflows as Workflow[]));

      if (result.length >= response.data.total_count) {
        break;
      }
      page++;
    }

    return result;
  }

  async getWorkflow(
    repo: RepoInfo,
    workflowId: number
  ): Promise<Workflow> {
    const octokit = await this.ensureAuthenticated();
    const response = await octokit.actions.getWorkflow({
      owner: repo.owner,
      repo: repo.repo,
      workflow_id: workflowId,
    });
    return response.data as Workflow;
  }

  // ── Workflow Runs ─────────────────────────────────────────────────

  async listWorkflowRuns(
    repo: RepoInfo,
    opts?: { workflowId?: number; perPage?: number; branch?: string }
  ): Promise<WorkflowRun[]> {
    const octokit = await this.ensureAuthenticated();

    const params: Record<string, unknown> = {
      owner: repo.owner,
      repo: repo.repo,
      per_page: opts?.perPage ?? 20,
    };

    if (opts?.branch) {
      params.branch = opts.branch;
    }

    let response;
    if (opts?.workflowId) {
      params.workflow_id = opts.workflowId;
      response = await octokit.actions.listWorkflowRuns(params as Parameters<typeof octokit.actions.listWorkflowRuns>[0]);
    } else {
      response = await octokit.actions.listWorkflowRunsForRepo(params as Parameters<typeof octokit.actions.listWorkflowRunsForRepo>[0]);
    }

    return response.data.workflow_runs as WorkflowRun[];
  }

  async getWorkflowRun(
    repo: RepoInfo,
    runId: number
  ): Promise<WorkflowRun> {
    const octokit = await this.ensureAuthenticated();
    const response = await octokit.actions.getWorkflowRun({
      owner: repo.owner,
      repo: repo.repo,
      run_id: runId,
    });
    return response.data as WorkflowRun;
  }

  // ── Jobs ──────────────────────────────────────────────────────────

  async listJobsForRun(
    repo: RepoInfo,
    runId: number
  ): Promise<WorkflowJob[]> {
    const octokit = await this.ensureAuthenticated();
    const response = await octokit.actions.listJobsForWorkflowRun({
      owner: repo.owner,
      repo: repo.repo,
      run_id: runId,
      per_page: 100,
    });
    return response.data.jobs as WorkflowJob[];
  }

  async getJobLogs(
    repo: RepoInfo,
    jobId: number
  ): Promise<string> {
    const octokit = await this.ensureAuthenticated();
    const response = await octokit.actions.downloadJobLogsForWorkflowRun({
      owner: repo.owner,
      repo: repo.repo,
      job_id: jobId,
    });
    return response.data as unknown as string;
  }

  // ── Workflow Dispatch ─────────────────────────────────────────────

  async getWorkflowDispatchInputs(
    repo: RepoInfo,
    workflowPath: string,
    ref: string
  ): Promise<WorkflowDispatchConfig | null> {
    try {
      const octokit = await this.ensureAuthenticated();
      const response = await octokit.repos.getContent({
        owner: repo.owner,
        repo: repo.repo,
        path: workflowPath,
        ref,
      });

      const data = response.data;
      if (!("content" in data)) {
        return null;
      }

      const content = Buffer.from(data.content, "base64").toString("utf-8");
      return this.parseWorkflowDispatchInputs(content);
    } catch {
      return null;
    }
  }

  parseWorkflowDispatchInputs(
    yamlContent: string
  ): WorkflowDispatchConfig | null {
    // Simple YAML parser for workflow_dispatch inputs
    const lines = yamlContent.split("\n");
    let inWorkflowDispatch = false;
    let inInputs = false;
    let currentInput: string | null = null;
    const inputs: Record<string, WorkflowDispatchInput> = {};

    let dispatchIndent = 0;
    let inputsIndent = 0;
    let inputNameIndent = 0;

    for (const line of lines) {
      const trimmed = line.trimEnd();
      if (trimmed === "" || trimmed.startsWith("#")) {
        continue;
      }

      const indent = line.length - line.trimStart().length;

      if (trimmed.includes("workflow_dispatch:")) {
        inWorkflowDispatch = true;
        dispatchIndent = indent;
        continue;
      }

      if (inWorkflowDispatch && !inInputs) {
        if (indent <= dispatchIndent && !trimmed.startsWith("#")) {
          inWorkflowDispatch = false;
          continue;
        }
        if (trimmed.trimStart().startsWith("inputs:")) {
          inInputs = true;
          inputsIndent = indent;
          continue;
        }
      }

      if (inInputs) {
        if (indent <= inputsIndent) {
          inInputs = false;
          inWorkflowDispatch = false;
          continue;
        }

        const keyMatch = trimmed.match(/^(\s*)(\w[\w-]*)\s*:/);
        if (keyMatch && indent === inputsIndent + 2) {
          // This is an input name
          currentInput = keyMatch[2];
          inputNameIndent = indent;
          inputs[currentInput] = {
            name: currentInput,
            description: "",
            required: false,
          };
          continue;
        }

        if (currentInput && indent > inputNameIndent) {
          const propMatch = trimmed
            .trimStart()
            .match(/^(description|required|default|type)\s*:\s*(.*)$/);
          if (propMatch) {
            const [, key, rawVal] = propMatch;
            const val = rawVal.replace(/^['"]|['"]$/g, "").trim();
            const input = inputs[currentInput];

            switch (key) {
              case "description":
                input.description = val;
                break;
              case "required":
                input.required = val === "true";
                break;
              case "default":
                input.default = val;
                break;
              case "type":
                input.type = val as WorkflowDispatchInput["type"];
                break;
            }
          }

          // Parse options for choice type
          if (trimmed.trimStart().startsWith("options:")) {
            inputs[currentInput].options = [];
          } else if (
            inputs[currentInput].options &&
            trimmed.trimStart().startsWith("- ")
          ) {
            const optVal = trimmed
              .trimStart()
              .slice(2)
              .replace(/^['"]|['"]$/g, "")
              .trim();
            inputs[currentInput].options!.push(optVal);
          }
        }
      }
    }

    return { inputs };
  }

  async dispatchWorkflow(
    repo: RepoInfo,
    workflowId: number,
    ref: string,
    inputs?: Record<string, string>
  ): Promise<void> {
    const octokit = await this.ensureAuthenticated();
    await octokit.actions.createWorkflowDispatch({
      owner: repo.owner,
      repo: repo.repo,
      workflow_id: workflowId,
      ref,
      inputs,
    });
  }

  // ── Run Actions ───────────────────────────────────────────────────

  async cancelRun(repo: RepoInfo, runId: number): Promise<void> {
    const octokit = await this.ensureAuthenticated();
    await octokit.actions.cancelWorkflowRun({
      owner: repo.owner,
      repo: repo.repo,
      run_id: runId,
    });
  }

  async rerunWorkflow(repo: RepoInfo, runId: number): Promise<void> {
    const octokit = await this.ensureAuthenticated();
    await octokit.actions.reRunWorkflow({
      owner: repo.owner,
      repo: repo.repo,
      run_id: runId,
    });
  }

  async rerunFailedJobs(repo: RepoInfo, runId: number): Promise<void> {
    const octokit = await this.ensureAuthenticated();
    await octokit.actions.reRunWorkflowFailedJobs({
      owner: repo.owner,
      repo: repo.repo,
      run_id: runId,
    });
  }

  dispose(): void {
    this._onDidChangeAuth.dispose();
    this.outputChannel.dispose();
  }
}
