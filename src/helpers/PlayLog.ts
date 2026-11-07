/**
 * @category deve-virar-composable — Usa Dev (Pinia) só para o log de desenvolvimento; requer renderer inicializado.
 *
 * Registro local das músicas tocadas até o fim.
 *
 * Uma linha por reprodução na coleção `musics.play_log` do DocStore (arquivo no desktop,
 * IndexedDB na web). Nada sai do computador. O registro guarda tudo até o usuário apagar:
 * não há limpeza automática. Falha de gravação nunca pode interromper a música: `add` e
 * `prune` engolem o erro.
 */
import $docs from "@/helpers/DocStore";
import $dev from "@/helpers/Dev";
import { DB_TABLE } from "@/constants/DbTables";
import { olderThan } from "@/helpers/PlayLogReport";
import type { PlayLogEntry } from "@/types/PlayLog";

const COLECAO = DB_TABLE.MUSICS_PLAY_LOG;

/** Inteiro positivo vindo de número ou texto numérico; qualquer outra coisa vira null. */
function normalizeIdMusic(value: unknown): number | null {
  const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  return typeof n === "number" && Number.isInteger(n) && n > 0 ? n : null;
}

function parseEntry(raw: unknown): PlayLogEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id_music = normalizeIdMusic(r.id_music);
  if (typeof r.id !== "string" || !r.id) return null;
  if (id_music === null) return null;
  if (typeof r.name !== "string" || typeof r.mode !== "string") return null;
  if (typeof r.played_at !== "string" || Number.isNaN(Date.parse(r.played_at))) return null;
  return { id: r.id, id_music, name: r.name, played_at: r.played_at, mode: r.mode };
}

export default {
  /** Linhas válidas; arquivo ilegível vira lista vazia. */
  async list(): Promise<PlayLogEntry[]> {
    try {
      const raw = await $docs.getAll<unknown>(COLECAO);
      if (!Array.isArray(raw)) return [];
      return raw.map(parseEntry).filter((e): e is PlayLogEntry => e !== null);
    } catch (error) {
      $dev.write("[PlayLog] falha ao ler o registro", error);
      return [];
    }
  },

  /** Grava uma reprodução completa. Devolve null se ignorada ou se a gravação falhar. */
  async add(
    input: { id_music: unknown; name?: string; mode?: string },
    now: Date = new Date()
  ): Promise<PlayLogEntry | null> {
    const id_music = normalizeIdMusic(input.id_music);
    if (id_music === null) return null;
    const name = typeof input.name === "string" ? input.name.trim() : "";
    const entry: PlayLogEntry = {
      id: crypto.randomUUID(),
      id_music,
      name: name || String(id_music),
      played_at: now.toISOString(),
      mode: input.mode || "unknown",
    };
    try {
      await $docs.put(COLECAO, entry);
    } catch (error) {
      $dev.write("[PlayLog] falha ao gravar", error);
      return null;
    }
    return entry;
  },

  /** Apaga todo o registro. */
  async clear(): Promise<void> {
    await $docs.clear(COLECAO);
  },

  /**
   * Apaga as linhas mais antigas que `months` meses (calendário, UTC; a fronteira exata
   * fica), em uma única gravação. Devolve quantas removeu.
   */
  async prune(months: number, now: Date = new Date()): Promise<number> {
    try {
      const velhas = olderThan(await this.list(), months, now);
      if (velhas.length) await $docs.delMany(COLECAO, velhas.map((e) => e.id));
      return velhas.length;
    } catch (error) {
      $dev.write("[PlayLog] falha ao apagar registros antigos", error);
      return 0;
    }
  },
};
