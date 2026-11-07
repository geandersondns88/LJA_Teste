import { describe, expect, it } from "vitest";
import { filterByName, filterByPeriod, olderThan, rankByCount } from "@/helpers/PlayLogReport";
import type { PlayCount, PlayLogEntry } from "@/types/PlayLog";

const NOW = new Date("2026-11-05T12:00:00.000Z");

let seq = 0;
function linha(id_music: number, played_at: string, name = `Música ${id_music}`): PlayLogEntry {
  return { id: `l${++seq}`, id_music, name, played_at, mode: "audio" };
}

describe("rankByCount", () => {
  it("ordena por contagem decrescente e desempata pela mais recente", () => {
    const entries = [
      linha(1, "2026-10-01T10:00:00.000Z"),
      linha(1, "2026-10-08T10:00:00.000Z"),
      linha(1, "2026-10-15T10:00:00.000Z"),
      linha(2, "2026-10-02T10:00:00.000Z"),
      linha(2, "2026-10-09T10:00:00.000Z"),
      linha(2, "2026-10-20T10:00:00.000Z"),
      linha(3, "2026-09-01T10:00:00.000Z"),
    ];

    const ranking = rankByCount(entries);

    expect(ranking.map((r) => [r.id_music, r.count])).toEqual([
      [2, 3],
      [1, 3],
      [3, 1],
    ]);
    expect(ranking[0].last_played_at).toBe("2026-10-20T10:00:00.000Z");
  });

  it("usa o nome da reprodução mais recente", () => {
    const entries = [
      linha(1, "2026-10-01T10:00:00.000Z", "Nome novo"),
      linha(1, "2026-09-01T10:00:00.000Z", "Nome antigo"),
    ];

    expect(rankByCount(entries)[0].name).toBe("Nome novo");
  });
});

describe("filterByPeriod", () => {
  const dentroEFora = (iso: string, fora: string) => [linha(1, iso), linha(2, fora)];

  it("30d mantém exatamente 30 dias atrás e descarta um segundo antes", () => {
    const entries = dentroEFora("2026-10-06T12:00:00.000Z", "2026-10-06T11:59:59.000Z");

    expect(filterByPeriod(entries, "30d", NOW).map((e) => e.id_music)).toEqual([1]);
  });

  it("6m usa meses de calendário", () => {
    const entries = dentroEFora("2026-05-05T12:00:00.000Z", "2026-05-05T11:59:59.000Z");

    expect(filterByPeriod(entries, "6m", NOW).map((e) => e.id_music)).toEqual([1]);
  });

  it("12m usa meses de calendário", () => {
    const entries = dentroEFora("2025-11-05T12:00:00.000Z", "2025-11-05T11:59:59.000Z");

    expect(filterByPeriod(entries, "12m", NOW).map((e) => e.id_music)).toEqual([1]);
  });

  it("all devolve tudo", () => {
    const entries = [linha(1, "2020-01-01T00:00:00.000Z"), linha(2, "2026-11-01T00:00:00.000Z")];

    expect(filterByPeriod(entries, "all", NOW)).toHaveLength(2);
  });
});

describe("filterByName", () => {
  const ranking: PlayCount[] = [
    { id_music: 1, name: "Coração Novo", count: 3, last_played_at: "2026-10-15T10:00:00.000Z" },
    { id_music: 2, name: "Outro Hino", count: 1, last_played_at: "2026-10-02T10:00:00.000Z" },
  ];

  it("ignora acento e caixa", () => {
    expect(filterByName(ranking, "CORACAO").map((r) => r.id_music)).toEqual([1]);
  });

  it("casa um trecho no meio do nome e ignora espaços nas pontas", () => {
    expect(filterByName(ranking, "  o hi ").map((r) => r.id_music)).toEqual([2]);
  });

  it("termo vazio ou só espaços devolve tudo, na mesma ordem", () => {
    expect(filterByName(ranking, "").map((r) => r.id_music)).toEqual([1, 2]);
    expect(filterByName(ranking, "   ").map((r) => r.id_music)).toEqual([1, 2]);
  });

  it("devolve vazio quando nada casa", () => {
    expect(filterByName(ranking, "xyz")).toEqual([]);
  });
});

describe("olderThan", () => {
  it("devolve só as linhas anteriores ao corte em meses de calendário e mantém a fronteira exata", () => {
    const entries = [
      linha(1, "2025-11-05T11:59:59.000Z"), // um segundo antes de 12 meses
      linha(2, "2025-11-05T12:00:00.000Z"), // exatamente 12 meses: fica
      linha(3, "2026-10-01T12:00:00.000Z"),
    ];

    expect(olderThan(entries, 12, NOW).map((e) => e.id_music)).toEqual([1]);
  });

  it("3 meses usa meses de calendário", () => {
    const entries = [
      linha(1, "2026-08-05T11:59:59.000Z"),
      linha(2, "2026-08-05T12:00:00.000Z"),
    ];

    expect(olderThan(entries, 3, NOW).map((e) => e.id_music)).toEqual([1]);
  });

  it("sem linhas antigas devolve vazio", () => {
    expect(olderThan([linha(1, "2026-11-01T12:00:00.000Z")], 6, NOW)).toEqual([]);
  });
});
