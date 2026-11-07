/**
 * @category helper-puro — Agregações do ranking do louvor.
 * Sem Vue e sem DocStore: recebem as linhas e devolvem listas.
 */
import Strings from "@/helpers/Strings";
import type { PeriodFilter, PlayCount, PlayLogEntry } from "@/types/PlayLog";

/** Início da janela; a fronteira exata entra no período. `null` = sem limite. */
function periodStart(period: PeriodFilter, now: Date): number | null {
  if (period === "all") return null;
  const start = new Date(now);
  if (period === "30d") start.setUTCDate(start.getUTCDate() - 30);
  else start.setUTCMonth(start.getUTCMonth() - (period === "6m" ? 6 : 12));
  return start.getTime();
}

export function filterByPeriod(
  entries: PlayLogEntry[],
  period: PeriodFilter,
  now: Date = new Date()
): PlayLogEntry[] {
  const start = periodStart(period, now);
  if (start === null) return [...entries];
  return entries.filter((e) => Date.parse(e.played_at) >= start);
}

function groupByMusic(entries: PlayLogEntry[]): PlayCount[] {
  const byId = new Map<number, PlayCount>();
  for (const e of entries) {
    const atual = byId.get(e.id_music);
    if (!atual) {
      byId.set(e.id_music, {
        id_music: e.id_music,
        name: e.name,
        count: 1,
        last_played_at: e.played_at,
      });
      continue;
    }
    atual.count++;
    if (Date.parse(e.played_at) > Date.parse(atual.last_played_at)) {
      atual.last_played_at = e.played_at;
      atual.name = e.name;
    }
  }
  return [...byId.values()];
}

/** Mais reproduções primeiro; empate pela mais recente. */
export function rankByCount(entries: PlayLogEntry[]): PlayCount[] {
  return groupByMusic(entries).sort(
    (a, b) => b.count - a.count || Date.parse(b.last_played_at) - Date.parse(a.last_played_at)
  );
}

/** Filtra pelo nome ignorando acento e caixa; termo vazio devolve tudo, na mesma ordem. */
export function filterByName(rows: PlayCount[], term: string): PlayCount[] {
  const wanted = Strings.fold(term);
  if (!wanted) return rows;
  return rows.filter((r) => Strings.fold(r.name).includes(wanted));
}

/**
 * Linhas anteriores a `months` meses de calendário (UTC) antes de `now`. A fronteira exata
 * fica. É a mesma regra da contagem mostrada ao usuário e da remoção, para os dois baterem.
 */
export function olderThan(
  entries: PlayLogEntry[],
  months: number,
  now: Date = new Date()
): PlayLogEntry[] {
  const cutoff = new Date(now);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - months);
  return entries.filter((e) => Date.parse(e.played_at) < cutoff.getTime());
}
