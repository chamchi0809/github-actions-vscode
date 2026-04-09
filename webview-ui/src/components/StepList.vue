<script setup lang="ts">
import type { JobStep } from "../types";

defineProps<{
  steps: JobStep[];
}>();

function getStepIcon(conclusion: string | null, status: string): string {
  if (status === "in_progress") return "⏳";
  if (status === "queued") return "🕐";
  switch (conclusion) {
    case "success":
      return "✅";
    case "failure":
      return "❌";
    case "cancelled":
      return "⛔";
    case "skipped":
      return "⏭️";
    default:
      return "⬜";
  }
}

function formatDuration(start: string | null, end: string | null): string {
  if (!start) return "";
  const startTime = new Date(start).getTime();
  const endTime = end ? new Date(end).getTime() : Date.now();
  const seconds = Math.floor((endTime - startTime) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainSec = seconds % 60;
  return `${minutes}m ${remainSec}s`;
}
</script>

<template>
  <div class="step-list">
    <div
      v-for="step in steps"
      :key="step.number"
      :class="['step', step.conclusion === 'failure' ? 'step-failed' : '']"
    >
      <span class="step-icon">{{ getStepIcon(step.conclusion, step.status) }}</span>
      <span class="step-number">{{ step.number }}</span>
      <span class="step-name">{{ step.name }}</span>
      <span class="step-duration">{{ formatDuration(step.started_at, step.completed_at) }}</span>
    </div>
  </div>
</template>

<style scoped>
.step-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-top: 4px;
}

.step {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 8px;
  border-radius: 3px;
  font-size: 0.9em;
}

.step:hover {
  background: var(--vscode-list-hoverBackground);
}

.step-failed {
  background: rgba(248, 81, 73, 0.08);
}

.step-icon {
  width: 18px;
  text-align: center;
  font-size: 0.85em;
}

.step-number {
  color: var(--vscode-descriptionForeground);
  font-size: 0.8em;
  width: 20px;
  text-align: right;
}

.step-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.step-duration {
  font-size: 0.85em;
  color: var(--vscode-descriptionForeground);
  white-space: nowrap;
}
</style>
