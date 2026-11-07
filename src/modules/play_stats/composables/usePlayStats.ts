import { computed, ref } from "vue";
import PlayLog from "@/helpers/PlayLog";
import { filterByName, filterByPeriod, rankByCount } from "@/helpers/PlayLogReport";
import type { PeriodFilter, PlayLogEntry } from "@/types/PlayLog";

/** Estado do módulo Ranking do louvor: o registro e o ranking derivado dele. */
export function usePlayStats() {
  const entries = ref<PlayLogEntry[]>([]);
  const loading = ref(false);
  const period = ref<PeriodFilter>("all");
  const search = ref("");

  /**
   * Ranking das mais tocadas até o fim no período escolhido. A busca por nome vem depois do período, então a
   * contagem de uma música buscada só leva em conta as vezes dentro do período.
   */
  const ranking = computed(() =>
    filterByName(rankByCount(filterByPeriod(entries.value, period.value)), search.value)
  );

  async function reload(): Promise<void> {
    loading.value = true;
    try {
      entries.value = await PlayLog.list();
    } finally {
      loading.value = false;
    }
  }

  return { entries, loading, period, search, ranking, reload };
}
