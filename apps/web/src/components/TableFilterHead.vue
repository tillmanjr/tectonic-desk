<script setup lang="ts">
/** The right side of a table title: Clear all (while filters are set) and the Filter row toggle. */
defineProps<{ open: boolean; active: number }>();
defineEmits<{ toggle: []; clear: [] }>();
</script>

<template>
  <span class="filterhead">
    <button v-if="active > 0" type="button" class="clearall" @click="$emit('clear')">
      Clear all
    </button>
    <button
      type="button"
      class="filtertoggle"
      :class="{ on: active > 0 }"
      :aria-expanded="open"
      @click="$emit('toggle')"
    >
      Filter {{ open ? "▴" : "▾" }}
    </button>
  </span>
</template>
