<script lang="ts">
/** How long the result line stays. */
export const RESULT_MS = 4000;
</script>

<script setup lang="ts">
import { onUnmounted, ref } from "vue";
import ConfirmButton from "./ConfirmButton.vue";
import { CLOCK, MARKS, useInjected } from "../lib/keys.js";
import {
  countsText,
  exportDocument,
  exportFileName,
  parseMarks,
  reportText,
  type MarksDocument,
} from "../lib/marks.js";

/** Export and import of the whole marks document, at the foot of the overlay's rail. */
const store = useInjected(MARKS);
const clock = useInjected(CLOCK);

/** A file read and parsed, waiting for Merge or Replace. */
const picked = ref<{ name: string; doc: MarksDocument } | null>(null);
const result = ref<string | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);
let timer: ReturnType<typeof setTimeout> | null = null;

function clearTimer(): void {
  if (timer !== null) clearTimeout(timer);
  timer = null;
}
function report(text: string): void {
  picked.value = null;
  result.value = text;
  clearTimer();
  timer = setTimeout(() => {
    result.value = null;
    timer = null;
  }, RESULT_MS);
}

function exportAll(): void {
  const now = clock.now.value;
  const blob = new Blob([exportDocument(store.document(), now)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = exportFileName(now);
  a.click();
  URL.revokeObjectURL(url);
}

function chooseFile(): void {
  fileInput.value?.click();
}
async function onFile(e: Event): Promise<void> {
  const input = e.target instanceof HTMLInputElement ? e.target : null;
  const file = input?.files?.[0];
  if (input === null || file === undefined) return;
  const doc = parseMarks(await file.text());
  input.value = "";
  if (doc.marks.length === 0 && doc.groups.length === 0) {
    report("Not a marks file");
    return;
  }
  result.value = null;
  picked.value = { name: file.name, doc };
}
function merge(doc: MarksDocument): void {
  report(reportText(store.merge(doc)));
}
function replace(doc: MarksDocument): void {
  store.replaceAll(doc);
  report(`Replaced with ${countsText(doc)}`);
}
function cancel(): void {
  picked.value = null;
}
onUnmounted(clearTimer);
</script>

<template>
  <div class="marks-io">
    <div v-if="picked !== null" class="io-strip">
      <span class="io-facts">{{ picked.name }}: {{ countsText(picked.doc) }}</span>
      <span class="io-actions">
        <button
          type="button"
          class="merge"
          title="Add what is missing, keep everything here"
          @click="merge(picked.doc)"
        >
          Merge
        </button>
        <ConfirmButton class="replace" label="Replace" @confirm="replace(picked.doc)" />
        <button type="button" class="cancel" @click="cancel">Cancel</button>
      </span>
    </div>
    <template v-else>
      <div v-if="result !== null" class="io-result" role="status">{{ result }}</div>
      <div class="io-buttons">
        <button
          type="button"
          class="export"
          title="Download every mark and group as a JSON file"
          @click="exportAll"
        >
          Export
        </button>
        <button
          type="button"
          class="import"
          title="Read a marks file and merge or replace"
          @click="chooseFile"
        >
          Import
        </button>
        <input
          ref="fileInput"
          type="file"
          accept="application/json,.json"
          class="io-file"
          aria-label="Marks file"
          @change="onFile"
        />
      </div>
    </template>
  </div>
</template>
