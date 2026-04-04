// Serial Number Database Utility
// Since we're using Firebase, we'll create a utility to manage serial numbers
// in a separate collection or as part of the product documents

export interface SerialNumberEntry {
  id?: string;
  productId: string;
  productName: string;
  serialNumber: string;
  status: 'available' | 'sold' | 'reserved' | 'defective';
  saleId?: string;
  saleDate?: number;
  customerName?: string;
  notes?: string;
  addedDate: number;
  lastUpdated?: number;
}

class SerialNumberDB {
  private storageKey = 'sna_serial_numbers';

  // Get all serial numbers for a product
  getSerialNumbersForProduct(productId: string): SerialNumberEntry[] {
    const allSerials = this.getAllSerialNumbers();
    return allSerials.filter(serial => serial.productId === productId);
  }

  // Get all serial numbers
  getAllSerialNumbers(): SerialNumberEntry[] {
    try {
      const stored = localStorage.getItem(this.storageKey);
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('Error loading serial numbers:', error);
      return [];
    }
  }

  // Add serial number
  addSerialNumber(serial: Omit<SerialNumberEntry, 'id'>): SerialNumberEntry {
    const newSerial: SerialNumberEntry = {
      ...serial,
      id: Math.random().toString(36).substring(2, 9),
      lastUpdated: Date.now()
    };

    const allSerials = this.getAllSerialNumbers();
    allSerials.push(newSerial);
    this.saveSerialNumbers(allSerials);

    return newSerial;
  }

  // Update serial number
  updateSerialNumber(id: string, updates: Partial<SerialNumberEntry>): boolean {
    const allSerials = this.getAllSerialNumbers();
    const index = allSerials.findIndex(serial => serial.id === id);
    
    if (index === -1) return false;

    allSerials[index] = {
      ...allSerials[index],
      ...updates,
      lastUpdated: Date.now()
    };

    this.saveSerialNumbers(allSerials);
    return true;
  }

  // Delete serial number
  deleteSerialNumber(id: string): boolean {
    const allSerials = this.getAllSerialNumbers();
    const filtered = allSerials.filter(serial => serial.id !== id);
    
    if (filtered.length === allSerials.length) return false;

    this.saveSerialNumbers(filtered);
    return true;
  }

  // Mark serial as sold
  markSerialAsSold(serialId: string, saleId: string, customerName?: string): boolean {
    return this.updateSerialNumber(serialId, {
      status: 'sold',
      saleId,
      customerName,
      saleDate: Date.now()
    });
  }

  // Get available serials for product
  getAvailableSerials(productId: string): SerialNumberEntry[] {
    return this.getSerialNumbersForProduct(productId)
      .filter(serial => serial.status === 'available');
  }

  // Check if serial number exists
  serialNumberExists(serialNumber: string): boolean {
    const allSerials = this.getAllSerialNumbers();
    return allSerials.some(serial => 
      serial.serialNumber.toLowerCase() === serialNumber.toLowerCase()
    );
  }

  // Search serial numbers
  searchSerialNumbers(query: string): SerialNumberEntry[] {
    const allSerials = this.getAllSerialNumbers();
    const lowerQuery = query.toLowerCase();
    
    return allSerials.filter(serial => 
      serial.serialNumber.toLowerCase().includes(lowerQuery) ||
      serial.productName.toLowerCase().includes(lowerQuery) ||
      (serial.customerName && serial.customerName.toLowerCase().includes(lowerQuery))
    );
  }

  // Get serials by status
  getSerialsByStatus(status: SerialNumberEntry['status']): SerialNumberEntry[] {
    const allSerials = this.getAllSerialNumbers();
    return allSerials.filter(serial => serial.status === status);
  }

  // Bulk add serial numbers
  bulkAddSerialNumbers(serials: Omit<SerialNumberEntry, 'id'>[]): SerialNumberEntry[] {
    const newSerials = serials.map(serial => ({
      ...serial,
      id: Math.random().toString(36).substring(2, 9),
      lastUpdated: Date.now()
    }));

    const allSerials = this.getAllSerialNumbers();
    allSerials.push(...newSerials);
    this.saveSerialNumbers(allSerials);

    return newSerials;
  }

  // Save to localStorage
  private saveSerialNumbers(serials: SerialNumberEntry[]): void {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(serials));
    } catch (error) {
      console.error('Error saving serial numbers:', error);
    }
  }

  // Export serial numbers
  exportSerialNumbers(): string {
    const allSerials = this.getAllSerialNumbers();
    return JSON.stringify(allSerials, null, 2);
  }

  // Import serial numbers
  importSerialNumbers(jsonData: string): { success: number; failed: number; duplicates: number } {
    try {
      const importedSerials: SerialNumberEntry[] = JSON.parse(jsonData);
      const allSerials = this.getAllSerialNumbers();
      
      let success = 0;
      let failed = 0;
      let duplicates = 0;

      for (const imported of importedSerials) {
        // Check for duplicates
        const isDuplicate = allSerials.some(existing => 
          existing.serialNumber.toLowerCase() === imported.serialNumber.toLowerCase()
        );

        if (isDuplicate) {
          duplicates++;
          continue;
        }

        try {
          this.addSerialNumber({
            productId: imported.productId,
            productName: imported.productName,
            serialNumber: imported.serialNumber,
            status: imported.status,
            notes: imported.notes,
            addedDate: imported.addedDate || Date.now()
          });
          success++;
        } catch (error) {
          failed++;
        }
      }

      return { success, failed, duplicates };
    } catch (error) {
      console.error('Error importing serial numbers:', error);
      return { success: 0, failed: 0, duplicates: 0 };
    }
  }

  // Get statistics
  getStatistics(): {
    total: number;
    available: number;
    sold: number;
    reserved: number;
    defective: number;
  } {
    const allSerials = this.getAllSerialNumbers();
    
    return {
      total: allSerials.length,
      available: allSerials.filter(s => s.status === 'available').length,
      sold: allSerials.filter(s => s.status === 'sold').length,
      reserved: allSerials.filter(s => s.status === 'reserved').length,
      defective: allSerials.filter(s => s.status === 'defective').length
    };
  }
}

// Export singleton instance
export const serialNumberDB = new SerialNumberDB();

// Utility functions for common operations
export const serialUtils = {
  // Generate unique serial number format
  generateSerialNumber(prefix: string = 'SNA'): string {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `${prefix}-${timestamp}-${random}`;
  },

  // Validate serial number format
  validateSerialNumber(serial: string): boolean {
    // Basic validation: alphanumeric, 6-20 characters
    return /^[A-Z0-9]{6,20}$/i.test(serial.trim());
  },

  // Format serial number for display
  formatSerialNumber(serial: string): string {
    return serial.trim().toUpperCase();
  },

  // Check if product type requires serial number
  requiresSerialNumber(productType: string): boolean {
    return ['PHONE', 'SPARE_PART'].includes(productType.toUpperCase());
  }
};
