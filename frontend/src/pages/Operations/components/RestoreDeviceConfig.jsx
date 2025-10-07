// frontend/src/pages/Operations/components/RestoreDeviceConfig.jsx

import React, { useState, useEffect } from 'react';
import axios from 'axios';
// ✅ Check for capital 'L' and 'S' in your file system!
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// NOTE: Use the environment variable VITE_API_GATEWAY_URL
const API_URL = import.meta.env.VITE_API_GATEWAY_URL || 'http://localhost:8000';

/**
 * Component for dependent dropdowns: Select Device, then Select Backup.
 * It fetches data from the API and pushes the selection back to the parent form state.
 */
export default function RestoreDeviceConfig({ parameters, onParamChange }) {
  const [backupMap, setBackupMap] = useState({}); // Stores the full {device: [backups]} data
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Track selections locally before sending to parent
  const [localDevice, setLocalDevice] = useState(parameters.device_name || ''); // Initialize with empty string
  const [localBackup, setLocalBackup] = useState(parameters.backup_id || ''); // Initialize with empty string

  // 1. Fetch data on component mount
  useEffect(() => {
    const fetchBackupData = async () => {
      try {
        const response = await axios.get(`${API_URL}/api/restore/available-backups`);
        setBackupMap(response.data);
      } catch (err) {
        console.error("Error fetching backup data:", err);
        setError("Failed to load available backups. Check API server.");
      } finally {
        setIsLoading(false);
      }
    };
    fetchBackupData();
  }, []);

  // 2. Handle Device Change
  const handleDeviceChange = (deviceName) => {
    setLocalDevice(deviceName);
    setLocalBackup(''); // Reset backup selection

    // Update parent state
    onParamChange('device_name', deviceName);
    onParamChange('backup_id', '');
  };

  // 3. Handle Backup Change
  const handleBackupChange = (backupId) => {
    setLocalBackup(backupId);
    onParamChange('backup_id', backupId);
  };

  if (isLoading) return <p className="text-center text-muted-foreground">Loading available backups...</p>;
  if (error) return <p className="text-center text-destructive">{error}</p>;

  const deviceNames = Object.keys(backupMap);
  const availableBackups = backupMap[localDevice] || [];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

      {/* Dropdown 1: Select Device */}
      <div className="space-y-2">
        <Label htmlFor="device-select">Device to Restore</Label>
        <Select value={localDevice} onValueChange={handleDeviceChange} disabled={isLoading || deviceNames.length === 0}>
          <SelectTrigger id="device-select">
            <SelectValue placeholder="Select a device" />
          </SelectTrigger>
          <SelectContent>
            {deviceNames.map((device) => (
              <SelectItem key={device} value={device}>
                {device}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Dropdown 2: Select Backup */}
      <div className="space-y-2">
        <Label htmlFor="backup-select">Available Backup</Label>
        <Select value={localBackup} onValueChange={handleBackupChange} disabled={!localDevice || availableBackups.length === 0}>
          <SelectTrigger id="backup-select">
            <SelectValue placeholder="Select a backup timestamp" />
          </SelectTrigger>
          <SelectContent>
            {availableBackups.map((backup) => (
              <SelectItem key={backup} value={backup}>
                {backup}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Display message if no backups are available after selection */}
      {!isLoading && localDevice && availableBackups.length === 0 && (
        <p className="text-sm text-yellow-600 md:col-span-2">No backups found for device **{localDevice}**.</p>
      )}
    </div>
  );
}
