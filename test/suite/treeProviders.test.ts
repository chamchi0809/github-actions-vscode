import * as assert from "assert";
import * as vscode from "vscode";
import {
  WorkflowTreeItem,
  WorkflowRunTreeItem,
  JobTreeItem,
  StepTreeItem,
  MessageTreeItem,
} from "../../src/providers/treeItems";
import type {
  Workflow,
  WorkflowRun,
  WorkflowJob,
  JobStep,
} from "../../src/github/types";

suite("TreeItems", () => {
  suite("WorkflowTreeItem", () => {
    test("should create tree item for active workflow", () => {
      const workflow: Workflow = {
        id: 1,
        name: "CI Pipeline",
        path: ".github/workflows/ci.yml",
        state: "active",
        html_url: "https://github.com/owner/repo/actions/workflows/ci.yml",
        badge_url: "",
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-06-01T00:00:00Z",
      };

      const item = new WorkflowTreeItem(workflow);
      assert.strictEqual(item.label, "CI Pipeline");
      assert.strictEqual(
        item.collapsibleState,
        vscode.TreeItemCollapsibleState.None
      );
      assert.ok(item.contextValue?.includes("workflow"));
    });

    test("should show disabled state", () => {
      const workflow: Workflow = {
        id: 2,
        name: "Deploy",
        path: ".github/workflows/deploy.yml",
        state: "disabled_manually",
        html_url: "",
        badge_url: "",
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-06-01T00:00:00Z",
      };

      const item = new WorkflowTreeItem(workflow);
      assert.ok(item.description?.toString().includes("disabled_manually"));
    });
  });

  suite("WorkflowRunTreeItem", () => {
    const baseRun: WorkflowRun = {
      id: 100,
      name: "CI Pipeline",
      workflow_id: 1,
      head_branch: "main",
      head_sha: "abc1234567890",
      run_number: 42,
      run_attempt: 1,
      event: "push",
      status: "completed",
      conclusion: "success",
      html_url: "https://github.com/owner/repo/actions/runs/100",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      actor: { login: "user", avatar_url: "" },
      display_title: "Fix CI",
    };

    test("should create tree item for successful run", () => {
      const item = new WorkflowRunTreeItem(baseRun);
      assert.strictEqual(item.label, "Fix CI");
      assert.strictEqual(item.contextValue, "run-success");
    });

    test("should create tree item for failed run", () => {
      const failedRun = { ...baseRun, conclusion: "failure" as const };
      const item = new WorkflowRunTreeItem(failedRun);
      assert.strictEqual(item.contextValue, "run-failure");
    });

    test("should create tree item for in-progress run", () => {
      const activeRun = {
        ...baseRun,
        status: "in_progress" as const,
        conclusion: null,
      };
      const item = new WorkflowRunTreeItem(activeRun);
      assert.strictEqual(item.contextValue, "run-in_progress");
    });

    test("should show run number in description", () => {
      const item = new WorkflowRunTreeItem(baseRun);
      assert.ok(item.description?.toString().includes("#42"));
    });
  });

  suite("JobTreeItem", () => {
    test("should create tree item for a job", () => {
      const job: WorkflowJob = {
        id: 200,
        run_id: 100,
        name: "build",
        status: "completed",
        conclusion: "success",
        started_at: "2024-06-01T10:00:00Z",
        completed_at: "2024-06-01T10:05:00Z",
        html_url: "https://github.com/owner/repo/actions/runs/100/jobs/200",
        steps: [],
        runner_name: "ubuntu-latest",
        labels: ["ubuntu-latest"],
      };

      const item = new JobTreeItem(job);
      assert.strictEqual(item.label, "build");
      assert.strictEqual(item.contextValue, "job-success");
    });
  });

  suite("StepTreeItem", () => {
    test("should create tree item for a step", () => {
      const step: JobStep = {
        name: "Run tests",
        status: "completed",
        conclusion: "success",
        number: 3,
        started_at: "2024-06-01T10:01:00Z",
        completed_at: "2024-06-01T10:03:00Z",
      };

      const item = new StepTreeItem(step);
      assert.strictEqual(item.label, "Run tests");
      assert.strictEqual(item.contextValue, "step");
    });
  });

  suite("MessageTreeItem", () => {
    test("should create message tree item", () => {
      const item = new MessageTreeItem("Loading...", "loading~spin");
      assert.strictEqual(item.label, "Loading...");
      assert.strictEqual(item.contextValue, "message");
    });
  });
});
