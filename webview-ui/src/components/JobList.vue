<script setup lang="ts">
import { ref } from "vue";
import type { WorkflowJob } from "../types";
import StepList from "./StepList.vue";
import { vscode } from "../utilities/vscode";

defineProps<{
  jobs: WorkflowJob[];
}>();

const expandedJobs = ref<Set<number>>(new Set());

function toggleJob(jobId: number) {
  if (expandedJobs.value.has(jobId)) {
    expandedJobs.value.delete(jobId);
  } else {
    expandedJobs.value.add(jobId);
  }
}

function getStatusClass(status: string | null, conclusion: string | null): string {
  if (status === "completed") return `icon-${conclusion || "unknown"}`;
  return `icon-${status || "unknown"}`;
}

function formatDuration(start: string | null, end: string | null): string {
  if (!start) return "";
  const startTime = new Date(start).getTime();
  const endTime = end ? new Date(end).getTime() : Date.now();
  const seconds = Math.floor((endTime - startTime) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainSec = seconds % 60;
  if (minutes < 60) return `${minutes}m ${remainSec}s`;
  const hours = Math.floor(minutes / 60);
  const remainMin = minutes % 60;
  return `${hours}h ${remainMin}m`;
}

function viewLogs(jobId: number) {
  vscode.postMessage({ command: "viewJobLogs", jobId });
}

function openInBrowser(url: string) {
  vscode.postMessage({ command: "openInBrowser", url });
}
</script>

<template>
  <div class="job-list">
    <h2 class="section-title">Jobs ({{ jobs.length }})</h2>

    <div v-if="jobs.length === 0" class="empty">No jobs found</div>

    <div v-for="job in jobs" :key="job.id" class="job-card">
      <div class="job-header" @click="toggleJob(job.id)">
        <span class="expand-icon">{{ expandedJobs.has(job.id) ? "▼" : "▶" }}</span>
        <span :class="['status-icon', getStatusClass(job.status, job.conclusion)]">
          ●
        </span>
        <span class="job-name">{{ job.name }}</span>
        <span class="job-meta">
          <span v-if="job.runner_name" class="runner">{{ job.runner_name }}</span>
          <span class="duration">{{ formatDuration(job.started_at, job.completed_at) }}</span>
        </span>
        <div class="job-actions">
          <button class="icon-btn" @click.stop="viewLogs(job.id)" title="View Logs">
            📋
          </button>
          <button class="icon-btn" @click.stop="openInBrowser(job.html_url)" title="Open in Browser">
            🔗
          </button>
        </div>
      </div>

      <div v-if="expandedJobs.has(job.id)" class="job-body">
        <div class="job-info">
          <span v-if="job.labels.length > 0" class="labels">
            Labels: {{ job.labels.join(", ") }}
          </span>
        </div>
        <StepList v-if="job.steps && job.steps.length > 0" :steps="job.steps" />
        <div v-else class="empty">No steps available</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.job-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.section-title {
  font-size: 1.1em;
  font-weight: 600;
  color: var(--vscode-foreground);
  margin-bottom: 4px;
}

.job-card {
  border: 1px solid var(--vscode-panel-border);
  border-radius: 4px;
  overflow: hidden;
}

.job-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  cursor: pointer;
  background: var(--vscode-editor-background);
  transition: background 0.1s;
}

.job-header:hover {
  background: var(--vscode-list-hoverBackground);
}

.expand-icon {
  font-size: 0.7em;
  color: var(--vscode-descriptionForeground);
  width: 12px;
}

.status-icon {
  font-size: 0.9em;
}

.icon-success { color: #3fb950; }
.icon-failure { color: #f85149; }
.icon-cancelled { color: #8b949e; }
.icon-skipped { color: #8b949e; }
.icon-in_progress { color: #d29922; }
.icon-queued, .icon-waiting, .icon-pending { color: #d29922; }

.job-name {
  font-weight: 500;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.job-meta {
  display: flex;
  gap: 8px;
  font-size: 0.85em;
  color: var(--vscode-descriptionForeground);
  white-space: nowrap;
}

.runner {
  opacity: 0.7;
}

.job-actions {
  display: flex;
  gap: 4px;
}

.icon-btn {
  background: none;
  border: none;
  cursor: pointer;
  padding: 2px 4px;
  font-size: 0.85em;
  border-radius: 2px;
  opacity: 0.7;
}

.icon-btn:hover {
  opacity: 1;
  background: var(--vscode-toolbar-hoverBackground);
}

.job-body {
  padding: 0 12px 12px;
  border-top: 1px solid var(--vscode-panel-border);
}

.job-info {
  padding: 8px 0 4px;
  font-size: 0.85em;
  color: var(--vscode-descriptionForeground);
}

.labels {
  font-size: 0.85em;
}

.empty {
  padding: 12px;
  color: var(--vscode-descriptionForeground);
  font-style: italic;
}
</style>
