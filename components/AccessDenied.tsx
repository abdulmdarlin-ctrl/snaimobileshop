import React from 'react';
import { ShieldX, Lock } from 'lucide-react';

interface AccessDeniedProps {
  message?: string;
  onBack?: () => void;
}

const AccessDenied: React.FC<AccessDeniedProps> = ({ 
  message = "You don't have permission to access this page.", 
  onBack 
}) => {
  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <div className="text-center p-8">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <ShieldX className="w-8 h-8 text-red-600" />
        </div>
        <Lock className="w-12 h-12 text-gray-400 mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h2>
        <p className="text-gray-600 mb-6 max-w-md">{message}</p>
        {onBack && (
          <button
            onClick={onBack}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Go Back
          </button>
        )}
      </div>
    </div>
  );
};

export default AccessDenied;
