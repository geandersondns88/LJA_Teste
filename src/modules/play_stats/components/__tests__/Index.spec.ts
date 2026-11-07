import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { h } from "vue";
import { TooltipProvider } from "reka-ui";
import { flushPromises, type VueWrapper } from "@vue/test-utils";
import { mountUi } from "@/components/ui/__tests__/mountUi";
import { resetDialogStack } from "@/components/ui/dialogStack";
import type { PlayLogEntry } from "@/types/PlayLog";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  prune: vi.fn(async () => 0),
  clear: vi.fn(async () => {}),
  download: vi.fn(),
}));
vi.mock("@/helpers/PlayLog", () => ({
  default: { list: mocks.list, prune: mocks.prune, clear: mocks.clear },
}));
// Só o download é trocado: o conteúdo do CSV sai do toCsv de verdade.
vi.mock("@/helpers/Csv", async (original) => ({
  ...(await original<typeof import("@/helpers/Csv")>()),
  downloadCsv: mocks.download,
}));
vi.mock("@/modules/play_stats/manifest", () => ({ module: { id: "play_stats" } }));
vi.mock("@/components/ModuleContainer.vue", () => ({
  default: {
    name: "ModuleContainer",
    props: ["manifest"],
    methods: { tm: (key: string) => key },
    template: '<section><slot name="right" /><slot /></section>',
  },
}));
vi.mock("@/components/MusicMenuTable.vue", () => ({ default: { template: "<span />" } }));

import Index from "../Index.vue";

const BOM = String.fromCharCode(0xfeff);

let seq = 0;
function linha(id_music: number, played_at: string, name: string): PlayLogEntry {
  return { id: `l${++seq}`, id_music, name, played_at, mode: "audio" };
}

const wrappers: VueWrapper[] = [];
afterEach(() => {
  wrappers.splice(0).forEach((w) => w.unmount());
  // A janela de limpeza vive num portal no <body>; a pilha de diálogos é estado de módulo.
  document.body.innerHTML = "";
  resetDialogStack();
  vi.useRealTimers();
});
beforeEach(() => {
  mocks.list.mockReset();
  mocks.prune.mockReset();
  mocks.prune.mockResolvedValue(0);
  mocks.clear.mockClear();
  mocks.download.mockReset();
});

async function montar() {
  // TooltipProvider mora no App.vue; sem ele o LjTooltip dos botões só de ícone lança.
  const wrapper = mountUi(
    { render: () => h(TooltipProvider, { delayDuration: 0 }, () => h(Index)) },
    { attachTo: document.body }
  );
  wrappers.push(wrapper);
  await flushPromises();
  return wrapper;
}

type Montado = Awaited<ReturnType<typeof montar>>;

/** Dispara a escolha num LjSelect pelo rótulo acessível (o Reka em jsdom não abre o menu). */
function escolher(wrapper: Montado, rotulo: string, valor: unknown) {
  const select = wrapper
    .findAllComponents({ name: "LjSelect" })
    .find((c) => c.props("ariaLabel") === rotulo);
  select!.vm.$emit("update:modelValue", valor);
}

async function buscar(wrapper: Montado, termo: string) {
  await wrapper.find("input").setValue(termo);
  await flushPromises();
}

function hoje() {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-05T12:00:00.000Z"));
}

describe("módulo Ranking do louvor", () => {
  it("é uma tela só, sem abas", async () => {
    mocks.list.mockResolvedValue([linha(1, "2026-10-10T12:00:00.000Z", "Música A")]);
    const wrapper = await montar();

    expect(wrapper.findAll("[role=tab]")).toHaveLength(0);
  });

  it("mostra o estado vazio quando não há registro", async () => {
    mocks.list.mockResolvedValue([]);
    const wrapper = await montar();

    expect(wrapper.text()).toContain("data.empty");
  });

  it("lista pela contagem, da maior para a menor, com a data da última vez", async () => {
    mocks.list.mockResolvedValue([
      linha(1, "2026-10-10T12:00:00.000Z", "Música A"),
      linha(1, "2026-10-20T12:00:00.000Z", "Música A"),
      linha(2, "2026-09-01T12:00:00.000Z", "Música B"),
    ]);
    const wrapper = await montar();

    const linhas = wrapper.findAll(".ps-row");
    expect(linhas).toHaveLength(2);
    expect(linhas[0].text()).toContain("Música A");
    expect(linhas[0].find(".ps-count").text()).toBe("2");
    expect(linhas[0].text()).toContain("20/10/2026");
    expect(linhas[1].text()).toContain("Música B");
  });

  it("tem título de colunas sobre a lista", async () => {
    mocks.list.mockResolvedValue([linha(1, "2026-10-10T12:00:00.000Z", "Música A")]);
    const wrapper = await montar();

    expect(wrapper.find(".ps-head").text()).toContain("columns.music");
    expect(wrapper.find(".ps-head").text()).toContain("columns.times");
  });

  it("o período filtra o ranking", async () => {
    hoje();
    mocks.list.mockResolvedValue([
      linha(1, "2026-09-26T12:00:00.000Z", "Música A"), // 40 dias atrás
      linha(2, "2026-11-03T12:00:00.000Z", "Música B"),
    ]);
    const wrapper = await montar();

    escolher(wrapper, "period.label", "30d");
    await flushPromises();

    const linhas = wrapper.findAll(".ps-row");
    expect(linhas).toHaveLength(1);
    expect(linhas[0].text()).toContain("Música B");
  });

  it("mostra a lista em lotes de 50 com Mostrar mais", async () => {
    mocks.list.mockResolvedValue(
      Array.from({ length: 120 }, (_, i) =>
        linha(i + 1, "2026-10-10T12:00:00.000Z", `Música ${i + 1}`)
      )
    );
    const wrapper = await montar();
    const maisBotao = () =>
      wrapper.findAll("button").find((b) => b.text().includes("actions.show_more"));

    expect(wrapper.findAll(".ps-row")).toHaveLength(50);
    await maisBotao()!.trigger("click");
    expect(wrapper.findAll(".ps-row")).toHaveLength(100);
    await maisBotao()!.trigger("click");
    expect(wrapper.findAll(".ps-row")).toHaveLength(120);
    expect(maisBotao()).toBeUndefined();
  });
});

describe("busca por nome", () => {
  const dados = () => [
    linha(1, "2026-10-01T12:00:00.000Z", "Coração Novo"),
    linha(1, "2026-10-08T12:00:00.000Z", "Coração Novo"),
    linha(1, "2026-10-15T12:00:00.000Z", "Coração Novo"),
    linha(2, "2026-10-02T12:00:00.000Z", "Outro Hino"),
  ];

  it("ignora acento e caixa e mostra quantas vezes a música foi cantada", async () => {
    mocks.list.mockResolvedValue(dados());
    const wrapper = await montar();

    await buscar(wrapper, "CORACAO");

    const linhas = wrapper.findAll(".ps-row");
    expect(linhas).toHaveLength(1);
    expect(linhas[0].text()).toContain("Coração Novo");
    expect(linhas[0].find(".ps-count").text()).toBe("3");
  });

  it("respeita o período escolhido: conta só as vezes dentro dele", async () => {
    hoje();
    mocks.list.mockResolvedValue([
      linha(1, "2026-09-01T12:00:00.000Z", "Coração Novo"), // fora dos 30 dias
      linha(1, "2026-10-20T12:00:00.000Z", "Coração Novo"),
      linha(1, "2026-11-01T12:00:00.000Z", "Coração Novo"),
    ]);
    const wrapper = await montar();
    escolher(wrapper, "period.label", "30d");
    await flushPromises();

    await buscar(wrapper, "coracao");

    expect(wrapper.find(".ps-count").text()).toBe("2");
  });

  it("sem resultado mostra a mensagem de busca, não a de lista vazia", async () => {
    mocks.list.mockResolvedValue(dados());
    const wrapper = await montar();

    await buscar(wrapper, "xyz");

    expect(wrapper.findAll(".ps-row")).toHaveLength(0);
    expect(wrapper.text()).toContain("search.no_results");
    expect(wrapper.text()).not.toContain("data.empty");
  });

  it("limpar a busca volta ao ranking inteiro", async () => {
    mocks.list.mockResolvedValue(dados());
    const wrapper = await montar();
    await buscar(wrapper, "coracao");

    await buscar(wrapper, "");

    expect(wrapper.findAll(".ps-row")).toHaveLength(2);
  });
});

describe("cabeçalho: exportar e limpar", () => {
  it("exporta o ranking respeitando o período ativo", async () => {
    hoje();
    mocks.list.mockResolvedValue([
      linha(1, "2026-09-26T12:00:00.000Z", "Música A"),
      linha(2, "2026-11-01T12:00:00.000Z", "Música B"),
      linha(2, "2026-11-03T12:00:00.000Z", "Música B"),
    ]);
    const wrapper = await montar();
    escolher(wrapper, "period.label", "30d");
    await flushPromises();

    await wrapper.find('[aria-label="actions.export"]').trigger("click");

    expect(mocks.download).toHaveBeenCalledWith(
      "ranking-do-louvor-2026-11-05.csv",
      `${BOM}columns.music;columns.plays;columns.last_played\r\nMúsica B;2;03/11/2026\r\n`
    );
  });

  it("exporta só o que a busca está mostrando", async () => {
    hoje();
    mocks.list.mockResolvedValue([
      linha(1, "2026-10-01T12:00:00.000Z", "Coração Novo"),
      linha(2, "2026-10-02T12:00:00.000Z", "Outro Hino"),
    ]);
    const wrapper = await montar();
    await buscar(wrapper, "coracao");

    await wrapper.find('[aria-label="actions.export"]').trigger("click");

    expect(mocks.download).toHaveBeenCalledWith(
      "ranking-do-louvor-2026-11-05.csv",
      `${BOM}columns.music;columns.plays;columns.last_played\r\nCoração Novo;1;01/10/2026\r\n`
    );
  });

  it("não tem mais seletor de retenção: o registro guarda tudo até o usuário apagar", async () => {
    mocks.list.mockResolvedValue([linha(1, "2026-10-10T12:00:00.000Z", "Música A")]);
    const wrapper = await montar();

    const selects = wrapper.findAllComponents({ name: "LjSelect" }).map((c) => c.props("ariaLabel"));
    expect(selects).toEqual(["period.label"]);
    expect(wrapper.text()).not.toContain("retention.label");
  });

  it("a lixeira só aparece quando há registros", async () => {
    mocks.list.mockResolvedValue([]);
    const wrapper = await montar();

    expect(wrapper.find('[aria-label="actions.clear"]').exists()).toBe(false);
  });
});

describe("limpar registros antigos", () => {
  const macrotask = () => new Promise((resolve) => setTimeout(resolve, 0));
  const dialogo = () => document.body.querySelector('[role="dialog"]') as HTMLElement | null;
  const previa = () => dialogo()?.querySelector(".ps-cleanup-preview") as HTMLElement | null;
  const botao = (texto: string) =>
    [...(dialogo()?.querySelectorAll("button") ?? [])].find((b) =>
      b.textContent?.includes(texto)
    ) as HTMLButtonElement | undefined;

  // Hoje = 05/11/2026: com 12 meses entram as duas antigas; com 24, só a mais velha.
  const historico = () => [
    linha(1, "2024-09-01T12:00:00.000Z", "Antiga A"),
    linha(2, "2025-03-01T12:00:00.000Z", "Antiga B"),
    linha(3, "2026-10-01T12:00:00.000Z", "Recente"),
  ];

  async function abrirLimpeza(wrapper: Montado) {
    await wrapper.find('[aria-label="actions.clear"]').trigger("click");
    await flushPromises();
    await macrotask();
  }

  async function escolherPeriodo(wrapper: Montado, valor: unknown) {
    escolher(wrapper, "cleanup.label", valor);
    await flushPromises();
  }

  it("a lixeira abre a janela com a prévia de quantos registros serão apagados", async () => {
    hoje();
    mocks.list.mockResolvedValue(historico());
    const wrapper = await montar();

    await abrirLimpeza(wrapper);

    expect(dialogo()).not.toBeNull();
    expect(previa()?.dataset.count).toBe("2");
    expect(previa()?.dataset.total).toBe("3");
  });

  it("trocar o período atualiza a prévia", async () => {
    hoje();
    mocks.list.mockResolvedValue(historico());
    const wrapper = await montar();
    await abrirLimpeza(wrapper);

    await escolherPeriodo(wrapper, 24);

    expect(previa()?.dataset.count).toBe("1");
  });

  it("Apagar remove só o que passa do período escolhido e recarrega a lista", async () => {
    hoje();
    mocks.list.mockResolvedValue(historico());
    mocks.prune.mockResolvedValue(2);
    const wrapper = await montar();
    await abrirLimpeza(wrapper);
    const chamadas = mocks.list.mock.calls.length;

    botao("cleanup.confirm")!.click();
    await flushPromises();
    await macrotask();

    expect(mocks.prune).toHaveBeenCalledWith(12);
    expect(mocks.clear).not.toHaveBeenCalled();
    expect(mocks.list.mock.calls.length).toBeGreaterThan(chamadas);
    expect(dialogo()).toBeNull();
  });

  it("a opção Todos apaga o registro inteiro", async () => {
    hoje();
    mocks.list.mockResolvedValue(historico());
    const wrapper = await montar();
    await abrirLimpeza(wrapper);
    await escolherPeriodo(wrapper, "all");
    expect(previa()?.dataset.count).toBe("3");

    botao("cleanup.confirm")!.click();
    await flushPromises();

    expect(mocks.clear).toHaveBeenCalledOnce();
    expect(mocks.prune).not.toHaveBeenCalled();
  });

  it("Cancelar fecha a janela sem apagar nada", async () => {
    hoje();
    mocks.list.mockResolvedValue(historico());
    const wrapper = await montar();
    await abrirLimpeza(wrapper);

    botao("actions.cancel")!.click();
    await flushPromises();
    await macrotask();

    expect(mocks.prune).not.toHaveBeenCalled();
    expect(mocks.clear).not.toHaveBeenCalled();
    expect(dialogo()).toBeNull();
  });

  it("sem registros no período o botão Apagar fica desativado e a janela avisa", async () => {
    hoje();
    mocks.list.mockResolvedValue([linha(3, "2026-10-01T12:00:00.000Z", "Recente")]);
    const wrapper = await montar();

    await abrirLimpeza(wrapper);

    expect(botao("cleanup.confirm")!.disabled).toBe(true);
    expect(dialogo()?.textContent).toContain("cleanup.none");
  });
});
