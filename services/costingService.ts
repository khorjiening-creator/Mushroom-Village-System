
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from './firebase';

export const costingService = {
  calculateFullBatchAnalysis: async ({ batchId, laborHours, laborRate, packagingCostPerUnit, outputQty, month }: any) => {
    let rawMaterialCost = 0;

    try {
        // 1. Fetch Material Costs
        // Strategy: Check farming logs for batch_costs subcollection (Village A & B)
        const villages = ['A', 'B'];
        let foundCosts = false;

        for (const v of villages) {
            const colName = v === 'A' ? 'dailyfarming_logA' : 'dailyfarming_logB';
            // Note: In a real app, we'd know the village from the batch ID prefix usually, but checking both is safer here
            const subColRef = collection(db, colName, batchId, 'batch_costs');
            const costSnap = await getDocs(subColRef);
            
            if (!costSnap.empty) {
                costSnap.forEach(doc => {
                    rawMaterialCost += (doc.data().totalCost || 0);
                });
                foundCosts = true;
            }
        }

        // Fallback: If no direct batch_costs found, check financial ledger for expenses linked to this batchId
        if (!foundCosts) {
            const expenseCols = ['expenses_A', 'expenses_B', 'expenses_C', 'financialRecords_A', 'financialRecords_B'];
            for (const col of expenseCols) {
                const q = query(collection(db, col), where('batchId', '==', batchId), where('type', '==', 'EXPENSE'));
                const snap = await getDocs(q);
                snap.forEach(doc => {
                    rawMaterialCost += (doc.data().amount || 0);
                });
            }
        }

    } catch (e) {
        console.warn("Cost calculation warning:", e);
    }

    // 2. Calculate Labor
    const directLabor = (laborHours || 0) * (laborRate || 0);

    // 3. Calculate Packaging
    const packagingTotal = (outputQty || 0) * (packagingCostPerUnit || 0);

    // 4. Calculate Overhead (Standard 15% of Prime Cost)
    // Prime Cost = Raw Material + Direct Labor
    const primeCost = rawMaterialCost + directLabor;
    const allocatedOverhead = primeCost * 0.15;

    const totalBatchCost = rawMaterialCost + directLabor + packagingTotal + allocatedOverhead;
    const weightedUnitCost = outputQty > 0 ? totalBatchCost / outputQty : 0;

    return {
      totalBatchCost,
      rawMaterialCost,
      directLabor,
      packagingTotal,
      allocatedOverhead,
      weightedUnitCost
    };
  }
};
