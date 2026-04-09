import * as vscode from "vscode";

export function getPollingInterval(): number {
  return (
    vscode.workspace
      .getConfiguration("githubActions")
      .get<number>("pollingInterval") ?? 30
  );
}

export function getMaxRuns(): number {
  return (
    vscode.workspace.getConfiguration("githubActions").get<number>("maxRuns") ??
    20
  );
}

export function getShowNotifications(): boolean {
  return (
    vscode.workspace
      .getConfiguration("githubActions")
      .get<boolean>("showNotifications") ?? true
  );
}
