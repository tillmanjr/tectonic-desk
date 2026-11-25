<script setup lang="ts">
import { computed, nextTick, onMounted, watch } from "vue";
import GlossaryChapter from "./GlossaryChapter.vue";
import { GLOSSARY_CHAPTER } from "../lib/glossary.js";
import { useInjected } from "../lib/keys.js";
import {
  chapterById,
  chaptersOf,
  coverOf,
  INTRO_CHAPTER,
  MANUAL,
  TOURS_CHAPTER,
  takenCount,
  type Chapter,
} from "../lib/manual.js";
import { TOUR, tourState, type Tour } from "../lib/tour.js";

/**
 * The Field manual: a chapter list, and the chapter the address names. The introduction is prose;
 * the introductory tours are the quick tours; every other chapter is one part of the desk, a card to
 * each of its deep dives. Every chapter shares one page: all of them sit in the same cell, the one
 * on view above the others, which are hidden and inert, so the page is as tall as the longest at
 * any width and keeps its height as the reader turns from one to the next. The Glossary, far
 * longer than any, stands apart: the stack hides while it shows.
 */
const tour = useInjected(TOUR);
const manual = useInjected(MANUAL);
const chapters = chaptersOf(tour.tours);
const stacked = chapters.filter((c) => c.id !== GLOSSARY_CHAPTER);
const inGlossary = computed(() => chapter.value.id === GLOSSARY_CHAPTER);
const chapter = computed(() => chapterById(chapters, manual.at.value.chapter));
const number = (id: string): number => chapters.findIndex((c) => c.id === id) + 1;
const doc = computed(() => tour.progress.doc.value);
const onView = (c: Chapter): boolean => c.id === chapter.value.id;
/** The quick tour that first shows a chapter's part of the desk, if it has one. */
const introOf = (c: Chapter): Tour[] => tour.tours.filter((t) => t.id === c.introducedBy);

function stateText(t: Tour): string {
  const s = tourState(doc.value, t.id);
  if (s.kind === "done") return "✓ Taken";
  if (s.kind === "partway") return `Step ${String(s.step + 1)} of ${String(t.steps.length)}`;
  return `${String(t.steps.length)} steps`;
}
function primaryText(t: Tour): string {
  const s = tourState(doc.value, t.id);
  return s.kind === "new" ? "Take it" : s.kind === "done" ? "Again" : "Resume";
}
function take(t: Tour, c: Chapter, fromTop = false): void {
  const s = tourState(doc.value, t.id);
  manual.take(t.id, !fromTop && s.kind === "partway" ? s.step : 0, c.id);
}

/** Brings the card the address names into view, its button ready for Enter. */
async function focusCard(): Promise<void> {
  const id = manual.at.value.card;
  if (id === null || inGlossary.value) return;
  await nextTick();
  const card = document.getElementById(`card-${id}`);
  card?.scrollIntoView({ block: "center" });
  card?.querySelector<HTMLButtonElement>(".mtake")?.focus({ preventScroll: true });
}
watch(() => manual.at.value.card, focusCard);
onMounted(focusCard);
</script>

<template>
  <main class="manual" data-tour="manual.page" aria-labelledby="manual-title">
    <h1 id="manual-title" class="mtitle">Field manual</h1>
    <div class="mbody">
      <nav class="mtoc" aria-label="Chapters">
        <button
          v-for="c in chapters"
          :key="c.id"
          type="button"
          :aria-current="c.id === chapter.id ? 'page' : undefined"
          @click="manual.show(c.id)"
        >
          <span>{{ number(c.id) }} {{ c.id === INTRO_CHAPTER ? "Introduction" : c.title }}</span>
          <span v-if="c.tours.length > 0" class="mcount"
            >{{ takenCount(doc, c.tours) }}/{{ c.tours.length }}</span
          >
        </button>
      </nav>
      <section
        v-if="inGlossary"
        class="mchapter current mglossary"
        :aria-labelledby="`ch-${GLOSSARY_CHAPTER}`"
      >
        <div class="mhead">
          <h2 :id="`ch-${GLOSSARY_CHAPTER}`">
            {{ number(GLOSSARY_CHAPTER) }} · {{ chapter.title }}
          </h2>
        </div>
        <p class="mblurb">{{ chapter.blurb }}</p>
        <GlossaryChapter />
      </section>
      <div v-show="!inGlossary" class="mstack">
        <section
          v-for="chapter in stacked"
          :key="chapter.id"
          class="mchapter"
          :class="{ current: onView(chapter) }"
          :aria-labelledby="`ch-${chapter.id}`"
          :aria-hidden="onView(chapter) ? undefined : 'true'"
          :inert="onView(chapter) ? undefined : true"
        >
          <div class="mhead">
            <h2 :id="`ch-${chapter.id}`">{{ number(chapter.id) }} · {{ chapter.title }}</h2>
            <span v-if="chapter.tours.length > 0" class="mcount"
              >{{ chapter.tours.length }}
              {{ chapter.id === TOURS_CHAPTER ? "quick tours" : "deep dives" }} ·
              {{ takenCount(doc, chapter.tours) }} taken</span
            >
            <button
              v-for="q in introOf(chapter)"
              :key="q.id"
              type="button"
              class="mintro"
              @click="take(q, chapter)"
            >
              Introduced in the quick tour {{ q.title }}
            </button>
          </div>
          <p class="mblurb">{{ chapter.blurb }}</p>
          <div v-if="chapter.id === 'intro'" class="mprose">
            <p>
              Tectonic Desk follows the active Earth as it happens: earthquakes from the USGS
              Comprehensive Catalog, the Holocene volcanoes of the Global Volcanism Program with the
              USGS and GeoNet alert levels, and space weather from NOAA's Space Weather Prediction
              Center, each kept in this site's own record so a window can reach further back than
              the feeds themselves.
            </p>
            <dl class="mpages">
              <dt>Active Earth</dt>
              <dd>
                Earthquakes and volcanoes on one map, with the largest events and the elevated or
                changed volcanoes as cards.
              </dd>
              <dt>Earthquakes</dt>
              <dd>
                The catalogue in a window you set: the map with mechanisms and ShakeMap,
                cross-sections, the table and three charts.
              </dd>
              <dt>Volcanoes</dt>
              <dd>
                Every Holocene volcano, each agency's status on its own scale, the eruption record
                and the earthquakes nearby.
              </dd>
              <dt>Space</dt>
              <dd>
                The solar wind, Kp, Dst, X-rays and protons on one time axis, flares and alerts, the
                aurora oval and the Sun.
              </dd>
            </dl>
            <p>
              The introductory tours, next, each walk a page from start to finish. The chapters
              after them hold the deep dives, each taking one part of the desk control by control.
              Both work the real app on real examples and give your view back when they end. A
              <span class="mdiamond" aria-hidden="true">◆</span> on a part of the desk lists the
              deep dives about it.
            </p>
            <p>
              The last chapter, the
              <button type="button" class="mlink" @click="manual.show(GLOSSARY_CHAPTER)">
                Glossary</button
              >, explains the terms the desk shows and the words it uses for its own tools. On the
              desk a term with a faint dotted underline shows its line from the glossary as its
              hint, and a double click opens its entry; Settings changes both.
            </p>
            <p>
              <button type="button" class="mnext" @click="manual.show(TOURS_CHAPTER)">
                {{ number(TOURS_CHAPTER) }} · Introductory tours →
              </button>
            </p>
          </div>
          <div class="mcards">
            <article
              v-for="t in chapter.tours"
              :id="`card-${t.id}`"
              :key="t.id"
              class="mancard"
              :class="{ focus: manual.at.value.card === t.id }"
            >
              <h3>
                <span v-if="t.deep === undefined" class="tourkind">Quick tour</span>{{ t.title }}
              </h3>
              <p>{{ t.blurb }}</p>
              <ul class="mcover" aria-label="Steps">
                <li v-for="c in coverOf(t)" :key="c">{{ c }}</li>
              </ul>
              <div class="mfoot">
                <span class="mstate" :class="tourState(doc, t.id).kind">{{ stateText(t) }}</span>
                <button
                  v-if="tourState(doc, t.id).kind === 'partway'"
                  type="button"
                  class="tourbtn"
                  @click="take(t, chapter, true)"
                >
                  From the start
                </button>
                <button type="button" class="tourbtn primary mtake" @click="take(t, chapter)">
                  {{ primaryText(t) }}
                </button>
              </div>
            </article>
          </div>
        </section>
      </div>
    </div>
  </main>
</template>
