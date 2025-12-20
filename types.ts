
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
  weightKg?: number | null; // Weight for sales
  date: string;
  settledDate?: string | null; // Date when payment was received/made
  description?: string;
  batchId?: string | null;
  materialId?: string | null; // Link to specific resource
  orderQty?: number | null; // The quantity originally ordered/paid for
  actualReceivedQty?: number | null; // The actual quantity confirmed as received
  receivedInStock?: boolean; // Track if supply goods were actually received
  orderNumber?: string | null;
  recordedBy: string;
  villageId: VillageType;
  paymentMethod?: string;
  status?: 'COMPLETED' | 'PENDING';
  attachmentUrl?: string | null;
  attachmentName?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface ActivityLog {
  id?: string;
  type: 'SUBSTRATE_PREP' | 'SUBSTRATE_MIXING' | 'SPAWNING' | 'HUMIDITY_CONTROL' | 'FLUSH_REHYDRATION' | 'INSPECTION' | 'HARVEST' | 'OTHER';
  details: string;
  userEmail: string;
  timestamp: string;
  villageId: VillageType;
  batchId?: string;
  totalYield?: number; // Added for Yield Tracking feature
  totalWastage?: number;
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

// Added missing AuditLogEntry interface
export interface AuditLogEntry {
  id: string;
  timestamp: string;
  action: string;
  performedBy: string;
  details?: string;
  villageId: VillageType;
}

// Added missing InventoryItem interface
export interface InventoryItem {
  id: string;
  batchNumber: string;
  mushroomType: string;
  grade: string;
  unit: string;
  currentStock: number;
  minThreshold: number;
  maxThreshold: number;
  harvestDate: string;
  expiryDate: string;
  warehouseLocation: string;
  storageTemperature: string;
  villageId: VillageType;
  lastUpdated: string;
}

// Added missing DeliveryRecord interface
export interface DeliveryRecord {
  id: string;
  deliveryDate: string;
  deliveryTime: string;
  status: 'SCHEDULED' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'FAILED';
  route: string;
  destinationAddress: string;
  customerEmail: string;
  customerPhone?: string;
  zone: string;
  driverId: string;
  driverName: string;
  vehicleId: string;
  vehicleType: string;
  villageId: VillageType;
  evidenceImage?: string;
  deliveredAt?: string;
  failureReason?: string;
}

// Added missing StockMovement interface
export interface StockMovement {
  id: string;
  batchId: string;
  type: 'IN' | 'OUT' | 'ADJUSTMENT';
  quantity: number;
  date: string;
  referenceId: string;
  performedBy: string;
  villageId: VillageType;
}

// Added missing ProcessingLog interface for Village C
export interface ProcessingLog {
  id: string;
  batchId: string;
  harvestId: string;
  sourceVillage: string;
  mushroomType: string;
  statedWeight: number;
  actualWeight: number;
  variance: number;
  receivedBy: string;
  intakeTimestamp: string;
  packagingDueTime: string;
  status: 'IN_PROGRESS' | 'COMPLETED' | 'READY_FOR_PACKAGING' | 'DISPOSED';
  currentStep: number;
  villageId: VillageType;
  timestamp: string;
  hasImageEvidence: boolean;
  qcVisualNotes?: string;
  qcCriteria?: Record<string, boolean>;
  rejectedWeight?: number;
  acceptedWeight?: number;
  qcStaff?: string;
  qcTimestamp?: string;
  grades?: {
    gradeA: number;
    gradeB: number;
    gradeC: number;
  };
  gradingStaff?: string;
  gradingTimestamp?: string;
  packagingStatus?: {
    gradeA: 'PENDING' | 'SKIPPED' | 'COMPLETED';
    gradeB: 'PENDING' | 'SKIPPED' | 'COMPLETED';
    gradeC: 'PENDING' | 'SKIPPED' | 'COMPLETED';
  };
  disposalEntries?: DisposalEntry[];
  rejectionStaff?: string;
  rejectionSupervisor?: string;
  rejectionTimestamp?: string;
  cleaningStaff?: string;
  cleaningTimestamp?: string;
}

// Added missing DisposalEntry interface
export interface DisposalEntry {
  method: string;
  weight: number;
}

// Added missing PackagingLogData interface
export interface PackagingLogData {
  id: string;
  batchId: string;
  mushroomType: string;
  packagingDate: string;
  grade: 'A' | 'B' | 'C';
  weight: number;
  units: number;
  packSize: string;
  remainingWeight: number;
  expiryDate: string;
  labelChecked: boolean;
  movedToWarehouseAt: string;
  operator: string;
  supervisor: string;
  timestamp: string;
  villageId?: VillageType;
  recordedBy?: string;
}

// Added missing DeliveryLogData alias for reporting
export type DeliveryLogData = DeliveryRecord;
