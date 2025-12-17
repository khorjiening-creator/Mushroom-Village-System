
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
  transactionId?: string; // Auto-generated readable ID
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

export interface ActivityLog {
  id?: string;
  type: 'BED_PREP' | 'WATERING' | 'INSPECTION' | 'HARVEST' | 'OTHER';
  details: string;
  userEmail: string;
  timestamp: string;
  villageId: VillageType;
  batchId?: string;
  totalYield?: number; // Added for Yield Tracking feature
  mushroomStrain?: string; // Added for Batch Registry display
  predictedYield?: number; // Added for Productivity Prediction
  batchStatus?: string; // Added for lifecycle tracking
}

export interface HarvestLog {
  id?: string;
  batchId: string;
  weightKg?: number;
  totalYield?: number;
  strain: string;
  recordedBy?: string;
  timestamp: string;
  villageId: VillageType;
}

export interface EnvironmentLog {
  id?: string;
  temperature: number;
  humidity: number;
  moisture: number;
  recordedBy: string;
  timestamp: string;
  villageId: VillageType;
}

export interface ResourceItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  status: 'OK' | 'LOW' | 'CRITICAL';
}

export interface SystemLog {
  id: string;
  action?: string;
  details?: string;
  userEmail?: string;
  timestamp?: string;
  [key: string]: any;
}
