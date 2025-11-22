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
};