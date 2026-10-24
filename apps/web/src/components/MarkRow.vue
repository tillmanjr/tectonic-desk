<script setup lang="ts">
import { computed, nextTick, ref } from "vue";
import ConfirmButton from "./ConfirmButton.vue";
import MarkThumb from "./MarkThumb.vue";
import { fmtStamp } from "../lib/format.js";
import { MARKS, MARKS_NAV, useInjected, ZONE } from "../lib/keys.js";
import { NAME_MAX, type Mark } from "../lib/marks.js";

/** One marked view in the overlay list: order buttons, thumbnail, editable name, facts, group chips, open and delete. */
const props = defineProps<{ mark: Mark; group: string; first: boolean; last: boolean }>();
const store = useInjected(MARKS);
const nav = useInjected(MARKS_NAV);
const zone = useInjected(ZONE);

const editing = ref(false);
const draft = ref("");
const input = ref<HTMLInputElement | null>(null);
const members = computed(() => new Set(store.groupsOf(props.mark.id).map((g) => g.id)));
const marked = computed(() => props.mark.createdAt.slice(0, 10));

async function edit(): Promise<void> {
  draft.value = props.mark.name;
  editing.value = true;
  await nextTick();
  input.value?.select();
}
/** Saves the draft; blur after Enter finds the editor already closed. */
function commit(): void {
  if (!editing.value) return;
  store.rename(props.mark.id, draft.value);
  editing.value = false;
}
function onKey(e: KeyboardEvent): void {
  if (e.key === "Enter") commit();
  else if (e.key === "Escape") {
    e.stopPropagation();
    editing.value = false;
  }
}
</script>

<template>
  <div class="markrow-item">
    <div class="morder">
      <button
        type="button"
        class="up"
        :disabled="first"
        aria-label="Move up"
        @click="store.move(group, mark.id, -1)"
      >
        ▲
      </button>
      <button
        type="button"
        class="down"
        :disabled="last"
        aria-label="Move down"
        @click="store.move(group, mark.id, 1)"
      >
        ▼
      </button>
    </div>
    <MarkThumb :lon="mark.lon" :lat="mark.lat" :frame="mark.frame" :kind="mark.kind" />
    <div class="mbody">
      <input
        v-if="editing"
        ref="input"
        v-model="draft"
        type="text"
        class="mname-input"
        data-keep
        :maxlength="NAME_MAX"
        aria-label="Mark name"
        @keydown="onKey"
        @blur="commit"
      />
      <button v-else type="button" class="mname" title="Rename" @click="edit">
        {{ mark.name }}
      </button>
      <div class="mfacts">
        {{ mark.headline }} · {{ mark.sub
        }}<template v-if="mark.stamp !== null"> · {{ fmtStamp(mark.stamp, zone) }}</template>
      </div>
      <div class="mmeta">marked {{ marked }}</div>
      <div class="mgroups">
        <span v-if="store.groups.value.length === 0" class="muted">no groups yet</span>
        <button
          v-for="g in store.groups.value"
          :key="g.id"
          type="button"
          class="chip"
          :aria-pressed="members.has(g.id)"
          @click="store.setMember(mark.id, g.id, !members.has(g.id))"
        >
          {{ g.name }}
        </button>
      </div>
    </div>
    <div class="mactions">
      <button
        type="button"
        class="openhere"
        title="Select it in the view you were in"
        @click="nav.openHere(mark)"
      >
        Open here
      </button>
      <button type="button" class="openview" @click="nav.goTo(mark.url)">Open view</button>
      <ConfirmButton label="Delete" @confirm="store.remove(mark.id)" />
    </div>
  </div>
</template>
