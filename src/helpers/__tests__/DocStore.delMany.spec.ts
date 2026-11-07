import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  platform: {
    isDesktop: true,
    docs: { read: vi.fn(), write: vi.fn(async () => {}) },
  },
  idbDel: vi.fn(async () => {}),
}));
vi.mock("@/helpers/Platform", () => ({ default: mocks.platform }));
vi.mock("@/helpers/IndexedDB", () => ({ default: { del: mocks.idbDel } }));

import DocStore from "@/helpers/DocStore";

beforeEach(() => {
  mocks.platform.isDesktop = true;
  mocks.platform.docs.read.mockReset();
  mocks.platform.docs.write.mockClear();
  mocks.idbDel.mockClear();
});

// Cada teste usa uma coleção própria: o DocStore guarda a coleção inteira em cache por nome.
describe("DocStore.delMany", () => {
  it("no desktop remove vários documentos com uma única gravação", async () => {
    mocks.platform.docs.read.mockResolvedValue([{ id: "a" }, { id: "b" }, { id: "c" }]);

    await DocStore.delMany("colecao_desktop", ["a", "c"]);

    expect(mocks.platform.docs.write).toHaveBeenCalledOnce();
    expect(mocks.platform.docs.write).toHaveBeenCalledWith("colecao_desktop", [{ id: "b" }]);
  });

  it("sem ids não grava nada", async () => {
    await DocStore.delMany("colecao_vazia", []);

    expect(mocks.platform.docs.write).not.toHaveBeenCalled();
  });

  it("na web remove cada documento no IndexedDB", async () => {
    mocks.platform.isDesktop = false;

    await DocStore.delMany("colecao_web", ["a", "b"]);

    expect(mocks.idbDel).toHaveBeenCalledTimes(2);
    expect(mocks.idbDel).toHaveBeenCalledWith("colecao_web", "a");
    expect(mocks.idbDel).toHaveBeenCalledWith("colecao_web", "b");
    expect(mocks.platform.docs.write).not.toHaveBeenCalled();
  });
});
