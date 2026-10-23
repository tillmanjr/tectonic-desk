<script setup lang="ts">
import { useInjected, VOLCANOES } from "../lib/keys.js";

const store = useInjected(VOLCANOES);
const { summary } = store;
</script>

<template>
  <section class="stats volcanoes" aria-label="Volcano summary">
    <div class="stat">
      <div class="k">USGS elevated</div>
      <div class="v num">{{ summary.elevatedUs }}</div>
      <div class="s">
        <template v-if="summary.highestUs !== null">highest level {{ summary.highestUs }}</template>
        <template v-else>all monitored US volcanoes at Normal</template>
      </div>
    </div>
    <div class="stat">
      <div class="k">GeoNet unrest</div>
      <div class="v num">{{ summary.geonetActive }}</div>
      <div class="s">New Zealand volcanoes at level 1 or above</div>
    </div>
    <div class="stat">
      <div class="k">Continuing eruptions</div>
      <div class="v num">{{ summary.continuingInView }}</div>
      <div class="s">in this view, per the GVP record</div>
    </div>
    <div class="stat">
      <template v-if="summary.newThisWeek !== null">
        <div class="k">New activity</div>
        <div class="v num">{{ summary.newThisWeek }}</div>
        <div class="s">entries in the latest weekly report</div>
      </template>
      <template v-else>
        <div class="k">Status changes</div>
        <div class="v num">{{ summary.changes7d }}</div>
        <div class="s">agency level or colour changes in 7 days</div>
      </template>
    </div>
  </section>
</template>
