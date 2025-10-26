/**
 * =============================================================================
 * IMAGE UPLOADER FORM COMPONENT
 * =============================================================================
 * A highly interactive and visually appealing form component for image uploads.
 * Provides a complete UI for file selection (via drag-and-drop or browsing),
 * device targeting, authentication, and initiating the upload process.
 * 
 * @version 2.0.1 - FIXED UPLOAD HANDLING
 * @last_updated 2025-10-18
 * =============================================================================
 */

import React, { useState } from 'react';
import { CheckCircle2, ArrowRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

// Shared components
import DeviceAuthFields from '@/shared/DeviceAuthFields';
import DeviceTargetSelector from '@/shared/DeviceTargetSelector';
import FileSelection from '@/shared/FileSelection';

/**
 * Image Uploader Form Component
 * Handles image file selection and device configuration
 */
export default function ImageUploader({
  // Optional props - component works without them
  parameters: externalParameters,
  onParamChange: externalOnParamChange,
  selectedFile: externalSelectedFile,
  setSelectedFile: externalSetSelectedFile,
  onUpload,
  isRunning = false,
  isUploading = false,
  uploadProgress = 0
}) {
  // =========================================================================
  // 🧠 COMPLETE STATE MANAGEMENT - Standalone version
  // =========================================================================
  const [internalSelectedFile, setInternalSelectedFile] = useState(null);
  const [internalParameters, setInternalParameters] = useState({
    hostname: '',
    inventory_file: '',
    username: '',
    password: ''
  });

  // =========================================================================
  // 🔄 STATE RESOLUTION - Use external props if provided, otherwise internal state
  // =========================================================================
  const selectedFile = externalSelectedFile !== undefined ? externalSelectedFile : internalSelectedFile;
  const parameters = externalParameters || internalParameters;

  // Determine which state setters to use
  const setSelectedFile = externalSetSelectedFile || setInternalSelectedFile;
  const setParameters = externalOnParamChange
    ? (name, value) => externalOnParamChange(name, value)
    : (name, value) => setInternalParameters(prev => ({ ...prev, [name]: value }));

  // =========================================================================
  // 🎯 HANDLER FUNCTIONS
  // =========================================================================
  const handleParamChange = (name, value) => {
    setParameters(name, value);
  };

  const handleUpload = () => {
    if (!isFormValid) {
      console.warn('[IMAGE UPLOADER] Form validation failed, cannot upload');
      return;
    }

    if (onUpload) {
      // If parent provided onUpload, use it with current state
      console.log('[IMAGE UPLOADER] Calling parent onUpload handler');
      onUpload();
    } else {
      // No upload handler provided - show error or implement default behavior
      console.error('[IMAGE UPLOADER] No upload handler provided. Cannot proceed with upload.');
      console.log('[IMAGE UPLOADER] Upload data:', {
        file: selectedFile,
        parameters: parameters
      });
      // You could implement a default upload here or just show a message
      // For now, we'll just log and do nothing since we don't have backend integration
    }
  };

  // =========================================================================
  // 🧩 VALIDATION
  // =========================================================================
  const isFormValid =
    selectedFile &&
    parameters?.username?.trim() &&
    parameters?.password?.trim() &&
    (parameters?.hostname?.trim() || parameters?.inventory_file?.trim());

  // =========================================================================
  // 🎨 UI RENDER
  // =========================================================================
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ------------------------------------------------------------------ */}
        {/* FILE SELECTION CARD - Using Shared Component */}
        {/* ------------------------------------------------------------------ */}
        <FileSelection
          selectedFile={selectedFile}
          setSelectedFile={setSelectedFile}
          isRunning={isRunning}
          isUploading={isUploading}
          uploadProgress={uploadProgress}
          title="Image Selection"
          description="Choose an image or firmware file to upload to your network device"
          acceptText="Supports common image formats (JPG, PNG, GIF, BIN, IMG, etc.)"
        />

        {/* ------------------------------------------------------------------ */}
        {/* DEVICE CONFIGURATION CARD */}
        {/* ------------------------------------------------------------------ */}
        <Card>
          <CardHeader>
            <CardTitle>Device Configuration</CardTitle>
            <CardDescription>
              Target device and authentication settings
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <DeviceTargetSelector
              parameters={parameters}
              onParamChange={handleParamChange}
            />
            <Separator />
            <DeviceAuthFields
              parameters={parameters}
              onParamChange={handleParamChange}
            />
          </CardContent>
        </Card>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* UPLOAD ACTION CARD */}
      {/* ------------------------------------------------------------------ */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex-1">
              <h4 className="text-lg font-semibold mb-2">Ready to Upload</h4>
              <div className="space-y-1 text-sm text-gray-600">
                {selectedFile && (
                  <p className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <span className="font-medium">{selectedFile.name}</span>
                  </p>
                )}
                {parameters?.hostname && (
                  <p className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <span>Device: {parameters.hostname}</span>
                  </p>
                )}
                {parameters?.inventory_file && !parameters?.hostname && (
                  <p className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <span>Inventory File: {parameters.inventory_file}</span>
                  </p>
                )}
                {!isFormValid && (
                  <p className="text-orange-600 text-sm whitespace-pre-line">
                    {!selectedFile && '• Select an image file\n'}
                    {!parameters?.hostname && !parameters?.inventory_file && '• Configure device target\n'}
                    {(!parameters?.username || !parameters?.password) && '• Provide authentication credentials'}
                  </p>
                )}
              </div>
            </div>
            <Button
              onClick={handleUpload}
              disabled={isRunning || isUploading || !isFormValid}
              size="lg"
              className="w-full sm:w-auto"
            >
              {isUploading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Uploading... {uploadProgress?.toFixed(0) || 0}%
                </>
              ) : (
                <>
                  Upload Image
                  <ArrowRight className="h-4 w-4 ml-2" />
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
