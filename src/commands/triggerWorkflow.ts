import * as vscode from "vscode";
import type { GitHubApiService } from "../github/api.js";
import type { RepoInfo, Workflow, WorkflowDispatchInput } from "../github/types.js";
import type { WorkflowTreeItem } from "../providers/treeItems.js";

export async function triggerWorkflow(
  api: GitHubApiService,
  repo: RepoInfo,
  item?: WorkflowTreeItem
): Promise<number | undefined> {
  let workflow: Workflow;

  if (item) {
    workflow = item.workflow;
  } else {
    // Let user pick a workflow
    const workflows = await api.listWorkflows(repo);
    const picked = await vscode.window.showQuickPick(
      workflows.map((w) => ({
        label: w.name,
        description: w.path,
        workflow: w,
      })),
      { placeHolder: "Select a workflow to trigger" }
    );
    if (!picked) {
      return undefined;
    }
    workflow = picked.workflow;
  }

  // Ask for ref (branch/tag)
  const ref = await vscode.window.showInputBox({
    prompt: "Enter the branch or tag to run the workflow on",
    value: "main",
    placeHolder: "main",
  });

  if (!ref) {
    return undefined;
  }

  // Get workflow dispatch inputs
  const config = await api.getWorkflowDispatchInputs(
    repo,
    workflow.path,
    ref
  );

  let inputs: Record<string, string> | undefined;

  if (config && Object.keys(config.inputs).length > 0) {
    inputs = await collectInputs(config.inputs);
    if (inputs === undefined) {
      return undefined; // User cancelled
    }
  }

  try {
    await api.dispatchWorkflow(repo, workflow.id, ref, inputs);
    vscode.window.showInformationMessage(
      `Workflow "${workflow.name}" triggered on ${ref}`
    );

    // Wait briefly then try to find the new run
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const runs = await api.listWorkflowRuns(repo, {
      workflowId: workflow.id,
      perPage: 1,
    });

    if (runs.length > 0 && runs[0].event === "workflow_dispatch") {
      return runs[0].id;
    }

    return undefined;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(
      `Failed to trigger workflow: ${msg}`
    );
    return undefined;
  }
}

async function collectInputs(
  inputDefs: Record<string, WorkflowDispatchInput>
): Promise<Record<string, string> | undefined> {
  const result: Record<string, string> = {};

  for (const [name, def] of Object.entries(inputDefs)) {
    let value: string | undefined;

    if (def.type === "boolean") {
      const picked = await vscode.window.showQuickPick(["true", "false"], {
        placeHolder: `${name}: ${def.description || "boolean input"}`,
      });
      if (picked === undefined) {
        return undefined;
      }
      value = picked;
    } else if (def.type === "choice" && def.options) {
      const picked = await vscode.window.showQuickPick(def.options, {
        placeHolder: `${name}: ${def.description || "select an option"}`,
      });
      if (picked === undefined) {
        return undefined;
      }
      value = picked;
    } else {
      value = await vscode.window.showInputBox({
        prompt: `${name}${def.required ? " (required)" : ""}: ${def.description || ""}`,
        value: def.default || "",
        placeHolder: def.default || "",
        validateInput: (v) => {
          if (def.required && !v) {
            return `${name} is required`;
          }
          return null;
        },
      });
      if (value === undefined) {
        return undefined;
      }
    }

    if (value) {
      result[name] = value;
    }
  }

  return result;
}
