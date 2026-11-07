import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PlayLogEntry } from "@/types/PlayLog";

const mocks = vi.hoisted(() => {
  const store: { docs: unknown[] } = { docs: [] };
  return {
    store,
    getAll: vi.fn(async () => [...store.docs]),
    put: vi.fn(async (_table: string, doc: { id: string }) => {
      store.docs = [...store.docs.filter((d) => (d as { id: string }).id !== doc.id), doc];
    }),
    del: vi.fn(async (_table: string, id: string) => {
      store.docs = store.docs.filter((d) => (d as { id: string }).id !== id);
    }),
    delMany: vi.fn(async (_table: string, ids: string[]) => {
      store.docs = store.docs.filter((d) => !ids.includes((d as { id: string }).id));
    }),
    clear: vi.fn(async () => {
      store.docs = [];
    }),
  };
});

vi.mock("@/helpers/DocStore", () => ({
  default: {
    getAll: mocks.getAll,
    put: mocks.put,
    del: mocks.del,
    delMany: mocks.delMany,
    clear: mocks.clear,
  },
}));
// Uma preferência antiga de retenção (de uma versão anterior) não pode voltar a apagar nada sozinha:
// qualquer leitura de preferência devolve 6.
vi.mock("@/helpers/UserData", () => ({ default: { get: () => 6, set: vi.fn() } }));
vi.mock("@/helpers/Dev", () => ({ default: { write: vi.fn() } }));

import PlayLog from "@/helpers/PlayLog";

const COLECAO = "musics.play_log";
const NOW = new Date("2026-11-05T12:00:00.000Z");

function linha(id: string, playedAt: string, idMusic = 1): PlayLogEntry {
  return { id, id_music: idMusic, name: `Música ${idMusic}`, played_at: playedAt, mode: "audio" };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.store.docs = [];
});

describe("PlayLog.add", () => {
  it("grava id_music numérico, nome, modo e data ISO", async () => {
    await PlayLog.add(
      { id_music: "42", name: "Vem, Espírito Santo", mode: "audio" },
      new Date("2026-11-05T20:00:00.000Z")
    );

    expect(mocks.put).toHaveBeenCalledWith(COLECAO, {
      id: expect.any(String),
      id_music: 42,
      name: "Vem, Espírito Santo",
      played_at: "2026-11-05T20:00:00.000Z",
      mode: "audio",
    });
  });

  it.each([null, undefined, "custom-7", 0, -3, 1.5])(
    "ignora id_music inválido (%s)",
    async (invalido) => {
      const resultado = await PlayLog.add({ id_music: invalido, name: "X" });

      expect(resultado).toBeNull();
      expect(mocks.put).not.toHaveBeenCalled();
    }
  );

  it('usa "unknown" sem modo e String(id) sem nome', async () => {
    await PlayLog.add({ id_music: 7 }, NOW);

    expect(mocks.put).toHaveBeenCalledWith(
      COLECAO,
      expect.objectContaining({ id_music: 7, name: "7", mode: "unknown" })
    );
  });

  it("devolve null sem lançar quando o DocStore falha", async () => {
    mocks.put.mockRejectedValueOnce(new Error("disco cheio"));

    await expect(PlayLog.add({ id_music: 5, name: "X" })).resolves.toBeNull();
  });

  it("gravar nunca apaga registros antigos: a limpeza é só manual", async () => {
    mocks.store.docs = [linha("antiga", "2026-03-01T12:00:00.000Z")];

    await PlayLog.add({ id_music: 9, name: "Nova" }, NOW);

    expect(mocks.delMany).not.toHaveBeenCalled();
    expect(mocks.del).not.toHaveBeenCalled();
    expect(mocks.store.docs).toHaveLength(2);
  });
});

describe("PlayLog.list", () => {
  it("descarta linhas inválidas e mantém as boas", async () => {
    const boa = linha("boa", "2026-10-01T12:00:00.000Z");
    mocks.store.docs = [
      boa,
      { ...linha("data-ruim", "ontem") },
      { ...linha("id-ruim", "2026-10-01T12:00:00.000Z"), id_music: "x" },
      { id_music: 3, name: "Sem id", played_at: "2026-10-01T12:00:00.000Z", mode: "audio" },
    ];

    expect(await PlayLog.list()).toEqual([boa]);
  });

  it("devolve [] quando o DocStore lança", async () => {
    mocks.getAll.mockRejectedValueOnce(new Error("arquivo corrompido"));

    expect(await PlayLog.list()).toEqual([]);
  });
});

describe("PlayLog.prune", () => {
  it("remove o que é anterior ao período e mantém a fronteira", async () => {
    mocks.store.docs = [
      linha("velha", "2025-11-05T11:59:59.000Z"),
      linha("fronteira", "2025-11-05T12:00:00.000Z"),
      linha("recente", "2026-10-01T12:00:00.000Z"),
    ];

    const removidas = await PlayLog.prune(12, NOW);

    expect(removidas).toBe(1);
    expect(mocks.delMany).toHaveBeenCalledTimes(1);
    expect(mocks.delMany).toHaveBeenCalledWith(COLECAO, ["velha"]);
  });

  it("remove todas as linhas antigas numa única chamada em lote, nunca uma por linha", async () => {
    mocks.store.docs = [
      linha("v1", "2024-01-01T00:00:00.000Z"),
      linha("v2", "2024-02-01T00:00:00.000Z"),
      linha("v3", "2024-03-01T00:00:00.000Z"),
      linha("recente", "2026-10-01T12:00:00.000Z"),
    ];

    expect(await PlayLog.prune(12, NOW)).toBe(3);

    expect(mocks.delMany).toHaveBeenCalledTimes(1);
    expect(mocks.delMany).toHaveBeenCalledWith(COLECAO, ["v1", "v2", "v3"]);
    expect(mocks.del).not.toHaveBeenCalled();
  });

  it("sem linhas antigas não chama o DocStore", async () => {
    mocks.store.docs = [linha("recente", "2026-10-01T12:00:00.000Z")];

    expect(await PlayLog.prune(12, NOW)).toBe(0);

    expect(mocks.delMany).not.toHaveBeenCalled();
  });

  it("devolve 0 sem lançar quando o DocStore falha", async () => {
    mocks.store.docs = [linha("velha", "2020-01-01T00:00:00.000Z")];
    mocks.delMany.mockRejectedValueOnce(new Error("disco cheio"));

    await expect(PlayLog.prune(12, NOW)).resolves.toBe(0);
  });
});

describe("PlayLog.clear", () => {
  it("esvazia a coleção", async () => {
    await PlayLog.clear();

    expect(mocks.clear).toHaveBeenCalledWith(COLECAO);
  });
});

describe("preferência de retenção", () => {
  it("não existe mais: o registro guarda tudo até o usuário apagar", () => {
    expect((PlayLog as Record<string, unknown>).retentionMonths).toBeUndefined();
    expect((PlayLog as Record<string, unknown>).setRetentionMonths).toBeUndefined();
  });
});
