import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadCsv, toCsv } from "@/helpers/Csv";

describe("toCsv", () => {
  it("usa ; BOM e CRLF, cita células com ; aspas ou quebra e neutraliza fórmula", () => {
    const csv = toCsv(
      ["Música", "Reproduções"],
      [
        ["Vem; Senhor", 3],
        ['Diga "oi"', 1],
        ["=SOMA(A1)", 2],
        ["linha\nquebrada", 1],
      ]
    );

    expect(csv).toBe(
      "\uFEFFMúsica;Reproduções\r\n" +
        '"Vem; Senhor";3\r\n' +
        '"Diga ""oi""";1\r\n' +
        "'=SOMA(A1);2\r\n" +
        '"linha\nquebrada";1\r\n'
    );
  });

  it("prefixa ' também para +, - e @ iniciais em texto, mas não altera números", () => {
    const csv = toCsv(["a"], [["+1"], ["-x"], ["@y"], [-5]]);

    expect(csv).toBe("\uFEFFa\r\n'+1\r\n'-x\r\n'@y\r\n-5\r\n");
  });
});

describe("downloadCsv", () => {
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;

  afterEach(() => {
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
    vi.restoreAllMocks();
  });

  it("cria um Blob text/csv, clica no link com o nome do arquivo e libera a URL", () => {
    let blob: Blob | undefined;
    URL.createObjectURL = vi.fn((b: Blob) => {
      blob = b;
      return "blob:csv-1";
    }) as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn();
    const click = vi.fn();
    const anchor = { href: "", download: "", click } as unknown as HTMLAnchorElement;
    vi.spyOn(document, "createElement").mockReturnValueOnce(anchor);

    downloadCsv("musicas.csv", "a;b\r\n");

    expect(blob?.type).toBe("text/csv;charset=utf-8");
    expect(anchor.href).toBe("blob:csv-1");
    expect(anchor.download).toBe("musicas.csv");
    expect(click).toHaveBeenCalledOnce();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:csv-1");
  });
});
