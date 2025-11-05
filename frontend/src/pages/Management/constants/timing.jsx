/**
 * =============================================================================
 * TIMING CONSTANTS
 * =============================================================================
 *
 * Centralized timing configuration for UI transitions and updates
 *
 * @module constants/timing
 */
 
export const TIMING = {
  /**
   * Delay before auto-scrolling to latest message (ms)
   * Lower values = more responsive scrolling
   * Higher values = less jitter
   */
  AUTO_SCROLL_DELAY: 50,
 
  /**
   * Delay before automatic tab transitions (ms)
   * Allows user to see completion message before transition
   */
  TAB_TRANSITION_DELAY: 1500,
 
  /**
   * Interval for progress bar update animations (ms)
   * Not currently used but reserved for smooth animations
   */
  PROGRESS_UPDATE_INTERVAL: 100,
};
3. constants/icons.js
JavaScript
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