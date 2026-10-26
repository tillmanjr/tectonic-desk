<script setup lang="ts">
import { computed, ref } from "vue";
import CardGrid from "./CardGrid.vue";
import { ago, fmtStamp } from "../lib/format.js";
import { CLOCK, SPACE, useInjected, ZONE } from "../lib/keys.js";
import { alertKind, alertTitle, type AlertKind } from "../lib/space-format.js";

/**
 * SWPC's alerts, warnings, watches and summaries in the window as a row of cards, newest on the
 * left like the major events and elevated volcanoes; a card opens to its full text.
 */
const props = withDefaults(defineProps<{ rows?: number | null }>(), { rows: null });
const store = useInjected(SPACE);
const clock = useInjected(CLOCK);
const zone = useInjected(ZONE);
const open = ref<string | null>(null);

/** The card's left edge: red for an alert, orange for a warning, yellow for a watch, green for a summary. */
const KIND_COLOUR: Record<AlertKind, string> = {
  alert: "var(--sev-red)",
  warning: "var(--sev-orange)",
  watch: "var(--sev-yellow)",
  summary: "var(--sev-green)",
  other: "var(--line)",
};

const cards = computed(() => {
  const w = store.window.value;
  if (w === null) return [];
  return w.alerts.map((a) => {
    const title = alertTitle(a.message);
    return {
      key: `${a.productId}${a.issueTime}`,
      issued: a.issueTime,
      code: a.productId,
      title,
      kind: alertKind(title),
      message: a.message.replace(/\r\n/g, "\n"),
    };
  });
});

function toggle(key: string): void {
  open.value = open.value === key ? null : key;
}
</script>

<template>
  <CardGrid
    v-slot="{ limit }"
    label="Alerts · SWPC messages"
    :count="cards.length"
    :rows="props.rows"
  >
    <p v-if="cards.length === 0" class="note">No alerts in this window.</p>
    <button
      v-for="c in cards.slice(0, limit ?? cards.length)"
      :key="c.key"
      type="button"
      class="mcard alert"
      :class="{ open: open === c.key }"
      :style="{ '--sevc': KIND_COLOUR[c.kind] }"
      :aria-expanded="open === c.key"
      @click="toggle(c.key)"
    >
      <span class="acode num">{{ c.code }}</span>
      <span>
        <span class="t">{{ c.title }}</span>
        <span class="lines">
          <span class="m">
            {{ fmtStamp(c.issued, zone) }} · {{ ago(c.issued, clock.now.value) }} ago ·
            {{ c.kind }}
          </span>
        </span>
        <span v-if="open === c.key" class="amsg">{{ c.message }}</span>
      </span>
    </button>
  </CardGrid>
</template>
