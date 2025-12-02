/**
 * =============================================================================
 * ICON MAPPINGS
 * =============================================================================
 *
 * Maps pre-check validation categories to their corresponding icons
 *
 * @module constants/icons
 */
 
import {
  Shield,
  HardDrive,
  Activity,
  Database,
  CheckCircle,
  Zap,
  RefreshCw,
} from 'lucide-react';
 
/**
 * Icon mapping for pre-check validation categories
 *
 * Usage:
 * const IconComponent = PRE_CHECK_ICONS[checkName] || CheckCircle;
 */
export const PRE_CHECK_ICONS = {
  "Device Connectivity": Shield,
  "Storage Space": HardDrive,
  "System State": Activity,
  "Redundancy Status": Database,
  "Image Availability": CheckCircle,
  "Version Compatibility": Zap,
  "Snapshot Availability": RefreshCw,
  "Resource Utilization": Activity,
  // Additional mappings for comprehensive coverage
  "connectivity": Shield,
  "storage": HardDrive,
  "system_state": Activity,
  "redundancy": Database,
  "image": CheckCircle,
  "version": Zap,
  "snapshot": RefreshCw,
  "resources": Activity,
  "connectivity_check": Shield,
  "storage_check": HardDrive,
  "system_check": Activity,
  "redundancy_check": Database,
  "image_check": CheckCircle,
  "version_check": Zap,
  "snapshot_check": RefreshCw,
  "resource_check": Activity,
};

/**
 * Descriptive information for each pre-check type
 */
export const PRE_CHECK_DESCRIPTIONS = {
  "Device Connectivity": "Verifies network reachability and SSH access to the target device",
  "Storage Space": "Checks available disk space for the upgrade image and temporary files",
  "System State": "Validates system health and operational status",
  "Redundancy Status": "Ensures system redundancy and backup mechanisms are functional",
  "Image Availability": "Confirms the required upgrade image is accessible and valid",
  "Version Compatibility": "Validates compatibility between current and target versions",
  "Snapshot Availability": "Verifies sufficient space and permissions for system snapshots",
  "Resource Utilization": "Checks CPU, memory, and other resource availability",
};