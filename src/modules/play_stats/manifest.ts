import { ModuleCategoryEnum } from "@/enums/ModuleCategoryEnum"
import { ModuleGroupEnum } from "@/enums/ModuleGroupEnum"
import type { RibbonPage } from "@/types/Ribbon"
import { Module } from "@/types/Module"
import { ICONS } from "@/config/Icons"
import { ModuleEnum } from "@/enums/ModuleEnum";
import { getModulePath } from "@/helpers/ModulePath"

const moduleId = ModuleEnum.PLAY_STATS;
const modulePath = getModulePath(moduleId);

export const module: Module = {
  id: moduleId,
  title: `${modulePath}.title`,
  name: "Ranking do louvor",
  description: `${modulePath}.description`,
  icon: ICONS.MODULES.PLAY_STATS,
  color: "#1b6b4f",
  showInMainMenu: true,
  category: ModuleCategoryEnum.FAVORITES,
  group: ModuleGroupEnum.FAVORITES_LIST,
  order: 3,
  dependencies: ["media", "lyric"],
}

export const contextualPages: RibbonPage[] = []
