import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PlayLogEntry } from "@/types/PlayLog";

const mocks = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock("@/helpers/PlayLog", () => ({ default: { list: mocks.list } }));

import { usePlayStats } from "../usePlayStats";

let seq = 0;
function linha(id_music: number, played_at: string, name = `Música ${id_music}`): PlayLogEntry {
  return { id: `l${++seq}`, id_music, name, played_at, mode: "audio" };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-05T12:00:00.000Z"));
  mocks.list.mockReset();
});
afterEach(() => vi.useRealTimers());

describe("usePlayStats", () => {
  it("o ranking respeita o período", async () => {
    mocks.list.mockResolvedValue([
      linha(1, "2026-09-26T12:00:00.000Z"), // 40 dias atrás
      linha(2, "2026-11-03T12:00:00.000Z"), // 2 dias atrás
    ]);
    const stats = usePlayStats();
    await stats.reload();

    stats.period.value = "30d";

    expect(stats.ranking.value.map((r) => r.id_music)).toEqual([2]);
  });

  it("a busca por nome combina com o período e conta só as vezes dentro dele", async () => {
    mocks.list.mockResolvedValue([
      linha(1, "2026-09-01T12:00:00.000Z", "Coração Novo"), // fora dos 30 dias
      linha(1, "2026-10-20T12:00:00.000Z", "Coração Novo"),
      linha(1, "2026-11-01T12:00:00.000Z", "Coração Novo"),
      linha(2, "2026-11-02T12:00:00.000Z", "Outro Hino"),
    ]);
    const stats = usePlayStats();
    await stats.reload();
    stats.period.value = "30d";

    stats.search.value = "CORACAO";

    expect(stats.ranking.value).toHaveLength(1);
    expect(stats.ranking.value[0]).toMatchObject({ id_music: 1, count: 2 });
  });

  it("uma música fora do catálogo aparece com o nome gravado", async () => {
    mocks.list.mockResolvedValue([linha(999, "2026-11-01T12:00:00.000Z", "Música Removida")]);
    const stats = usePlayStats();

    await stats.reload();

    expect(stats.ranking.value[0]).toMatchObject({ id_music: 999, name: "Música Removida" });
  });

  it("reload alterna loading e substitui as linhas", async () => {
    mocks.list.mockResolvedValue([linha(1, "2026-11-01T12:00:00.000Z")]);
    const stats = usePlayStats();

    const pendente = stats.reload();
    expect(stats.loading.value).toBe(true);
    await pendente;

    expect(stats.loading.value).toBe(false);
    expect(stats.entries.value).toHaveLength(1);
  });
});
