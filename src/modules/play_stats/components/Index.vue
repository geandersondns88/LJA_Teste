<template>
  <ModuleContainer ref="moduleContainer" :manifest="manifest" @close="close()">
    <template #right>
      <LjButton
        variant="ghost"
        :icon="ICONS.ACTIONS.DOWNLOAD"
        :title="tm('actions.export')"
        :aria-label="tm('actions.export')"
        icon-only
        :disabled="rows.length === 0"
        @click="exportCsv()"
      />
      <LjButton
        v-if="stats.entries.value.length"
        variant="ghost"
        :icon="ICONS.ACTIONS.DELETE"
        :title="tm('actions.clear')"
        :aria-label="tm('actions.clear')"
        icon-only
        @click="openCleanup()"
      />
    </template>

    <div class="ps">
      <div class="ps-toolbar">
        <LjInput
          v-model="stats.search.value"
          size="sm"
          clearable
          :icon="ICONS.ACTIONS.SEARCH"
          :placeholder="tm('search.placeholder')"
          class="ps-search"
        />
        <LjSelect
          v-model="stats.period.value"
          :items="periodItems"
          size="sm"
          :aria-label="tm('period.label')"
        />
      </div>

      <div v-if="showEmpty" class="ps-empty">
        <LjIcon :icon="ICONS.MODULES.PLAY_STATS" size="64" class="lj-u-faded" />
        <div class="ps-empty-text">
          <div class="ps-empty-title">{{ tm("data.empty") }}</div>
          <div class="ps-empty-hint lj-u-faded">{{ tm("data.empty_hint") }}</div>
        </div>
      </div>

      <p v-else-if="noResults" class="ps-no-results lj-u-faded">{{ tm("search.no_results") }}</p>

      <div v-else-if="shown.length" class="ps-list" role="list">
        <div class="ps-head" aria-hidden="true">
          <span class="ps-head-count" :title="tm('columns.plays')">{{ tm("columns.times") }}</span>
          <span class="ps-head-name">{{ tm("columns.music") }}</span>
        </div>
        <div v-for="row in shown" :key="row.id_music" class="ps-row lj-music-row" role="listitem">
          <span class="ps-count" :title="tm('columns.plays')">{{ row.count }}</span>
          <div class="ps-info">
            <span class="ps-name">{{ row.name }}</span>
            <span class="ps-meta">{{ tm("columns.last_played") }}: {{ row.date }}</span>
          </div>
          <MusicMenuTable
            :id_music="row.id_music"
            :name="row.name"
            :has_instrumental_music="false"
            show-playlist-menu
          />
        </div>
        <div v-if="stats.ranking.value.length > limit" class="ps-more">
          <LjButton variant="ghost" size="sm" @click="limit += PAGE_SIZE">
            {{ tm("actions.show_more") }}
          </LjButton>
        </div>
      </div>
    </div>

    <LjDialog
      v-model="cleanupOpen"
      size="sm"
      :icon="ICONS.ACTIONS.DELETE"
      icon-variant="danger"
      :title="tm('cleanup.title')"
      :description="tm('cleanup.description')"
    >
      <div class="ps-cleanup">
        <span class="ps-cleanup-label">{{ tm("cleanup.label") }}</span>
        <LjSelect
          v-model="cleanupChoice"
          :items="cleanupItems"
          :aria-label="tm('cleanup.label')"
        />
        <p
          class="ps-cleanup-preview"
          :class="{ 'lj-u-faded': cleanupCount === 0 }"
          :data-count="cleanupCount"
          :data-total="stats.entries.value.length"
        >
          {{ cleanupCount === 0 ? tm("cleanup.none") : cleanupPreview }}
        </p>
      </div>
      <template #footer>
        <LjButton variant="ghost" @click="cleanupOpen = false">{{ tm("actions.cancel") }}</LjButton>
        <LjButton
          variant="danger"
          :disabled="cleanupCount === 0"
          :loading="cleaning"
          @click="confirmCleanup()"
        >
          {{ tm("cleanup.confirm") }}
        </LjButton>
      </template>
    </LjDialog>
  </ModuleContainer>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { LjButton, LjDialog, LjIcon, LjInput, LjSelect } from "@/components/ui";
import { ICONS } from "@/config/Icons";
import { localeTag } from "@/helpers/DateTime";
import { downloadCsv, toCsv } from "@/helpers/Csv";
import PlayLog from "@/helpers/PlayLog";
import { olderThan } from "@/helpers/PlayLogReport";
import { module as manifest } from "../manifest";
import ModuleContainer from "@/components/ModuleContainer.vue";
import MusicMenuTable from "@/components/MusicMenuTable.vue";
import { usePlayStats } from "../composables/usePlayStats";
import type { PeriodFilter } from "@/types/PlayLog";

interface Row {
  id_music: number;
  name: string;
  count: number;
  /** Data da última reprodução completa, já formatada. */
  date: string;
}

const PAGE_SIZE = 50;

const { locale } = useI18n();
const moduleContainer = ref<{ tm?: (key: string) => string } | null>(null);
const tm = (key: string): string => moduleContainer.value?.tm?.(key) || key;

const stats = usePlayStats();
const limit = ref(PAGE_SIZE);

const PERIODS: PeriodFilter[] = ["30d", "6m", "12m", "all"];
const periodItems = computed(() =>
  PERIODS.map((value) => ({ value, label: tm(`period.${value}`) }))
);

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(localeTag(locale.value), {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

const rows = computed<Row[]>(() =>
  stats.ranking.value.map((r) => ({
    id_music: r.id_music,
    name: r.name,
    count: r.count,
    date: formatDate(r.last_played_at),
  }))
);

const shown = computed(() => rows.value.slice(0, limit.value));

/** Sem nenhuma reprodução no registro todo (não confundir com "a busca não achou nada"). */
const showEmpty = computed(() => !stats.loading.value && stats.entries.value.length === 0);
/** Há registro, mas a busca/período não deixou nenhuma linha. */
const noResults = computed(
  () => !stats.loading.value && stats.entries.value.length > 0 && rows.value.length === 0
);

watch(
  () => stats.search.value,
  () => {
    limit.value = PAGE_SIZE;
  }
);

// ── Limpar registros antigos ────────────────────────────────────────────────
// Não existe limpeza automática: o registro guarda tudo até o usuário apagar aqui.
const CLEANUP_OPTIONS: (number | "all")[] = [3, 6, 12, 24, "all"];
const cleanupOpen = ref(false);
const cleanupChoice = ref<number | "all">(12);
const cleaning = ref(false);

const cleanupItems = computed(() =>
  CLEANUP_OPTIONS.map((value) => ({ value, label: tm(`cleanup.options.${value}`) }))
);
/** Meses escolhidos; `null` = todos os registros. */
const cleanupMonths = computed(() =>
  cleanupChoice.value === "all" ? null : Number(cleanupChoice.value)
);
/** Mesma regra (`olderThan`) da remoção: o número da prévia é o que será apagado. */
const cleanupCount = computed(() =>
  cleanupMonths.value === null
    ? stats.entries.value.length
    : olderThan(stats.entries.value, cleanupMonths.value).length
);
const cleanupPreview = computed(() =>
  tm("cleanup.preview")
    .replace("[n]", String(cleanupCount.value))
    .replace("[total]", String(stats.entries.value.length))
);

function openCleanup(): void {
  cleanupChoice.value = 12;
  cleanupOpen.value = true;
}

async function confirmCleanup(): Promise<void> {
  if (cleanupCount.value === 0 || cleaning.value) return;
  cleaning.value = true;
  try {
    if (cleanupMonths.value === null) await PlayLog.clear();
    else await PlayLog.prune(cleanupMonths.value);
    cleanupOpen.value = false;
    await stats.reload();
  } finally {
    cleaning.value = false;
  }
}

/** Exporta o que está na tela, com período e busca ativos (todas as linhas, não só a página). */
function exportCsv(): void {
  const headers = [tm("columns.music"), tm("columns.plays"), tm("columns.last_played")];
  const body = rows.value.map((row) => [row.name, row.count, row.date]);

  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  downloadCsv(`ranking-do-louvor-${today}.csv`, toCsv(headers, body));
}

onMounted(() => void stats.reload());

function close() {}
</script>

<style scoped>
.ps {
  display: flex;
  flex-direction: column;
  gap: var(--lj-space-4);
}

.ps-toolbar {
  display: flex;
  align-items: center;
  gap: var(--lj-space-4);
  padding: var(--lj-space-4) var(--lj-space-5) 0;
}

.ps-search {
  flex: 1;
  min-width: 0;
}

.ps-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--lj-space-6);
  padding: var(--lj-space-8);
  text-align: center;
}

.ps-empty-text {
  display: flex;
  flex-direction: column;
  gap: var(--lj-space-4);
}

.ps-empty-title {
  font-size: var(--lj-text-lg);
}

.ps-empty-hint {
  font-size: var(--lj-text-base);
}

.ps-no-results {
  padding: var(--lj-space-6) var(--lj-space-5);
  text-align: center;
}

.ps-head {
  display: flex;
  align-items: center;
  gap: var(--lj-space-4);
  padding: var(--lj-space-2) var(--lj-space-5);
  border-bottom: 1px solid var(--lj-surface-divider);
  font-size: var(--lj-text-xs);
  color: var(--lj-text-muted);
  text-transform: uppercase;
}

.ps-head-name {
  flex: 1;
}

/* A contagem e o título dela dividem a mesma largura fixa, à esquerda, para ficarem alinhados. */
.ps-head-count,
.ps-count {
  width: 48px;
  flex-shrink: 0;
  text-align: center;
}

.ps-row {
  display: flex;
  align-items: center;
  gap: var(--lj-space-4);
  min-height: 36px;
  padding: var(--lj-space-3) var(--lj-space-5);
  border-bottom: 1px solid var(--lj-surface-divider);
}

.ps-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
}

.ps-name {
  font-size: var(--lj-text-sm);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ps-meta {
  font-size: var(--lj-text-xs);
  color: var(--lj-text-muted);
}

.ps-count {
  font-size: var(--lj-text-base);
  font-variant-numeric: tabular-nums;
}

.ps-more {
  display: flex;
  justify-content: center;
  padding: var(--lj-space-4);
}

.ps-cleanup {
  display: flex;
  flex-direction: column;
  gap: var(--lj-space-4);
}

.ps-cleanup-label {
  font-size: var(--lj-text-sm);
}

.ps-cleanup-preview {
  margin: 0;
  font-size: var(--lj-text-sm);
}
</style>
