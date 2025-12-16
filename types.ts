export enum VillageType {
  A = 'Village A',
  B = 'Village B',
  C = 'Village C'
}

export enum VillageRole {
  FARMING = 'FARMING',
  PROCESSING = 'PROCESSING'
}

export type UserRole = 'admin' | 'user' | 'finance';

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
  name: string;
  email: string;
  jobTitle: string;
  role: UserRole;
  password?: string;
  villageId: VillageType;
  createdAt: string;
}

export interface FinancialRecord {
  id: string;
  type: 'INCOME' | 'EXPENSE';
  category: string;
  amount: number;
  date: string;
  description?: string;
  batchId?: string | null;
  orderNumber?: string | null;
  recordedBy: string;
  villageId: VillageType;
  paymentMethod?: string;
  status?: 'COMPLETED' | 'PENDING';
  createdAt?: string;
  updatedAt?: string;
}