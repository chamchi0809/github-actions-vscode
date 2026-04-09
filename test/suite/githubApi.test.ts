import * as assert from "assert";
import { GitHubApiService } from "../../src/github/api";

suite("GitHubApiService", () => {
  suite("parseGitHubUrl", () => {
    let service: GitHubApiService;

    setup(() => {
      // Create service with a mock context
      service = new GitHubApiService({
        secrets: {
          get: async () => undefined,
          store: async () => {},
          delete: async () => {},
          onDidChange: { dispose: () => {} } as any,
        },
        subscriptions: [],
      } as any);
    });

    test("should parse SSH URLs", () => {
      const result = service.parseGitHubUrl(
        "git@github.com:owner/repo.git"
      );
      assert.deepStrictEqual(result, { owner: "owner", repo: "repo" });
    });

    test("should parse HTTPS URLs", () => {
      const result = service.parseGitHubUrl(
        "https://github.com/myorg/myrepo.git"
      );
      assert.deepStrictEqual(result, {
        owner: "myorg",
        repo: "myrepo",
      });
    });

    test("should parse HTTPS URLs without .git", () => {
      const result = service.parseGitHubUrl(
        "https://github.com/myorg/myrepo"
      );
      assert.deepStrictEqual(result, {
        owner: "myorg",
        repo: "myrepo",
      });
    });

    test("should return null for non-GitHub URLs", () => {
      const result = service.parseGitHubUrl(
        "https://gitlab.com/owner/repo.git"
      );
      assert.strictEqual(result, null);
    });

    test("should handle SSH URLs with special characters in repo name", () => {
      const result = service.parseGitHubUrl(
        "git@github.com:my-org/my-repo.git"
      );
      assert.deepStrictEqual(result, {
        owner: "my-org",
        repo: "my-repo",
      });
    });
  });

  suite("parseWorkflowDispatchInputs", () => {
    let service: GitHubApiService;

    setup(() => {
      service = new GitHubApiService({
        secrets: {
          get: async () => undefined,
          store: async () => {},
          delete: async () => {},
          onDidChange: { dispose: () => {} } as any,
        },
        subscriptions: [],
      } as any);
    });

    test("should parse basic workflow_dispatch inputs", () => {
      const yaml = `
name: Deploy
on:
  workflow_dispatch:
    inputs:
      environment:
        description: 'Target environment'
        required: true
        default: 'staging'
        type: string
      debug:
        description: 'Enable debug mode'
        required: false
        type: boolean
`;
      const config = service.parseWorkflowDispatchInputs(yaml);
      assert.ok(config);
      assert.ok(config.inputs.environment);
      assert.strictEqual(
        config.inputs.environment.description,
        "Target environment"
      );
      assert.strictEqual(config.inputs.environment.required, true);
      assert.strictEqual(config.inputs.environment.default, "staging");
      assert.strictEqual(config.inputs.environment.type, "string");

      assert.ok(config.inputs.debug);
      assert.strictEqual(
        config.inputs.debug.description,
        "Enable debug mode"
      );
      assert.strictEqual(config.inputs.debug.required, false);
      assert.strictEqual(config.inputs.debug.type, "boolean");
    });

    test("should parse choice type inputs with options", () => {
      const yaml = `
name: Build
on:
  workflow_dispatch:
    inputs:
      target:
        description: 'Build target'
        type: choice
        options:
          - development
          - staging
          - production
`;
      const config = service.parseWorkflowDispatchInputs(yaml);
      assert.ok(config);
      assert.ok(config.inputs.target);
      assert.strictEqual(config.inputs.target.type, "choice");
      assert.deepStrictEqual(config.inputs.target.options, [
        "development",
        "staging",
        "production",
      ]);
    });

    test("should return empty inputs when no workflow_dispatch", () => {
      const yaml = `
name: CI
on:
  push:
    branches: [main]
`;
      const config = service.parseWorkflowDispatchInputs(yaml);
      assert.ok(config);
      assert.deepStrictEqual(config.inputs, {});
    });

    test("should handle workflow_dispatch without inputs", () => {
      const yaml = `
name: Simple
on:
  workflow_dispatch:
jobs:
  build:
    runs-on: ubuntu-latest
`;
      const config = service.parseWorkflowDispatchInputs(yaml);
      assert.ok(config);
      assert.deepStrictEqual(config.inputs, {});
    });
  });
});
