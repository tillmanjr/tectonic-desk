<script setup lang="ts">
import { computed, ref } from "vue";
import { fmtStamp } from "../lib/format.js";
import { SPACE, useInjected, ZONE } from "../lib/keys.js";
import { alertTitle } from "../lib/space-format.js";

/** SWPC's alerts, warnings, watches and summaries in the window, newest first; one opens to its full text. */
const store = useInjected(SPACE);
const zone = useInjected(ZONE);
const open = ref<string | null>(null);

const rows = computed(() => {
  const w = store.window.value;
  if (w === null) return [];
  return w.alerts.map((a) => ({
    key: `${a.productId}${a.issueTime}`,
    time: fmtStamp(a.issueTime, zone.value, { date: "monthday", label: false }),
    code: a.productId,
    title: alertTitle(a.message),
    message: a.message.replace(/\r\n/g, "\n"),
  }));
});

function toggle(key: string): void {
  open.value = open.value === key ? null : key;
}
</script>

<template>
  <div class="panel spacepanel alerts">
    <h2>Alerts<span>SWPC messages</span></h2>
    <p v-if="rows.length === 0" class="cap note">No alerts in this window.</p>
    <ul v-else class="alertlist">
      <li v-for="r in rows" :key="r.key" :class="{ open: open === r.key }">
        <button
          type="button"
          class="alerthead"
          :aria-expanded="open === r.key"
          @click="toggle(r.key)"
        >
          <span class="num atime">{{ r.time }}</span>
          <span class="num acode">{{ r.code }}</span>
          <span class="atitle">{{ r.title }}</span>
        </button>
        <pre v-if="open === r.key" class="amsg">{{ r.message }}</pre>
      </li>
    </ul>
  </div>
</template>
