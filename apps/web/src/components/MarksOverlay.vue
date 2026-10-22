<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import ConfirmButton from "./ConfirmButton.vue";
import MarkMatrix from "./MarkMatrix.vue";
import MarkPanels from "./MarkPanels.vue";
import MarkRow from "./MarkRow.vue";
import { MARKS, MARKS_NAV, useInjected } from "../lib/keys.js";
import { ALL_GROUP, MARK_TERMS, NAME_MAX, type MarkView } from "../lib/marks.js";
import { compareTitle } from "../lib/matrix.js";

/** The full-screen manager for marked views: groups in a rail, marks as rows or as stacked panels. */
const store = useInjected(MARKS);
const nav = useInjected(MARKS_NAV);

const state = computed(() => nav.overlay.value ?? { group: ALL_GROUP, mode: "list" });
const view = computed(() => store.view(state.value.group));
// An id the store does not know (a deleted group, a stale link) falls back to All.
watch(
  view,
  (v) => {
    if (v === null) nav.list(ALL_GROUP);
  },
  { immediate: true },
);

const closeBtn = ref<HTMLButtonElement | null>(null);
/** The main area's inner width, so the Compare tooltip can say whether the grid will fit. */
const MAIN_PAD_PX = 32;
const mainEl = ref<HTMLElement | null>(null);
const mainWidth = ref(0);
function measure(): void {
  mainWidth.value = mainEl.value?.clientWidth ?? 0;
}
const adding = ref(false);
const newName = ref("");
const newInput = ref<HTMLInputElement | null>(null);
/** The id of the group being renamed, or null. */
const renaming = ref<string | null>(null);
const groupName = ref("");
const groupInput = ref<HTMLInputElement | null>(null);

async function beginAdd(): Promise<void> {
  newName.value = "";
  adding.value = true;
  await nextTick();
  newInput.value?.focus();
}
function onAddKey(e: KeyboardEvent): void {
  if (e.key === "Enter") {
    const g = store.addGroup(newName.value);
    adding.value = false;
    nav.list(g.id);
  } else if (e.key === "Escape") {
    e.stopPropagation();
    adding.value = false;
  }
}
async function beginRename(v: MarkView): Promise<void> {
  groupName.value = v.name;
  renaming.value = v.id;
  await nextTick();
  groupInput.value?.select();
}
function onRenameKey(e: KeyboardEvent, id: string): void {
  if (e.key === "Enter") {
    store.renameGroup(id, groupName.value);
    renaming.value = null;
  } else if (e.key === "Escape") {
    e.stopPropagation();
    renaming.value = null;
  }
}
function removeGroup(v: MarkView): void {
  store.removeGroup(v.id);
  nav.list(ALL_GROUP);
}
function onKey(e: KeyboardEvent): void {
  if (e.key !== "Escape") return;
  if (e.target instanceof HTMLElement && e.target.dataset.keep !== undefined) return;
  nav.close();
}
onMounted(async () => {
  document.body.classList.add("marks-open");
  document.addEventListener("keydown", onKey);
  window.addEventListener("resize", measure);
  closeBtn.value?.focus();
  await nextTick();
  measure();
});
onUnmounted(() => {
  document.body.classList.remove("marks-open");
  document.removeEventListener("keydown", onKey);
  window.removeEventListener("resize", measure);
});
</script>

<template>
  <div class="marks-scrim" @click="nav.close()"></div>
  <section class="marks" role="dialog" aria-modal="true" aria-labelledby="marks-title">
    <div class="marks-head">
      <h2 id="marks-title">{{ MARK_TERMS.title }}</h2>
      <button
        ref="closeBtn"
        type="button"
        class="marks-close"
        aria-label="Close marked events"
        @click="nav.close()"
      >
        ×
      </button>
    </div>
    <nav class="marks-rail" :aria-label="MARK_TERMS.groups">
      <button
        type="button"
        :aria-current="state.group === ALL_GROUP ? 'true' : undefined"
        @click="nav.list(ALL_GROUP)"
      >
        {{ MARK_TERMS.all }} · {{ store.marks.value.length }}
      </button>
      <button
        v-for="g in store.groups.value"
        :key="g.id"
        type="button"
        :aria-current="state.group === g.id ? 'true' : undefined"
        @click="nav.list(g.id)"
      >
        {{ g.name }} · {{ g.marks.length }}
      </button>
      <input
        v-if="adding"
        ref="newInput"
        v-model="newName"
        type="text"
        class="newgroup-input"
        data-keep
        :maxlength="NAME_MAX"
        :placeholder="`${MARK_TERMS.group} name`"
        @keydown="onAddKey"
      />
      <button v-else type="button" class="newgroup" @click="beginAdd">
        + New {{ MARK_TERMS.group.toLowerCase() }}
      </button>
    </nav>
    <div v-if="view !== null" ref="mainEl" class="marks-main">
      <MarkPanels v-if="state.mode === 'panels'" :view="view" />
      <MarkMatrix v-else-if="state.mode === 'matrix'" :view="view" />
      <template v-else>
        <div class="marks-grouphead">
          <input
            v-if="renaming !== null"
            ref="groupInput"
            v-model="groupName"
            type="text"
            class="gname-input"
            data-keep
            :maxlength="NAME_MAX"
            aria-label="Group name"
            @keydown="onRenameKey($event, renaming)"
          />
          <button
            v-else
            type="button"
            class="gname"
            :disabled="view.virtual"
            :title="view.virtual ? undefined : 'Rename'"
            @click="beginRename(view)"
          >
            {{ view.name }}
          </button>
          <span class="sp"></span>
          <button
            type="button"
            class="showevents"
            :disabled="view.marks.length === 0"
            @click="nav.show(view.id)"
          >
            Show events
          </button>
          <button
            type="button"
            class="compare"
            :disabled="view.marks.length < 2"
            :title="compareTitle(view.marks.length, mainWidth - MAIN_PAD_PX)"
            @click="nav.compare(view.id)"
          >
            Compare
          </button>
          <ConfirmButton
            v-if="!view.virtual"
            class="delgroup"
            label="Delete group"
            @confirm="removeGroup(view)"
          />
        </div>
        <p v-if="view.marks.length === 0 && view.virtual" class="note">
          Nothing marked yet. Open an event or a volcano and use ☆ {{ MARK_TERMS.verb }} under its
          name.
        </p>
        <p v-else-if="view.marks.length === 0" class="note">
          No marks in this group yet. Add some from the chips on each mark in {{ MARK_TERMS.all }}.
        </p>
        <MarkRow
          v-for="(m, i) in view.marks"
          :key="m.id"
          :mark="m"
          :group="view.id"
          :first="i === 0"
          :last="i === view.marks.length - 1"
        />
      </template>
    </div>
  </section>
</template>
