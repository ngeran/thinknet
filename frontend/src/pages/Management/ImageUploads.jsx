/**
 * =============================================================================
 * IMAGE UPLOADER FORM COMPONENT
 * =============================================================================
 * A highly interactive and visually appealing form component for image uploads.
 * Provides a complete UI for file selection (via drag-and-drop or browsing),
 * device targeting, authentication, and initiating the upload process.
 * 
 * @version 1.0.0
 * @last_updated 2025-10-18
 * =============================================================================
 */

import React, { useState } from 'react';
import { Upload, File, X, CheckCircle2, Loader2, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

// Shared components
import DeviceAuthFields from '@/shared/DeviceAuthFields';
import DeviceTargetSelector from '@/shared/DeviceTargetSelector';

/**
 * Image Uploader Form Component
 * Handles image file selection and device configuration
 */
export default function ImageUploader({
  // Core State & Callbacks
  parameters,
  onParamChange,
  selectedFile,
  setSelectedFile,
  onUpload,
  isRunning,

  // Progress Display Props
  isUploading,
  uploadProgress
}) {
  // =========================================================================
  // 🧠 STATE MANAGEMENT
  // =========================================================================
  const [isDragging, setIsDragging] = useState(false);

  // =========================================================================
  // 🎯 FILE HANDLING FUNCTIONS
  // =========================================================================
  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      // Basic image type validation
      if (!file.type.startsWith('image/')) {
        console.warn('[IMAGE UPLOADER] Selected file is not an image:', file.type);
        return;
      }
      setSelectedFile(file);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (!file.type.startsWith('image/')) {
        console.warn('[IMAGE UPLOADER] Dropped file is not an image:', file.type);
        return;
      }
      setSelectedFile(file);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const removeFile = () => {
    setSelectedFile(null);
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
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
        {/* FILE SELECTION CARD */}
        {/* ------------------------------------------------------------------ */}
        <Card className="border-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Image Selection
            </CardTitle>
            <CardDescription>
              Choose an image file to upload to your network device
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div
              className={`
                relative border-2 border-dashed rounded-lg p-6 text-center transition-all duration-300
                ${isUploading
                  ? 'border-slate-400 bg-slate-100 cursor-not-allowed'
                  : selectedFile
                    ? 'border-green-200 bg-green-50 hover:border-green-300 cursor-pointer'
                    : isDragging
                      ? 'border-blue-300 bg-blue-50 cursor-pointer'
                      : 'border-gray-300 bg-gray-50 hover:border-gray-400 hover:bg-gray-100 cursor-pointer'
                }
              `}
              onClick={() => !(isRunning || isUploading) && document.getElementById('imageFileInput').click()}
              onDrop={!(isRunning || isUploading) ? handleDrop : (e) => e.preventDefault()}
              onDragOver={!(isRunning || isUploading) ? handleDragOver : (e) => e.preventDefault()}
              onDragLeave={!(isRunning || isUploading) ? handleDragLeave : (e) => e.preventDefault()}
            >
              <input
                id="imageFileInput"
                type="file"
                className="hidden"
                onChange={handleFileChange}
                accept="image/*,.bin,.img"
                disabled={isRunning || isUploading}
              />

              {/* PROGRESS OVERLAY */}
              {isUploading && (
                <div className="absolute inset-0 bg-white/90 backdrop-blur-sm flex flex-col items-center justify-center z-10 rounded-lg">
                  <Loader2 className="h-8 w-8 text-blue-600 animate-spin mb-3" />
                  <p className="text-lg font-semibold text-gray-800 mb-2">
                    Uploading... {uploadProgress?.toFixed(0) || 0}%
                  </p>
                  <div className="w-4/5 bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${uploadProgress || 0}%` }}
                    ></div>
                  </div>
                </div>
              )}

              {/* FILE SELECTED VIEW */}
              {selectedFile ? (
                <div className={`space-y-4 ${isUploading ? 'opacity-40' : ''}`}>
                  <div className="flex items-center justify-center">
                    <div className="relative">
                      <div className="p-4 bg-green-100 rounded-2xl">
                        <File className="h-12 w-12 text-green-600" />
                      </div>
                      <div className="absolute -top-1 -right-1 p-1 bg-green-500 rounded-full">
                        <CheckCircle2 className="h-4 w-4 text-white" />
                      </div>
                    </div>
                  </div>
                  <div>
                    <p className="text-lg font-semibold text-green-800 break-words mb-1">
                      {selectedFile.name}
                    </p>
                    <p className="text-sm text-green-600">
                      {formatFileSize(selectedFile.size)}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      Type: {selectedFile.type || 'Unknown'}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => { e.stopPropagation(); removeFile(); }}
                    disabled={isRunning || isUploading}
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                  >
                    <X className="h-4 w-4 mr-2" />
                    Remove File
                  </Button>
                </div>
              ) : (
                /* EMPTY STATE VIEW */
                <div className="space-y-4">
                  <div className="flex items-center justify-center">
                    <div className={`
                      p-6 rounded-2xl transition-all duration-300
                      ${isDragging
                        ? 'bg-blue-100 scale-110'
                        : 'bg-gray-200 hover:bg-blue-100 hover:scale-105'
                      }
                    `}>
                      <Upload className={`
                        h-16 w-16 transition-all duration-300
                        ${isDragging
                          ? 'text-blue-600'
                          : 'text-gray-500 hover:text-blue-600'
                        }
                      `} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <p className={`
                      text-xl font-bold transition-colors duration-200
                      ${isDragging
                        ? 'text-blue-700'
                        : 'text-gray-700 hover:text-blue-600'
                      }
                    `}>
                      {isDragging ? 'Drop your image here' : 'Choose an image or drag it here'}
                    </p>
                    <p className="text-sm text-gray-500 max-w-xs mx-auto">
                      Supports common image formats (JPG, PNG, GIF, BIN, IMG, etc.)
                    </p>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

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
              onParamChange={onParamChange}
            />
            <Separator />
            <DeviceAuthFields
              parameters={parameters}
              onParamChange={onParamChange}
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
                    <File className="h-4 w-4 text-green-600" />
                    <span className="font-medium">{selectedFile.name}</span>
                  </p>
                )}
                {parameters?.hostname && (
                  <p className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <span>Device: {parameters.hostname}</span>
                  </p>
                )}
                {!isFormValid && (
                  <p className="text-orange-600 text-sm">
                    {!selectedFile && '• Select an image file\n'}
                    {!parameters?.hostname && !parameters?.inventory_file && '• Configure device target\n'}
                    {(!parameters?.username || !parameters?.password) && '• Provide authentication credentials'}
                  </p>
                )}
              </div>
            </div>
            <Button
              onClick={onUpload}
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
