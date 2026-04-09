<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import RunDetail from "./components/RunDetail.vue";
import type { WorkflowRun, WorkflowJob } from "./types";

const run = ref<WorkflowRun | null>(null);
const jobs = ref<WorkflowJob[]>([]);
const error = ref<string | null>(null);
const loading = ref(true);

function handleMessage(event: MessageEvent) {
  const message = event.data;
  switch (message.type) {
    case "update":
      run.value = message.data.run;
      jobs.value = message.data.jobs;
      loading.value = false;
      error.value = null;
      break;
    case "error":
      error.value = message.message;
      loading.value = false;
      break;
  }
}

onMounted(() => {
  window.addEventListener("message", handleMessage);
});

onUnmounted(() => {
  window.removeEventListener("message", handleMessage);
});
</script>

<template>
  <div class="app">
    <div v-if="loading" class="loading">
      <div class="spinner"></div>
      <p>Loading workflow run details...</p>
    </div>
    <div v-else-if="error" class="error-container">
      <span class="codicon codicon-error"></span>
      <p>{{ error }}</p>
    </div>
    <RunDetail v-else-if="run" :run="run" :jobs="jobs" />
  </div>
</template>

<style>
:root {
  font-family: var(--vscode-font-family);
  font-size: var(--vscode-font-size);
  color: var(--vscode-foreground);
  background-color: var(--vscode-editor-background);
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  padding: 16px;
}

.app {
  max-width: 900px;
  margin: 0 auto;
}

.loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px;
  gap: 12px;
  color: var(--vscode-descriptionForeground);
}

.spinner {
  width: 24px;
  height: 24px;
  border: 2px solid var(--vscode-progressBar-background);
  border-top: 2px solid transparent;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.error-container {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  background: var(--vscode-inputValidation-errorBackground);
  border: 1px solid var(--vscode-inputValidation-errorBorder);
  border-radius: 4px;
  color: var(--vscode-errorForeground);
}
</style>
