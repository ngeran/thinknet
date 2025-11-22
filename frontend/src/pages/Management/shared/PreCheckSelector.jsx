/**
 * =============================================================================
 * PRE-CHECK SELECTOR COMPONENT
 * =============================================================================
 *
 * VERSION: 1.0.0
 * AUTHOR: nikos-geranios_vgi
 * DATE: 2025-11-11
 *
 * @module shared/PreCheckSelector
 */

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

const PRE_CHECK_OPTIONS = [
  {
    id: 'device_connectivity',
    label: 'Device Connectivity',
    description: 'Verify device is reachable and responsive'
  },
  {
    id: 'version_compatibility',
    label: 'Version Compatibility',
    description: 'Check if target version is compatible with current version'
  },
  {
    id: 'image_availability',
    label: 'Image Availability',
    description: 'Verify software image exists on device storage'
  },
  {
    id: 'storage_space',
    label: 'Storage Space',
    description: 'Check available storage for upgrade operation'
  },
  {
    id: 'hardware_health',
    label: 'Hardware Health',
    description: 'Validate power supplies, fans, and temperature'
  },
  {
    id: 'bgp_stability',
    label: 'BGP Stability',
    description: 'Check BGP peer status and protocol stability'
  }
];

/**
 * PreCheckSelector Component
 * 
 * @param {Object} props
 * @param {Array} props.selectedChecks - Array of selected pre-check IDs
 * @param {Function} props.onChange - Callback when selection changes
 * @param {boolean} props.disabled - Whether the selector is disabled
 */
export default function PreCheckSelector({ selectedChecks = [], onChange, disabled = false }) {
  const handleCheckboxChange = (checkId, checked) => {
    let newSelection;
    if (checked) {
      newSelection = [...selectedChecks, checkId];
    } else {
      newSelection = selectedChecks.filter(id => id !== checkId);
    }
    onChange(newSelection);
  };

  const handleSelectAll = () => {
    if (selectedChecks.length === PRE_CHECK_OPTIONS.length) {
      onChange([]); // Deselect all
    } else {
      onChange(PRE_CHECK_OPTIONS.map(option => option.id)); // Select all
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Pre-Check Validation Selection</span>
          <button
            type="button"
            onClick={handleSelectAll}
            disabled={disabled}
            className="text-sm text-blue-600 hover:text-blue-800 disabled:text-gray-400"
          >
            {selectedChecks.length === PRE_CHECK_OPTIONS.length ? 'Deselect All' : 'Select All'}
          </button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {PRE_CHECK_OPTIONS.map((option) => (
            <div key={option.id} className="flex items-start space-x-3 p-3 border rounded-lg">
              <Checkbox
                id={option.id}
                checked={selectedChecks.includes(option.id)}
                onCheckedChange={(checked) => handleCheckboxChange(option.id, checked)}
                disabled={disabled}
              />
              <div className="grid gap-1.5 leading-none">
                <Label
                  htmlFor={option.id}
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  {option.label}
                </Label>
                <p className="text-sm text-muted-foreground">
                  {option.description}
                </p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 text-sm text-muted-foreground">
          <p>
            <strong>Selected:</strong> {selectedChecks.length} of {PRE_CHECK_OPTIONS.length} checks
            {selectedChecks.length === 0 && ' (all checks will run)'}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
