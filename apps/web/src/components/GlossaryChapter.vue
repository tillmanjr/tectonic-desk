<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import {
  AREA_NAMES,
  filterGlossary,
  GLOSSARY,
  GLOSSARY_AREAS,
  GLOSSARY_CHAPTER,
  GLOSSARY_LIST,
  isTermId,
  letterOf,
  type GlossaryArea,
  type GlossaryItem,
} from "../lib/glossary.js";
import { vHint } from "../lib/hint.js";
import { useInjected } from "../lib/keys.js";
import { areaSlug, MANUAL } from "../lib/manual.js";
import { TOUR } from "../lib/tour.js";

/**
 * The Glossary chapter: A to Z with a letter strip, a filter box and area chips. The entry the
 * address names (`#glossary/<id>`) is brought into view and lit, the filters cleared first if they
 * hide it. See-also links stay in the chapter; the ◆ link opens the deep dive's card. An entry a
 * term on the desk opened offers the way back to that view.
 */
const manual = useInjected(MANUAL);
const tour = useInjected(TOUR);
const query = ref("");
const area = ref<GlossaryArea | null>(null);
const shown = computed(() => filterGlossary(query.value, area.value));
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const used = computed(() => new Set(shown.value.map(letterOf)));
/** The deep dive an entry points to, with the chapter its card is in. */
function diveOf(e: GlossaryItem): { id: string; title: string; chapter: string }[] {
  return tour.tours.flatMap((t) =>
    t.id === e.dive && t.deep !== undefined
      ? [{ id: t.id, title: t.title, chapter: areaSlug(t.deep.area) }]
      : [],
  );
}
const seeAlso = (e: GlossaryItem): GlossaryItem[] =>
  (e.see ?? []).filter(isTermId).map((id) => ({ ...GLOSSARY[id], id }));
/**
 * Each entry shown, with its letter when it is the first under that letter, its see-also entries
 * and its deep dive.
 */
const rows = computed(() =>
  shown.value.map((e, i) => {
    const prev = shown.value[i - 1];
    const first = prev === undefined || letterOf(prev) !== letterOf(e);
    return { e, letter: first ? letterOf(e) : null, see: seeAlso(e), dives: diveOf(e) };
  }),
);
/** The way back, when a term on the desk opened this chapter. */
const back = computed(() => manual.fromDesk.value);
const target = computed(() =>
  manual.at.value.chapter === GLOSSARY_CHAPTER ? manual.at.value.card : null,
);

function jump(letter: string): void {
  document.getElementById(`gl-${letter}`)?.scrollIntoView({ block: "start" });
}
function pickArea(a: GlossaryArea | null): void {
  area.value = a;
}

/** Brings the named entry into view, clearing a filter that hides it. */
async function focusEntry(): Promise<void> {
  const id = target.value;
  if (id === null) return;
  if (!shown.value.some((e) => e.id === id)) {
    query.value = "";
    area.value = null;
  }
  await nextTick();
  document.getElementById(`term-${id}`)?.scrollIntoView({ block: "center" });
}
watch(target, focusEntry);
onMounted(focusEntry);
</script>

<template>
  <div class="glossary" data-tour="manual.glossary">
    <div class="gtools">
      <div class="grow">
        <input
          v-model="query"
          type="search"
          class="gfilter"
          placeholder="Filter terms"
          aria-label="Filter terms"
        />
        <button
          type="button"
          class="gchip all"
          :aria-pressed="area === null"
          @click="pickArea(null)"
        >
          All
        </button>
        <button
          v-for="a in GLOSSARY_AREAS"
          :key="a"
          type="button"
          class="gchip"
          :class="a"
          :aria-pressed="area === a"
          @click="pickArea(a)"
        >
          {{ AREA_NAMES[a] }}
        </button>
      </div>
      <div class="grow">
        <nav class="gletters" aria-label="Jump to letter">
          <button
            v-for="l in LETTERS"
            :key="l"
            type="button"
            :disabled="!used.has(l)"
            @click="jump(l)"
          >
            {{ l }}
          </button>
        </nav>
        <span class="gcount">{{ shown.length }} of {{ GLOSSARY_LIST.length }} terms</span>
      </div>
    </div>
    <p v-if="shown.length === 0" class="note">No term matches. Clear the filter to see them all.</p>
    <div class="gentries">
      <template v-for="{ e, letter, see, dives } in rows" :key="e.id">
        <h3 v-if="letter !== null" :id="`gl-${letter}`" class="gletter">{{ letter }}</h3>
        <article :id="`term-${e.id}`" class="gentry" :class="{ focus: target === e.id }">
          <div class="ghead">
            <b>{{ e.term }}</b
            ><span class="gtag" :class="e.area">{{ AREA_NAMES[e.area] }}</span>
          </div>
          <p class="gshort">{{ e.short }}</p>
          <p class="glong">{{ e.long }}</p>
          <table v-if="e.scale !== undefined" class="gscale">
            <tr v-for="[k, v] in e.scale" :key="k">
              <td>{{ k }}</td>
              <td>{{ v }}</td>
            </tr>
          </table>
          <div class="grefs">
            <template v-if="see.length > 0">
              <span>See also</span>
              <button
                v-for="s in see"
                :key="s.id"
                type="button"
                class="glink"
                @click="manual.show(GLOSSARY_CHAPTER, s.id)"
              >
                {{ s.term }}
              </button>
            </template>
            <button
              v-for="t in dives"
              :key="t.id"
              type="button"
              class="glink gdive"
              @click="manual.show(t.chapter, t.id)"
            >
              ◆ {{ t.title }}
            </button>
            <span v-if="e.source !== undefined" class="gsrc">{{ e.source }}</span>
          </div>
          <div v-if="back !== null && back.term === e.id" class="gback">
            <button
              v-hint="'Returns to the view you opened this entry from'"
              type="button"
              class="tourbtn primary"
              @click="manual.backToDesk(back.view)"
            >
              ← Back to the desk
            </button>
          </div>
        </article>
      </template>
    </div>
  </div>
</template>
