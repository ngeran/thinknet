/**
 * =============================================================================
 * SELECT IMAGE RELEASE COMPONENT
 * =============================================================================
 * A hierarchical image selection component that allows users to select vendor,
 * platform, release, and specific image files through collapsible sections.
 * 
 * @version 1.0.0
 * @last_updated 2025-10-18
 * =============================================================================
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Server, Layers, Code, Image, ChevronDown, Check, X } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';

// API Configuration
const API_URL = import.meta.env.VITE_API_GATEWAY_URL || 'http://localhost:8000';

// Icon Library - Using correct lucide-react exports
const IconLibrary = {
  Server,
  Layers,
  CodeBracket: Code, // Use Code instead of CodeBracket
  Photo: Image,
  ChevronDown,
  Check,
  X
};

/**
 * Collapsible Section Component
 */
const CollapsibleSection = ({
  title,
  icon: Icon,
  isOpen,
  onToggle,
  children,
  color = 'blue',
  hasSelection = false
}) => {
  const colorClasses = {
    blue: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-600' },
    slate: { bg: 'bg-slate-50', border: 'border-slate-200', text: 'text-slate-600' },
    zinc: { bg: 'bg-zinc-50', border: 'border-zinc-200', text: 'text-zinc-600' },
    stone: { bg: 'bg-stone-50', border: 'border-stone-200', text: 'text-stone-600' },
    gray: { bg: 'bg-gray-50', border: 'border-gray-200', text: 'text-gray-600' }
  };

  const currentColor = colorClasses[color] || colorClasses.blue;

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button
        onClick={onToggle}
        className={`w-full px-4 py-3 flex items-center justify-between transition-colors ${isOpen
            ? `${currentColor.bg} border-b ${currentColor.border}`
            : hasSelection
              ? `${currentColor.bg}`
              : 'bg-gray-50 hover:bg-gray-100'
          }`}
      >
        <div className="flex items-center gap-2">
          <Icon className={`w-4 h-4 ${hasSelection ? currentColor.text : 'text-gray-500'}`} />
          <span className={`text-sm font-medium ${hasSelection ? 'text-gray-900' : 'text-gray-700'}`}>
            {title}
          </span>
          {hasSelection && (
            <div className={`w-2 h-2 ${currentColor.bg.replace('bg-', 'bg-').replace('-50', '-500')} rounded-full`}></div>
          )}
        </div>
        <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''} ${hasSelection ? currentColor.text : 'text-gray-400'}`} />
      </button>
      {isOpen && (
        <div className="p-4 bg-white animate-in fade-in duration-200">
          {children}
        </div>
      )}
    </div>
  );
};

/**
 * Option Item Component
 */
const OptionItem = ({ option, isSelected, onSelect, color = 'blue' }) => {
  const colorClasses = {
    blue: { border: 'border-blue-400', bg: 'bg-blue-50', text: 'text-blue-900' },
    slate: { border: 'border-slate-400', bg: 'bg-slate-50', text: 'text-slate-900' },
    zinc: { border: 'border-zinc-400', bg: 'bg-zinc-50', text: 'text-zinc-900' },
    stone: { border: 'border-stone-400', bg: 'bg-stone-50', text: 'text-stone-900' },
    gray: { border: 'border-gray-400', bg: 'bg-gray-50', text: 'text-gray-900' }
  };

  const currentColor = colorClasses[color] || colorClasses.blue;

  return (
    <button
      onClick={() => onSelect(option.name)}
      className={`w-full text-left p-3 rounded-lg border transition-all duration-200 ${isSelected
          ? `${currentColor.border} ${currentColor.bg} ${currentColor.text}`
          : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
        } group flex items-center justify-between`}
    >
      <span className="text-sm font-medium truncate pr-2">{option.name}</span>
      {isSelected && (
        <div className={`w-4 h-4 ${currentColor.bg.replace('bg-', 'bg-').replace('-50', '-500')} rounded-full flex items-center justify-center flex-shrink-0`}>
          <Check className="w-2 h-2 text-white" />
        </div>
      )}
    </button>
  );
};

/**
 * Main Select Image Release Component
 */
export default function SelectImageRelease({ parameters = {}, onParamChange }) {
  const [inventory, setInventory] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const [selectedVendor, setSelectedVendor] = useState(parameters.vendor || '');
  const [selectedPlatform, setSelectedPlatform] = useState(parameters.platform || '');
  const [selectedRelease, setSelectedRelease] = useState(parameters.target_version || '');
  const [selectedImage, setSelectedImage] = useState(parameters.image_filename || '');

  const [openSections, setOpenSections] = useState({
    vendor: true,
    platform: false,
    release: false,
    image: false
  });

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

  // Get available options based on current selections
  const vendorOptions = inventory?.vendors || [];
  const platformOptions = vendorOptions.find(v => v.name === selectedVendor)?.platforms || [];
  const releaseOptions = platformOptions.find(p => p.name === selectedPlatform)?.releases || [];
  const imageOptions = releaseOptions.find(r => r.version === selectedRelease)?.images || [];

  // Selection handlers
  const handleSelection = useCallback((setter, paramName, value, nextSection) => {
    setter(value);
    onParamChange(paramName, value);
    if (nextSection) {
      setOpenSections(prev => ({ ...prev, [nextSection]: true }));
    }
  }, [onParamChange]);

  const handleVendorSelect = (name) => {
    handleSelection(setSelectedVendor, 'vendor', name, 'platform');
    setSelectedPlatform(''); onParamChange('platform', '');
    setSelectedRelease(''); onParamChange('target_version', '');
    setSelectedImage(''); onParamChange('image_filename', '');
  };

  const handlePlatformSelect = (name) => {
    handleSelection(setSelectedPlatform, 'platform', name, 'release');
    setSelectedRelease(''); onParamChange('target_version', '');
    setSelectedImage(''); onParamChange('image_filename', '');
  };

  const handleReleaseSelect = (version) => {
    handleSelection(setSelectedRelease, 'target_version', version, 'image');
    setSelectedImage(''); onParamChange('image_filename', '');
  };

  const handleImageSelect = (file) => {
    handleSelection(setSelectedImage, 'image_filename', file, null);
  };

  const clearSelection = () => {
    setSelectedVendor(''); onParamChange('vendor', '');
    setSelectedPlatform(''); onParamChange('platform', '');
    setSelectedRelease(''); onParamChange('target_version', '');
    setSelectedImage(''); onParamChange('image_filename', '');
    setOpenSections({ vendor: true, platform: false, release: false, image: false });
  };

  // Loading and error states
  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-center py-8">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
              <p className="text-sm text-gray-500">Loading software inventory...</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center py-8">
            <div className="text-red-500 text-sm mb-2">Error loading software images</div>
            <p className="text-xs text-gray-500">{error}</p>
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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Image className="h-5 w-5" />
          Software Image Selection
        </CardTitle>
        <CardDescription>
          Select vendor, platform, release, and specific image file for upgrade
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Vendor Selection */}
          <CollapsibleSection
            title="Vendor"
            icon={Server}
            isOpen={openSections.vendor}
            onToggle={() => setOpenSections(s => ({ ...s, vendor: !s.vendor }))}
            color="gray"
            hasSelection={!!selectedVendor}
          >
            <div className="space-y-2">
              {vendorOptions.map(vendor => (
                <OptionItem
                  key={vendor.name}
                  option={vendor}
                  isSelected={selectedVendor === vendor.name}
                  onSelect={handleVendorSelect}
                  color="gray"
                />
              ))}
            </div>
          </CollapsibleSection>

          {/* Platform Selection */}
          {selectedVendor && (
            <CollapsibleSection
              title="Platform"
              icon={Layers}
              isOpen={openSections.platform}
              onToggle={() => setOpenSections(s => ({ ...s, platform: !s.platform }))}
              color="slate"
              hasSelection={!!selectedPlatform}
            >
              <div className="space-y-2">
                {platformOptions.map(platform => (
                  <OptionItem
                    key={platform.name}
                    option={platform}
                    isSelected={selectedPlatform === platform.name}
                    onSelect={handlePlatformSelect}
                    color="slate"
                  />
                ))}
              </div>
            </CollapsibleSection>
          )}

          {/* Release Selection */}
          {selectedPlatform && (
            <CollapsibleSection
              title="Release"
              icon={Code} // Using Code icon instead of CodeBracket
              isOpen={openSections.release}
              onToggle={() => setOpenSections(s => ({ ...s, release: !s.release }))}
              color="zinc"
              hasSelection={!!selectedRelease}
            >
              <div className="space-y-2">
                {releaseOptions.map(release => (
                  <OptionItem
                    key={release.version}
                    option={{ name: release.version }}
                    isSelected={selectedRelease === release.version}
                    onSelect={handleReleaseSelect}
                    color="zinc"
                  />
                ))}
              </div>
            </CollapsibleSection>
          )}

          {/* Image File Selection */}
          {selectedRelease && (
            <CollapsibleSection
              title="Image File"
              icon={Image}
              isOpen={openSections.image}
              onToggle={() => setOpenSections(s => ({ ...s, image: !s.image }))}
              color="stone"
              hasSelection={!!selectedImage}
            >
              <ScrollArea className="h-48">
                <div className="space-y-2 pr-4">
                  {imageOptions.map(image => (
                    <OptionItem
                      key={image.file}
                      option={{ name: image.file }}
                      isSelected={selectedImage === image.file}
                      onSelect={handleImageSelect}
                      color="stone"
                    />
                  ))}
                </div>
              </ScrollArea>
            </CollapsibleSection>
          )}

          {/* Final Selection Summary */}
          {selectedImage && (
            <div className="mt-4 p-4 bg-green-50 rounded-lg border border-green-200">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-green-800">Selected Image</span>
                <Button
                  onClick={clearSelection}
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 text-green-600 hover:text-green-800"
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
              <div className="space-y-2 text-xs text-green-700">
                <div className="flex justify-between">
                  <span className="font-medium">Vendor:</span>
                  <span>{selectedVendor}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-medium">Platform:</span>
                  <span>{selectedPlatform}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-medium">Release:</span>
                  <span>{selectedRelease}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-medium">Image:</span>
                  <span className="font-mono text-xs break-all">{selectedImage}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
