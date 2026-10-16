import { confirmAction, requestText } from '../utils/dialog';
import React, { useState, useEffect } from 'react';
import { db } from '../db';
import { Product } from '../types';
import { serialNumberDB, SerialNumberEntry } from '../utils/serialNumberDB';
import { 
  Search, Plus, X, Check, AlertCircle, Package, Smartphone, 
  Edit2, Trash2, Scan, Save, Eye, EyeOff
} from 'lucide-react';
import { useToast } from './Toast';
import Modal from './Modal';

interface IMEImanagerProps {
  isOpen: boolean;
  onClose: () => void;
  product?: Product;
  onSelectIMEI?: (imei: SerialNumberEntry) => void;
  multiSelect?: boolean;
  maxSelection?: number;
}

const IMEImanager: React.FC<IMEImanagerProps> = ({
  isOpen,
  onClose,
  product,
  onSelectIMEI,
  multiSelect = false,
  maxSelection = 1
}) => {
  const { showToast } = useToast();
  const [serialNumbers, setSerialNumbers] = useState<SerialNumberEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'available' | 'sold' | 'reserved' | 'defective'>('all');
  
  // Add/Edit IMEI
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingSerial, setEditingSerial] = useState<SerialNumberEntry | null>(null);
  const [serialForm, setSerialForm] = useState({
    serialNumber: '',
    status: 'available' as 'available' | 'reserved' | 'defective',
    notes: ''
  });
  
  // Selection
  const [selectedSerials, setSelectedSerials] = useState<SerialNumberEntry[]>([]);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchSerialNumbers();
    }
  }, [isOpen, product]);

  const fetchSerialNumbers = async () => {
    setLoading(true);
    try {
      const serials = product 
        ? serialNumberDB.getSerialNumbersForProduct(product.id!)
        : serialNumberDB.getAllSerialNumbers();
      setSerialNumbers(serials);
    } catch (error) {
      console.error('Error fetching serial numbers:', error);
      showToast('Failed to load serial numbers', 'error');
    } finally {
      setLoading(false);
    }
  };

  const filteredSerials = serialNumbers.filter(serial => {
    const matchesSearch = serial.serialNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         serial.productName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || serial.status === statusFilter;
    const matchesProduct = !product || serial.productId === product.id;
    return matchesSearch && matchesStatus && matchesProduct;
  });

  const handleAddIMEI = async () => {
    if (!serialForm.serialNumber.trim()) {
      showToast('IMEI number is required', 'error');
      return;
    }

    // IMEI validation - must be 15 digits
    if (!/^\d{15}$/.test(serialForm.serialNumber.trim())) {
      showToast('IMEI must be exactly 15 digits', 'error');
      return;
    }

    if (!product && !editingSerial) {
      showToast('Product is required for new IMEI numbers', 'error');
      return;
    }

    try {
      if (editingSerial) {
        // Update existing
        const success = serialNumberDB.updateSerialNumber(editingSerial.id!, {
          serialNumber: serialForm.serialNumber.trim(),
          status: serialForm.status as 'available' | 'reserved' | 'defective',
          notes: serialForm.notes
        });

        if (success) {
          showToast('IMEI number updated successfully', 'success');
          fetchSerialNumbers();
        } else {
          showToast('Failed to update IMEI number', 'error');
        }
      } else {
        // Add new
        serialNumberDB.addSerialNumber({
          productId: product!.id!,
          productName: product!.name,
          serialNumber: serialForm.serialNumber.trim(),
          status: serialForm.status as 'available' | 'reserved' | 'defective',
          notes: serialForm.notes,
          addedDate: Date.now()
        });

        showToast('IMEI number added successfully', 'success');
        fetchSerialNumbers();
      }

      setIsAddModalOpen(false);
      setSerialForm({ serialNumber: '', status: 'available', notes: '' });
      setEditingSerial(null);
    } catch (error) {
      showToast('Failed to save IMEI number', 'error');
    }
  };

  const handleEditIMEI = (serial: SerialNumberEntry) => {
    setEditingSerial(serial);
    setSerialForm({
      serialNumber: serial.serialNumber,
      status: serial.status as 'available' | 'reserved' | 'defective',
      notes: serial.notes || ''
    });
    setIsAddModalOpen(true);
  };

  const handleDeleteIMEI = async (serial: SerialNumberEntry) => {
    if (serial.status === 'sold') {
      showToast('Cannot delete sold IMEI number', 'error');
      return;
    }

    if (await confirmAction({ title: 'Delete IMEI?', message: 'This serial number will be removed from the register.', confirmLabel: 'Delete IMEI', tone: 'danger' })) {
      try {
        const success = serialNumberDB.deleteSerialNumber(serial.id!);
        if (success) {
          showToast('IMEI number deleted successfully', 'success');
          fetchSerialNumbers();
        } else {
          showToast('Failed to delete IMEI number', 'error');
        }
      } catch (error) {
        showToast('Failed to delete IMEI number', 'error');
      }
    }
  };

  const handleSelectIMEI = (serial: SerialNumberEntry) => {
    if (serial.status !== 'available') {
      showToast('Only available IMEI numbers can be selected', 'error');
      return;
    }

    if (multiSelect) {
      const exists = selectedSerials.find(s => s.id === serial.id);
      if (exists) {
        setSelectedSerials(selectedSerials.filter(s => s.id !== serial.id));
      } else if (selectedSerials.length < maxSelection) {
        setSelectedSerials([...selectedSerials, serial]);
      } else {
        showToast(`Maximum ${maxSelection} IMEI numbers can be selected`, 'error');
      }
    } else {
      onSelectIMEI?.(serial);
      onClose();
    }
  };

  const handleConfirmSelection = () => {
    if (selectedSerials.length > 0) {
      onSelectIMEI?.(selectedSerials[0]); // For now, just take first one
      onClose();
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'available': return 'text-green-600 bg-green-100';
      case 'sold': return 'text-red-600 bg-red-100';
      case 'reserved': return 'text-yellow-600 bg-yellow-100';
      case 'defective': return 'text-gray-600 bg-gray-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const bulkAddIMEIs = async () => {
    const input = await requestText({ title: 'Add IMEIs in bulk', message: 'Enter one primary 15-digit IMEI per phone. Your entries will be validated before they are added.', inputLabel: 'Phone IMEIs', multiline: true, confirmLabel: 'Validate and add' });
    if (!input || !product) return;

    const imeis = input.split('\n').map(s => s.trim()).filter(s => s);
    
    // Validate IMEI numbers
    const invalidIMEIs = imeis.filter(imei => !/^\d{15}$/.test(imei));
    if (invalidIMEIs.length > 0) {
      showToast(`${invalidIMEIs.length} IMEI numbers are invalid (must be 15 digits)`, 'error');
      return;
    }
    
    try {
      const newIMEIs = serialNumberDB.bulkAddSerialNumbers(
        imeis.map(imei => ({
          productId: product.id!,
          productName: product.name,
          serialNumber: imei,
          status: 'available' as const,
          addedDate: Date.now()
        }))
      );

      showToast(`${newIMEIs.length} IMEI numbers added successfully`, 'success');
      fetchSerialNumbers();
    } catch (error) {
      showToast('Failed to add IMEI numbers', 'error');
    }
  };

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} title="IMEI Management">
        <div className="space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {product && (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Package size={16} />
                  <span>{product.name}</span>
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={bulkAddIMEIs}
                className="px-3 py-1 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700"
              >
                Bulk Add
              </button>
              <button
                onClick={() => setIsAddModalOpen(true)}
                className="px-3 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 flex items-center gap-1"
              >
                <Plus size={12} />
                Add IMEI
              </button>
            </div>
          </div>

          {/* Filters */}
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
              <input
                type="text"
                placeholder="Search IMEI numbers..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-3 py-2 border rounded-lg text-sm"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="px-3 py-2 border rounded-lg text-sm"
            >
              <option value="all">All Status</option>
              <option value="available">Available</option>
              <option value="sold">Sold</option>
              <option value="reserved">Reserved</option>
              <option value="defective">Defective</option>
            </select>
          </div>

          {/* IMEI Numbers List */}
          <div className="max-h-96 overflow-y-auto space-y-2">
            {loading ? (
              <div className="text-center py-8">
                <div className="animate-spin inline-block w-6 h-6 border-2 border-gray-300 border-t-blue-600 rounded-full"></div>
                <p className="text-sm text-gray-500 mt-2">Loading IMEI numbers...</p>
              </div>
            ) : filteredSerials.length === 0 ? (
              <div className="text-center py-8">
                <Package className="mx-auto text-gray-400 mb-2" size={32} />
                <p className="text-sm text-gray-500">No IMEI numbers found</p>
              </div>
            ) : (
              filteredSerials.map((serial) => (
                <div
                  key={serial.id}
                  className={`border rounded-lg p-3 cursor-pointer transition-all ${
                    selectedSerials.find(s => s.id === serial.id) 
                      ? 'border-blue-500 bg-blue-50' 
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                  onClick={() => handleSelectIMEI(serial)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <input
                        type={multiSelect ? 'checkbox' : 'radio'}
                        checked={selectedSerials.find(s => s.id === serial.id) !== undefined}
                        onChange={() => {}}
                        className="rounded"
                      />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-medium">{serial.serialNumber}</span>
                          <span className={`px-2 py-1 text-xs rounded-full ${getStatusColor(serial.status)}`}>
                            {serial.status}
                          </span>
                        </div>
                        <div className="text-xs text-gray-500">
                          {serial.productName}
                          {serial.customerName && ` • ${serial.customerName}`}
                          {serial.saleDate && ` • ${new Date(serial.saleDate).toLocaleDateString()}`}
                        </div>
                        {serial.notes && (
                          <div className="text-xs text-gray-600 mt-1">{serial.notes}</div>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEditIMEI(serial);
                        }}
                        className="p-1 text-gray-400 hover:text-blue-600"
                      >
                        <Edit2 size={14} />
                      </button>
                      {serial.status !== 'sold' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteIMEI(serial);
                          }}
                          className="p-1 text-gray-400 hover:text-red-600"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          {multiSelect && selectedSerials.length > 0 && (
            <div className="flex items-center justify-between pt-4 border-t">
              <span className="text-sm text-gray-600">
                {selectedSerials.length} selected
              </span>
              <button
                onClick={handleConfirmSelection}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Confirm Selection
              </button>
            </div>
          )}
        </div>
      </Modal>

      {/* Add/Edit IMEI Modal */}
      <Modal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} title={editingSerial ? "Edit IMEI Number" : "Add IMEI Number"}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              IMEI Number
            </label>
            <input
              type="text"
              value={serialForm.serialNumber}
              onChange={(e) => setSerialForm({...serialForm, serialNumber: e.target.value.replace(/\D/g, '').slice(0, 15)})}
              className="w-full px-3 py-2 border rounded-lg font-mono"
              placeholder="Enter 15-digit IMEI"
              maxLength={15}
              autoFocus
            />
            <p className="text-xs text-gray-500 mt-1">IMEI must be exactly 15 digits</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Status
            </label>
            <select
              value={serialForm.status}
              onChange={(e) => setSerialForm({...serialForm, status: e.target.value as any})}
              className="w-full px-3 py-2 border rounded-lg"
            >
              <option value="available">Available</option>
              <option value="reserved">Reserved</option>
              <option value="defective">Defective</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notes
            </label>
            <textarea
              value={serialForm.notes}
              onChange={(e) => setSerialForm({...serialForm, notes: e.target.value})}
              className="w-full px-3 py-2 border rounded-lg"
              rows={3}
              placeholder="Optional notes..."
            />
          </div>

          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setIsAddModalOpen(false)}
              className="px-4 py-2 text-gray-600 hover:text-gray-800"
            >
              Cancel
            </button>
            <button
              onClick={handleAddIMEI}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              {editingSerial ? 'Update' : 'Add'} IMEI
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
};

export default IMEImanager;
