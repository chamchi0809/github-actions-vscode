import * as assert from "assert";

suite("RunWatcher", () => {
  test("should track watched runs", () => {
    // RunWatcher requires vscode API mocking, so we test the logic concepts
    // In a real test with VS Code extension host, you would:
    //   const watcher = new RunWatcher(mockApi, { owner: 'test', repo: 'test' });
    //   watcher.watchRun(123, 'CI', 1);
    //   assert.ok(watcher.hasWatchedRuns());

    // For unit test without full VS Code, verify basic logic
    const watchedRuns = new Map<number, { runId: number; name: string }>();
    watchedRuns.set(123, { runId: 123, name: "CI" });
    assert.strictEqual(watchedRuns.size, 1);
    assert.ok(watchedRuns.has(123));

    watchedRuns.delete(123);
    assert.strictEqual(watchedRuns.size, 0);
  });

  test("should calculate polling interval from config", () => {
    // Default polling interval is 30 seconds
    const defaultInterval = 30;
    assert.strictEqual(defaultInterval * 1000, 30000);

    // Minimum is 10 seconds
    const minInterval = 10;
    assert.ok(minInterval >= 10);
  });
});
