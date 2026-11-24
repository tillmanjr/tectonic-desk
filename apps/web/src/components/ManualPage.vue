<script setup lang="ts">
import { computed, nextTick, onMounted, watch } from "vue";
import { useInjected } from "../lib/keys.js";
import { chapterById, chaptersOf, coverOf, MANUAL, takenCount } from "../lib/manual.js";
import { TOUR, tourState, type Tour } from "../lib/tour.js";

/**
 * The Field manual: a chapter list, and the chapter the address names. The introduction holds the
 * quick tours; every other chapter is one part of the desk, a card to each of its deep dives.
 */
const tour = useInjected(TOUR);
const manual = useInjected(MANUAL);
const chapters = chaptersOf(tour.tours);
const chapter = computed(() => chapterById(chapters, manual.at.value.chapter));
const number = (id: string): number => chapters.findIndex((c) => c.id === id) + 1;
const doc = computed(() => tour.progress.doc.value);
/** The quick tour that first shows the chapter's part of the desk. */
const introTour = computed(() => tour.tours.find((t) => t.id === chapter.value.introducedBy));

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
function take(t: Tour, fromTop = false): void {
  const s = tourState(doc.value, t.id);
  manual.take(t.id, !fromTop && s.kind === "partway" ? s.step : 0, chapter.value.id);
}

/** Brings the card the address names into view, its button ready for Enter. */
async function focusCard(): Promise<void> {
  const id = manual.at.value.card;
  if (id === null) return;
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
          <span>{{ number(c.id) }} {{ c.id === "intro" ? "Introduction" : c.title }}</span>
          <span class="mcount">{{ takenCount(doc, c.tours) }}/{{ c.tours.length }}</span>
        </button>
      </nav>
      <section class="mchapter" :aria-labelledby="`ch-${chapter.id}`">
        <div class="mhead">
          <h2 :id="`ch-${chapter.id}`">{{ number(chapter.id) }} · {{ chapter.title }}</h2>
          <span class="mcount"
            >{{ chapter.tours.length }}
            {{ chapter.id === "intro" ? "quick tours" : "deep dives" }} ·
            {{ takenCount(doc, chapter.tours) }} taken</span
          >
          <button
            v-if="introTour !== undefined"
            type="button"
            class="mintro"
            @click="take(introTour)"
          >
            Introduced in the quick tour {{ introTour.title }}
          </button>
        </div>
        <p class="mblurb">{{ chapter.blurb }}</p>
        <div v-if="chapter.id === 'intro'" class="mprose">
          <p>
            Tectonic Desk follows the active Earth as it happens: earthquakes from the USGS
            Comprehensive Catalog, the Holocene volcanoes of the Global Volcanism Program with the
            USGS and GeoNet alert levels, and space weather from NOAA's Space Weather Prediction
            Center, each kept in this site's own record so a window can reach further back than the
            feeds themselves.
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
              Every Holocene volcano, each agency's status on its own scale, the eruption record and
              the earthquakes nearby.
            </dd>
            <dt>Space</dt>
            <dd>
              The solar wind, Kp, Dst, X-rays and protons on one time axis, flares and alerts, the
              aurora oval and the Sun.
            </dd>
          </dl>
          <p>
            The quick tours below walk a page from start to finish. The chapters after this one hold
            the deep dives, each taking one part of the desk control by control. Both work the real
            app on real examples and give your view back when they end. A
            <span class="mdiamond" aria-hidden="true">◆</span> on a part of the desk lists the deep
            dives about it.
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
                @click="take(t, true)"
              >
                From the start
              </button>
              <button type="button" class="tourbtn primary mtake" @click="take(t)">
                {{ primaryText(t) }}
              </button>
            </div>
          </article>
        </div>
      </section>
    </div>
  </main>
</template>
