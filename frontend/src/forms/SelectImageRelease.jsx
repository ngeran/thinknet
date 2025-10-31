/**
 * =============================================================================
 * COMPACT IMAGE RELEASE SELECTOR - SPACE-EFFICIENT DESIGN
 * =============================================================================
 * A highly space-efficient image selection component with progressive disclosure
 * 
 * DESIGN PHILOSOPHY:
 * - Minimize vertical space by using a single-row dropdown approach
 * - Progressive disclosure: show only relevant options at each step
 * - Visual hierarchy through typography and subtle shadows
 * - Responsive grid layout adapts to available space
 * 
 * SPACE SAVINGS:
 * - Replaces vertical card stack with horizontal dropdown row
 * - Collapses selections into compact pills with breadcrumb-style navigation
 * - Uses native-like select appearance for familiarity
 * 
 * @version 3.0.0
 * @last_updated 2025-10-30
 * =============================================================================
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Server, Layers, Code, Image, ChevronDown, Check, X, Loader2, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

// =============================================================================
// API CONFIGURATION
// =============================================================================
const API_URL = import.meta.env.VITE_API_GATEWAY_URL || 'http://localhost:8000';

// =============================================================================
// COMPACT DROPDOWN SELECT COMPONENT
// =============================================================================
/**
 * A minimal, space-efficient select component styled for inline use
 * 
 * @param {string} label - Accessible label for the select
 * @param {string} value - Currently selected value
 * @param {Array} options - Array of {name: string} objects
 * @param {Function} onChange - Callback when selection changes
 * @param {React.Component} icon - Lucide icon component
 * @param {string} placeholder - Placeholder text when no selection
 * @param {boolean} disabled - Whether the select is disabled
 */
const CompactSelect = ({ label, value, options, onChange, icon: Icon, placeholder, disabled }) => {
  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      <label className="text-xs font-medium text-gray-600 dark:text-gray-400 flex items-center gap-1.5">
        <Icon className="w-3 h-3" />
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled || options.length === 0}
        className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed appearance-none bg-no-repeat bg-right pr-8 cursor-pointer hover:border-gray-300 dark:hover:border-gray-700 transition-colors"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='currentColor'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`,
          backgroundSize: '1.25rem',
          backgroundPosition: 'right 0.5rem center'
        }}
      >
        <option value="">{placeholder || `Select ${label.toLowerCase()}...`}</option>
        {options.map((option) => (
          <option key={option.name} value={option.name}>
            {option.name}
          </option>
        ))}
      </select>
    </div>
  );
};

// =============================================================================
// BREADCRUMB SELECTION PATH COMPONENT
// =============================================================================
/**
 * Displays the current selection path as compact, interactive breadcrumbs
 * Each breadcrumb can be clicked to clear that selection and all subsequent ones
 * 
 * @param {Array} selections - Array of {icon, label, value, onClear} objects
 */
const SelectionBreadcrumb = ({ selections }) => {
  const activeSelections = selections.filter(s => s.value);

  if (activeSelections.length === 0) return null;

  return (
    <div className="flex items-center gap-2 flex-wrap pb-3 border-b border-gray-100 dark:border-gray-800">
      {activeSelections.map((selection, index) => {
        const Icon = selection.icon;
        const isLast = index === activeSelections.length - 1;

        return (
          <React.Fragment key={selection.label}>
            <div className="group relative inline-flex items-center gap-1.5 px-2.5 py-1 bg-gray-100 dark:bg-gray-900 hover:bg-gray-200 dark:hover:bg-gray-800 rounded-md transition-colors">
              <Icon className="w-3 h-3 text-gray-600 dark:text-gray-400" />
              <span className="text-xs font-medium text-gray-900 dark:text-gray-100 max-w-[120px] truncate">
                {selection.value}
              </span>
              <button
                onClick={selection.onClear}
                className="opacity-0 group-hover:opacity-100 ml-1 w-3.5 h-3.5 flex items-center justify-center hover:bg-gray-300 dark:hover:bg-gray-700 rounded transition-opacity"
                title={`Clear ${selection.label.toLowerCase()}`}
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </div>
            {!isLast && (
              <ChevronDown className="w-3 h-3 text-gray-400 -rotate-90 flex-shrink-0" />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};

// =============================================================================
// IMAGE FILE LIST COMPONENT
// =============================================================================
/**
 * Displays available image files in a compact, scannable list
 * Uses radio button pattern for single selection
 * 
 * @param {Array} images - Array of image objects with {file} property
 * @param {string} selectedImage - Currently selected image filename
 * @param {Function} onSelect - Callback when an image is selected
 */
const ImageFileList = ({ images, selectedImage, onSelect }) => {
  if (!images || images.length === 0) return null;

  return (
    <div className="space-y-1.5 max-h-48 overflow-y-auto pr-2 scrollbar-thin">
      {images.map((image) => {
        const isSelected = selectedImage === image.file;

        return (
          <button
            key={image.file}
            onClick={() => onSelect(image.file)}
            className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all flex items-center justify-between gap-2 ${isSelected
                ? 'bg-black dark:bg-white text-white dark:text-black font-medium shadow-sm'
                : 'hover:bg-gray-50 dark:hover:bg-gray-900 text-gray-700 dark:text-gray-300'
              }`}
          >
            <span className="truncate flex-1">{image.file}</span>
            {isSelected && (
              <Check className="w-4 h-4 flex-shrink-0" />
            )}
          </button>
        );
      })}
    </div>
  );
};

// =============================================================================
// MAIN COMPONENT
// =============================================================================
/**
 * SelectImageRelease - Main component for software image selection
 * 
 * COMPONENT ARCHITECTURE:
 * 1. Fetches software inventory from API on mount
 * 2. Maintains selection state for: vendor → platform → release → image
 * 3. Each selection cascades: clearing vendor clears all downstream selections
 * 4. Communicates selections to parent via onParamChange callback
 * 
 * STATE MANAGEMENT:
 * - Local state for UI (selections, loading, errors)
 * - Props for parent communication (parameters, onParamChange)
 * - Derived state for available options based on current selections
 * 
 * @param {Object} parameters - Initial parameter values from parent
 * @param {Function} onParamChange - Callback to notify parent of changes
 */
export default function SelectImageRelease({ parameters = {}, onParamChange }) {
  // =========================================================================
  // STATE DECLARATIONS
  // =========================================================================
  const [inventory, setInventory] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Selection state
  const [selectedVendor, setSelectedVendor] = useState(parameters.vendor || '');
  const [selectedPlatform, setSelectedPlatform] = useState(parameters.platform || '');
  const [selectedRelease, setSelectedRelease] = useState(parameters.target_version || '');
  const [selectedImage, setSelectedImage] = useState(parameters.image_filename || '');

  // =========================================================================
  // DATA FETCHING
  // =========================================================================
  /**
   * Fetches software inventory from API
   * Runs once on component mount
   * Expected API response structure:
   * {
   *   vendors: [
   *     {
   *       name: string,
   *       platforms: [
   *         {
   *           name: string,
   *           releases: [
   *             {
   *               version: string,
   *               images: [{file: string}]
   *             }
   *           ]
   *         }
   *       ]
   *     }
   *   ]
   * }
   */
  useEffect(() => {
    const fetchSoftwareVersions = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(`${API_URL}/api/inventories/software-images`);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        setInventory(data);
      } catch (err) {
        console.error('[SelectImageRelease] API fetch failed:', err);
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    };

    fetchSoftwareVersions();
  }, []);

  // =========================================================================
  // DERIVED STATE - Available Options
  // =========================================================================
  // Calculate available options based on current selections
  const vendorOptions = inventory?.vendors || [];
  const platformOptions = vendorOptions.find(v => v.name === selectedVendor)?.platforms || [];
  const releaseOptions = platformOptions.find(p => p.name === selectedPlatform)?.releases || [];
  const imageOptions = releaseOptions.find(r => r.version === selectedRelease)?.images || [];

  // =========================================================================
  // SELECTION HANDLERS
  // =========================================================================
  /**
   * Generic selection handler with cascade clearing
   * Updates local state and notifies parent component
   */
  const handleSelection = useCallback((setter, paramName, value) => {
    setter(value);
    onParamChange(paramName, value);
  }, [onParamChange]);

  /**
   * Vendor selection handler
   * Clears all downstream selections (platform, release, image)
   */
  const handleVendorSelect = (name) => {
    handleSelection(setSelectedVendor, 'vendor', name);
    setSelectedPlatform('');
    onParamChange('platform', '');
    setSelectedRelease('');
    onParamChange('target_version', '');
    setSelectedImage('');
    onParamChange('image_filename', '');
  };

  /**
   * Platform selection handler
   * Clears downstream selections (release, image)
   */
  const handlePlatformSelect = (name) => {
    handleSelection(setSelectedPlatform, 'platform', name);
    setSelectedRelease('');
    onParamChange('target_version', '');
    setSelectedImage('');
    onParamChange('image_filename', '');
  };

  /**
   * Release selection handler
   * Clears downstream selections (image)
   */
  const handleReleaseSelect = (version) => {
    handleSelection(setSelectedRelease, 'target_version', version);
    setSelectedImage('');
    onParamChange('image_filename', '');
  };

  /**
   * Image selection handler (terminal node, no cascade)
   */
  const handleImageSelect = (file) => {
    handleSelection(setSelectedImage, 'image_filename', file);
  };

  /**
   * Clears all selections and notifies parent
   */
  const clearAll = () => {
    setSelectedVendor('');
    onParamChange('vendor', '');
    setSelectedPlatform('');
    onParamChange('platform', '');
    setSelectedRelease('');
    onParamChange('target_version', '');
    setSelectedImage('');
    onParamChange('image_filename', '');
  };

  // =========================================================================
  // LOADING STATE
  // =========================================================================
  if (isLoading) {
    return (
      <Card className="border border-gray-200 dark:border-gray-800">
        <CardContent className="py-8">
          <div className="flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-5 h-5 animate-spin text-gray-900 dark:text-gray-100" />
            <p className="text-sm text-gray-500 dark:text-gray-400">Loading software inventory...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // =========================================================================
  // ERROR STATE
  // =========================================================================
  if (error) {
    return (
      <Card className="border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950">
        <CardContent className="py-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1 space-y-2">
              <div className="text-sm font-medium text-red-900 dark:text-red-100">
                Failed to load software inventory
              </div>
              <p className="text-xs text-red-700 dark:text-red-300 font-mono">
                {error}
              </p>
              <Button
                onClick={() => window.location.reload()}
                variant="outline"
                size="sm"
                className="mt-3 text-xs"
              >
                Retry
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // =========================================================================
  // MAIN RENDER
  // =========================================================================
  const hasAnySelection = selectedVendor || selectedPlatform || selectedRelease || selectedImage;
  const isComplete = selectedImage !== '';

  return (
    <Card className="border border-gray-200 dark:border-gray-800">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <Image className="w-4 h-4" />
              Software Image Selection
            </CardTitle>
            <CardDescription className="text-xs mt-1">
              {isComplete
                ? 'Configuration complete'
                : 'Select vendor, platform, release, and image file'
              }
            </CardDescription>
          </div>
          {hasAnySelection && (
            <Button
              onClick={clearAll}
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs hover:bg-gray-100 dark:hover:bg-gray-900"
            >
              Clear all
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Selection Breadcrumb */}
        <SelectionBreadcrumb
          selections={[
            {
              icon: Server,
              label: 'Vendor',
              value: selectedVendor,
              onClear: () => handleVendorSelect('')
            },
            {
              icon: Layers,
              label: 'Platform',
              value: selectedPlatform,
              onClear: () => handlePlatformSelect('')
            },
            {
              icon: Code,
              label: 'Release',
              value: selectedRelease,
              onClear: () => handleReleaseSelect('')
            },
            {
              icon: Image,
              label: 'Image',
              value: selectedImage,
              onClear: () => handleImageSelect('')
            }
          ]}
        />

        {/* Compact Selection Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {/* Vendor Dropdown */}
          <CompactSelect
            label="Vendor"
            value={selectedVendor}
            options={vendorOptions}
            onChange={handleVendorSelect}
            icon={Server}
            placeholder="Choose vendor..."
          />

          {/* Platform Dropdown */}
          <CompactSelect
            label="Platform"
            value={selectedPlatform}
            options={platformOptions}
            onChange={handlePlatformSelect}
            icon={Layers}
            placeholder="Choose platform..."
            disabled={!selectedVendor}
          />

          {/* Release Dropdown */}
          <CompactSelect
            label="Release"
            value={selectedRelease}
            options={releaseOptions.map(r => ({ name: r.version }))}
            onChange={handleReleaseSelect}
            icon={Code}
            placeholder="Choose release..."
            disabled={!selectedPlatform}
          />
        </div>

        {/* Image File Selection */}
        {selectedRelease && imageOptions.length > 0 && (
          <div className="space-y-2 pt-2">
            <label className="text-xs font-medium text-gray-600 dark:text-gray-400 flex items-center gap-1.5">
              <Image className="w-3 h-3" />
              Image File
            </label>
            <ImageFileList
              images={imageOptions}
              selectedImage={selectedImage}
              onSelect={handleImageSelect}
            />
          </div>
        )}

        {/* Completion Indicator */}
        {isComplete && (
          <div className="flex items-center gap-2 pt-3 border-t border-gray-100 dark:border-gray-800">
            <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
            <span className="text-xs font-medium text-green-600 dark:text-green-400">
              Ready to proceed
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
