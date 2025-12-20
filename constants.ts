
import { VillageType, VillageRole, VillageConfig, UserRole } from './types';

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

export const MUSHROOM_PRICES: Record<string, number> = {
    'Button Mushroom': 10,
    'Button': 10,
    'Oyster Mushroom': 12,
    'Oyster': 12,
    'Shiitake Mushroom': 45,
    'Shiitake': 45,
    'Lion’s Mane': 50,
    "Lion's Mane": 50
};

export const JOB_ROLES = [
  "Farmer",
  "Farm Manager",
  "Processing Staff",
  "Warehouse Coordinator",
  "Financial Clerk",
  "Packaging Worker",
  "Sales Coordinator"
];

// Added missing STAFF_LIST constant
export const STAFF_LIST = [
  "Alice Worker",
  "Bob Laborer",
  "Charlie Checker",
  "David Driver",
  "Eve Examiner",
  "Frank Farmer"
];

export const USER_ROLES: UserRole[] = ['admin', 'user', 'finance'];

export const COLOR_THEMES = {
    green: {
        bgLight: "bg-green-200",
        textMain: "text-green-800",
        bgSoft: "bg-green-100",
        textIcon: "text-green-700",
        borderSoft: "border-green-200",
        badgeBg: "bg-green-200",
        badgeText: "text-green-900",
        button: "bg-green-600 hover:bg-green-700 text-white",
        ring: "focus:ring-green-500",
        progress: "bg-green-500"
    },
    blue: {
        bgLight: "bg-blue-200",
        textMain: "text-blue-800",
        bgSoft: "bg-blue-100",
        textIcon: "text-blue-700",
        borderSoft: "border-blue-200",
        badgeBg: "bg-blue-200",
        badgeText: "text-blue-900",
        button: "bg-blue-600 hover:bg-blue-700 text-white",
        ring: "focus:ring-blue-500",
        progress: "bg-blue-500"
    },
    slate: {
        bgLight: "bg-slate-200",
        textMain: "text-slate-800",
        bgSoft: "bg-slate-100",
        textIcon: "text-slate-700",
        borderSoft: "border-slate-200",
        badgeBg: "bg-slate-200",
        badgeText: "text-slate-900",
        button: "bg-slate-700 hover:bg-slate-800 text-white",
        ring: "focus:ring-slate-500",
        progress: "bg-slate-500"
    }
};