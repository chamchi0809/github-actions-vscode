interface VsCodeApi {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

class VsCodeWrapper {
  private readonly vsCodeApi: VsCodeApi;

  constructor() {
    this.vsCodeApi = acquireVsCodeApi();
  }

  postMessage(message: { command: string; [key: string]: unknown }): void {
    this.vsCodeApi.postMessage(message);
  }

  getState<T>(): T | undefined {
    return this.vsCodeApi.getState() as T | undefined;
  }

  setState<T>(state: T): void {
    this.vsCodeApi.setState(state);
  }
}

export const vscode = new VsCodeWrapper();
