/**
 * =============================================================================
 * SELECT IMAGE RELEASE COMPONENT - MINIMALIST BLACK & WHITE
 * =============================================================================
 * A compact, elegant image selection component with monochrome design
 * Features: Space-efficient layout, subtle animations, clean aesthetics
 * 
 * @version 2.0.0
 * @last_updated 2025-10-19
 * =============================================================================
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Server, Layers, Code, Image, ChevronDown, Check, X, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';

// API Configuration
const API_URL = import.meta.env.VITE_API_GATEWAY_URL || 'http://localhost:8000';

/**
 * Compact Selection Display
 */
const CompactSelectionPill = ({ icon: Icon, label, value, onClear, isLast }) => {
  if (!value) return null;

  return (
    <div className="flex items-center gap-2">
      <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-black dark:bg-white text-white dark:text-black rounded-full text-xs font-medium group hover:pr-2 transition-all">
        <Icon className="w-3 h-3" />
        <span className="max-w-[120px] truncate">{value}</span>
        <button
          onClick={onClear}
          className="opacity-0 group-hover:opacity-100 w-4 h-4 flex items-center justify-center hover:bg-white/20 dark:hover:bg-black/20 rounded-full transition-opacity"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
      {!isLast && <ChevronDown className="w-3 h-3 text-gray-400 rotate-[-90deg]" />}
    </div>
  );
};

/**
 * Minimal Option Button
 */
const MinimalOption = ({ option, isSelected, onSelect }) => {
  return (
    <button
      onClick={() => onSelect(option.name)}
      className={`w-full text-left px-3 py-2 text-sm rounded-lg transition-all duration-200 ${isSelected
        ? 'bg-black dark:bg-white text-white dark:text-black font-medium'
        : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'
        }`}
    >
      <div className="flex items-center justify-between">
        <span className="truncate">{option.name}</span>
        {isSelected && (
          <Check className="w-3.5 h-3.5 flex-shrink-0 ml-2" />
        )}
      </div>
    </button>
  );
};

/**
 * Compact Selection Section
 */
const CompactSection = ({ title, icon: Icon, options, selectedValue, onSelect, isActive }) => {
  if (!isActive) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider px-1">
        <Icon className="w-3.5 h-3.5" />
        {title}
      </div>
      <div className="space-y-1">
        {options.map((option) => (
          <MinimalOption
            key={option.name || option.version || option.file}
            option={{ name: option.name || option.version || option.file }}
            isSelected={selectedValue === (option.name || option.version || option.file)}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
};

/**
 * Main Component
 */
export default function SelectImageRelease({ parameters = {}, onParamChange }) {
  const [inventory, setInventory] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedVendor, setSelectedVendor] = useState(parameters.vendor || '');
  const [selectedPlatform, setSelectedPlatform] = useState(parameters.platform || '');
  const [selectedRelease, setSelectedRelease] = useState(parameters.target_version || '');
  const [selectedImage, setSelectedImage] = useState(parameters.image_filename || '');

  // Fetch software versions from API
  useEffect(() => {
    const fetchSoftwareVersions = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch(`${API_URL}/api/inventories/software-images`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        setInventory(data);
      } catch (err) {
        console.error('[SelectImageRelease] Failed to fetch software images:', err);
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    };
    fetchSoftwareVersions();
  }, []);

  const vendorOptions = inventory?.vendors || [];
  const platformOptions = vendorOptions.find(v => v.name === selectedVendor)?.platforms || [];
  const releaseOptions = platformOptions.find(p => p.name === selectedPlatform)?.releases || [];
  const imageOptions = releaseOptions.find(r => r.version === selectedRelease)?.images || [];

  const handleSelection = useCallback((setter, paramName, value) => {
    setter(value);
    onParamChange(paramName, value);
  }, [onParamChange]);

  const handleVendorSelect = (name) => {
    handleSelection(setSelectedVendor, 'vendor', name);
    setSelectedPlatform(''); onParamChange('platform', '');
    setSelectedRelease(''); onParamChange('target_version', '');
    setSelectedImage(''); onParamChange('image_filename', '');
  };

  const handlePlatformSelect = (name) => {
    handleSelection(setSelectedPlatform, 'platform', name);
    setSelectedRelease(''); onParamChange('target_version', '');
    setSelectedImage(''); onParamChange('image_filename', '');
  };

  const handleReleaseSelect = (version) => {
    handleSelection(setSelectedRelease, 'target_version', version);
    setSelectedImage(''); onParamChange('image_filename', '');
  };

  const handleImageSelect = (file) => {
    handleSelection(setSelectedImage, 'image_filename', file);
  };

  const clearAll = () => {
    setSelectedVendor(''); onParamChange('vendor', '');
    setSelectedPlatform(''); onParamChange('platform', '');
    setSelectedRelease(''); onParamChange('target_version', '');
    setSelectedImage(''); onParamChange('image_filename', '');
  };

  if (isLoading) {
    return (
      <Card className="border border-gray-200 dark:border-gray-800">
        <CardContent className="py-12">
          <div className="flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-6 h-6 animate-spin text-gray-900 dark:text-gray-100" />
            <p className="text-sm text-gray-500 dark:text-gray-400">Loading inventory...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950">
        <CardContent className="py-8">
          <div className="text-center space-y-3">
            <X className="w-8 h-8 mx-auto text-red-600 dark:text-red-400" />
            <div className="text-sm text-red-900 dark:text-red-100 font-medium">Failed to load</div>
            <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
            <Button
              onClick={() => window.location.reload()}
              variant="outline"
              size="sm"
              className="mt-2"
            >
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const hasAnySelection = selectedVendor || selectedPlatform || selectedRelease || selectedImage;

  return (
    <Card className="border border-gray-200 dark:border-gray-800">
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-lg font-bold flex items-center gap-2">
              <Image className="w-4 h-4" />
              Software Image
            </CardTitle>
            <CardDescription className="text-xs mt-1">
              Select your target configuration
            </CardDescription>
          </div>
          {hasAnySelection && (
            <Button
              onClick={clearAll}
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
            >
              Clear all
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Current Selection Path */}
        {hasAnySelection && (
          <div className="flex flex-wrap items-center gap-2 pb-3 border-b border-gray-200 dark:border-gray-800">
            <CompactSelectionPill
              icon={Server}
              label="Vendor"
              value={selectedVendor}
              onClear={() => handleVendorSelect('')}
              isLast={!selectedPlatform && !selectedRelease && !selectedImage}
            />
            <CompactSelectionPill
              icon={Layers}
              label="Platform"
              value={selectedPlatform}
              onClear={() => handlePlatformSelect('')}
              isLast={!selectedRelease && !selectedImage}
            />
            <CompactSelectionPill
              icon={Code}
              label="Release"
              value={selectedRelease}
              onClear={() => handleReleaseSelect('')}
              isLast={!selectedImage}
            />
            <CompactSelectionPill
              icon={Image}
              label="Image"
              value={selectedImage}
              onClear={() => handleImageSelect('')}
              isLast={true}
            />
          </div>
        )}

        {/* Horizontal Layout for Vendor, Platform, Release */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Vendor Selection */}
          <CompactSection
            title="Vendor"
            icon={Server}
            options={vendorOptions}
            selectedValue={selectedVendor}
            onSelect={handleVendorSelect}
            isActive={true}
          />

          {/* Platform Selection */}
          {selectedVendor && (
            <CompactSection
              title="Platform"
              icon={Layers}
              options={platformOptions}
              selectedValue={selectedPlatform}
              onSelect={handlePlatformSelect}
              isActive={true}
            />
          )}

          {/* Release Selection */}
          {selectedPlatform && (
            <CompactSection
              title="Release"
              icon={Code}
              options={releaseOptions.map(r => ({ name: r.version }))}
              selectedValue={selectedRelease}
              onSelect={handleReleaseSelect}
              isActive={true}
            />
          )}
        </div>

        {/* Image File Selection */}
        {selectedRelease && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider px-1">
              <Image className="w-3.5 h-3.5" />
              Image File
            </div>
            <ScrollArea className="h-32">
              <div className="space-y-1 pr-3">
                {imageOptions.map((image) => (
                  <MinimalOption
                    key={image.file}
                    option={{ name: image.file }}
                    isSelected={selectedImage === image.file}
                    onSelect={handleImageSelect}
                  />
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        {/* Completion Indicator */}
        {selectedImage && (
          <div className="pt-4 border-t border-gray-200 dark:border-gray-800">
            <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
              <div className="w-1.5 h-1.5 bg-black dark:bg-white rounded-full animate-pulse" />
              <span>Configuration complete</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
