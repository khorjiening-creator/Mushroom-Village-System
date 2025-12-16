export enum VillageType {
  A = 'Village A',
  B = 'Village B',
  C = 'Village C'
}

export enum VillageRole {
  FARMING = 'FARMING',
  PROCESSING = 'PROCESSING'
}

export interface VillageConfig {
  id: VillageType;
  name: string;
  role: VillageRole;
  description: string;
  color: string;
  icon: string; // Basic identifier for icon rendering
}

export interface AuthState {
  user: any | null; // using any for Firebase User to avoid complex partials
  loading: boolean;
  error: string | null;
}

export interface UserProfile {
  uid: string;
  email: string;
  villageId: VillageType;
  role: VillageRole;
  jobTitle?: string;
  createdAt: string;
  password?: string;
}