<script setup lang="ts">
import { computed } from "vue";
import type { WorkflowRun, WorkflowJob } from "../types";
import JobList from "./JobList.vue";
import { vscode } from "../utilities/vscode";

const props = defineProps<{
  run: WorkflowRun;
  jobs: WorkflowJob[];
}>();

const statusClass = computed(() => {
  if (props.run.status === "completed") {
    return `status-${props.run.conclusion || "unknown"}`;
  }
  return `status-${props.run.status || "unknown"}`;
});

const statusText = computed(() => {
  if (props.run.status === "completed") {
    return props.run.conclusion || "completed";
  }
  return props.run.status || "unknown";
});

const isActive = computed(() => {
  return (
    props.run.status === "in_progress" ||
    props.run.status === "queued" ||
    props.run.status === "waiting"
  );
});

const duration = computed(() => {
  const start = new Date(props.run.created_at).getTime();
  const end = props.run.updated_at
    ? new Date(props.run.updated_at).getTime()
    : Date.now();
  const seconds = Math.floor((end - start) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainSec = seconds % 60;
  if (minutes < 60) return `${minutes}m ${remainSec}s`;
  const hours = Math.floor(minutes / 60);
  const remainMin = minutes % 60;
  return `${hours}h ${remainMin}m`;
});

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const seconds = Math.floor((now - then) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function refresh() {
  vscode.postMessage({ command: "refresh" });
}

function cancelRun() {
  vscode.postMessage({ command: "cancelRun" });
}

function rerunWorkflow() {
  vscode.postMessage({ command: "rerunWorkflow" });
}

function rerunFailedJobs() {
  vscode.postMessage({ command: "rerunFailedJobs" });
}

function openInBrowser() {
  vscode.postMessage({ command: "openInBrowser", url: props.run.html_url });
}
</script>

<template>
  <div class="run-detail">
    <!-- Header -->
    <div class="header">
      <div class="header-top">
        <span :class="['status-badge', statusClass]">
          {{ statusText }}
        </span>
        <h1 class="title">{{ run.display_title || run.name || "Workflow Run" }}</h1>
      </div>

      <div class="meta">
        <span class="meta-item">
          <span class="label">#</span>{{ run.run_number }}
        </span>
        <span v-if="run.head_branch" class="meta-item">
          <span class="label">Branch:</span> {{ run.head_branch }}
        </span>
        <span class="meta-item">
          <span class="label">Event:</span> {{ run.event }}
        </span>
        <span class="meta-item">
          <span class="label">Attempt:</span> {{ run.run_attempt }}
        </span>
        <span v-if="run.triggering_actor || run.actor" class="meta-item">
          <span class="label">Actor:</span>
          {{ (run.triggering_actor || run.actor)?.login }}
        </span>
        <span class="meta-item">
          <span class="label">Started:</span> {{ timeAgo(run.created_at) }}
        </span>
        <span class="meta-item">
          <span class="label">Duration:</span> {{ duration }}
        </span>
        <span class="meta-item mono">
          <span class="label">SHA:</span> {{ run.head_sha.slice(0, 7) }}
        </span>
      </div>

      <!-- Actions -->
      <div class="actions">
        <button class="btn" @click="refresh" title="Refresh">
          Refresh
        </button>
        <button v-if="isActive" class="btn btn-danger" @click="cancelRun" title="Cancel">
          Cancel
        </button>
        <button v-if="!isActive" class="btn" @click="rerunWorkflow" title="Rerun">
          Rerun
        </button>
        <button
          v-if="run.conclusion === 'failure'"
          class="btn"
          @click="rerunFailedJobs"
          title="Rerun failed jobs"
        >
          Rerun Failed
        </button>
        <button class="btn btn-secondary" @click="openInBrowser" title="Open in Browser">
          Open in GitHub
        </button>
      </div>
    </div>

    <!-- Jobs -->
    <JobList :jobs="jobs" />
  </div>
</template>

<style scoped>
.run-detail {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.header {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--vscode-panel-border);
}

.header-top {
  display: flex;
  align-items: center;
  gap: 10px;
}

.title {
  font-size: 1.3em;
  font-weight: 600;
  color: var(--vscode-foreground);
  margin: 0;
}

.status-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 0.8em;
  font-weight: 600;
  text-transform: uppercase;
  white-space: nowrap;
}

.status-success {
  background: rgba(35, 134, 54, 0.2);
  color: #3fb950;
}
.status-failure {
  background: rgba(248, 81, 73, 0.2);
  color: #f85149;
}
.status-cancelled {
  background: rgba(139, 148, 158, 0.2);
  color: #8b949e;
}
.status-in_progress {
  background: rgba(187, 128, 9, 0.2);
  color: #d29922;
}
.status-queued,
.status-waiting,
.status-pending {
  background: rgba(187, 128, 9, 0.15);
  color: #d29922;
}
.status-skipped {
  background: rgba(139, 148, 158, 0.15);
  color: #8b949e;
}
.status-timed_out {
  background: rgba(248, 81, 73, 0.15);
  color: #f85149;
}

.meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 16px;
  color: var(--vscode-descriptionForeground);
  font-size: 0.9em;
}

.meta-item .label {
  color: var(--vscode-descriptionForeground);
  opacity: 0.7;
  margin-right: 2px;
}

.mono {
  font-family: var(--vscode-editor-font-family);
}

.actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.btn {
  padding: 4px 12px;
  border: 1px solid var(--vscode-button-border, transparent);
  border-radius: 2px;
  background: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
  font-size: 0.85em;
  cursor: pointer;
  font-family: var(--vscode-font-family);
}

.btn:hover {
  background: var(--vscode-button-hoverBackground);
}

.btn-secondary {
  background: var(--vscode-button-secondaryBackground);
  color: var(--vscode-button-secondaryForeground);
}

.btn-secondary:hover {
  background: var(--vscode-button-secondaryHoverBackground);
}

.btn-danger {
  background: rgba(248, 81, 73, 0.8);
  color: #fff;
}

.btn-danger:hover {
  background: rgba(248, 81, 73, 1);
}
</style>
