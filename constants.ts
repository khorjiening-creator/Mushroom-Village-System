import { VillageType, VillageRole, VillageConfig } from './types';

export const VILLAGES: Record<VillageType, VillageConfig> = {
  [VillageType.A]: {
    id: VillageType.A,
    name: "Village A",
    role: VillageRole.FARMING,
    description: "Primary mushroom cultivation zone. High-yield strain production.",
    color: "green",
    icon: "mushroom"
  },
  [VillageType.B]: {
    id: VillageType.B,
    name: "Village B",
    role: VillageRole.FARMING,
    description: "Spore harvesting and genetic archival center.",
    color: "blue",
    icon: "flask"
  },
  [VillageType.C]: {
    id: VillageType.C,
    name: "Village C",
    role: VillageRole.PROCESSING,
    description: "Central processing and distribution facility.",
    color: "slate",
    icon: "production"
  }
};