<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref } from "vue";
import { MARKS, MARKS_NAV, useInjected } from "../lib/keys.js";
import { defaultName, MARK_TERMS, NAME_MAX, type MarkSubject } from "../lib/marks.js";

/** The row under a panel header that names and saves a mark of the current view. */
const props = defineProps<{ subject: MarkSubject | null }>();
const store = useInjected(MARKS);
const nav = useInjected(MARKS_NAV);
const FLASH_MS = 2000;

/** The subject being named; set when the row opens so a reload mid-edit cannot lose it. */
const pending = ref<MarkSubject | null>(null);
const name = ref("");
const flash = ref(false);
const input = ref<HTMLInputElement | null>(null);
let timer: ReturnType<typeof setTimeout> | null = null;

const count = computed(() =>
  props.subject === null ? 0 : store.countFor(props.subject.kind, props.subject.ref),
);
const title = computed(() =>
  count.value === 0
    ? `${MARK_TERMS.verb} this view`
    : count.value === 1
      ? "Marked once"
      : `Marked ${String(count.value)} times`,
);

async function begin(subject: MarkSubject): Promise<void> {
  pending.value = subject;
  name.value = defaultName(subject);
  await nextTick();
  input.value?.select();
}
function cancel(): void {
  pending.value = null;
}
function save(subject: MarkSubject): void {
  store.add({ ...subject, name: name.value, url: nav.viewUrl.value });
  pending.value = null;
  flash.value = true;
  if (timer !== null) clearTimeout(timer);
  timer = setTimeout(() => {
    flash.value = false;
    timer = null;
  }, FLASH_MS);
}
function onKey(e: KeyboardEvent, subject: MarkSubject): void {
  if (e.key === "Enter") {
    e.stopPropagation();
    save(subject);
  } else if (e.key === "Escape") {
    e.stopPropagation();
    cancel();
  }
}
onUnmounted(() => {
  if (timer !== null) clearTimeout(timer);
});
</script>

<template>
  <div class="markrow">
    <template v-if="pending !== null">
      <input
        ref="input"
        v-model="name"
        type="text"
        :maxlength="NAME_MAX"
        aria-label="Name for this mark"
        @keydown="onKey($event, pending)"
      />
      <button type="button" class="save" @click="save(pending)">Save</button>
      <button type="button" class="cancel" @click="cancel">Cancel</button>
    </template>
    <template v-else-if="subject !== null">
      <button
        type="button"
        class="mark"
        :class="{ marked: count > 0 }"
        :title="title"
        @click="begin(subject)"
      >
        {{ count > 0 ? "★" : "☆" }} {{ MARK_TERMS.verb }}
      </button>
      <span v-if="flash" class="flash">Marked</span>
    </template>
    <button v-else type="button" class="mark" disabled :title="title">
      ☆ {{ MARK_TERMS.verb }}
    </button>
  </div>
</template>
