/** Uma reprodução completa de música, guardada só neste computador. */
export interface PlayLogEntry {
  /** UUID da linha, exigido pelo DocStore. */
  id: string;
  id_music: number;
  /** Nome na hora em que foi tocada: o relatório não depende de o título mudar no catálogo. */
  name: string;
  /** Data e hora em ISO 8601. */
  played_at: string;
  /** Versão tocada (`audio`, `instrumental`…), como o player informa; `unknown` se ausente. */
  mode: string;
}

/** Janela do ranking. */
export type PeriodFilter = "30d" | "6m" | "12m" | "all";

/** Linha do relatório: uma música com o total de reproduções completas. */
export interface PlayCount {
  id_music: number;
  /** Nome da reprodução mais recente. */
  name: string;
  count: number;
  /** ISO 8601 da última reprodução completa. */
  last_played_at: string;
}
