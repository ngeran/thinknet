/**
 * =============================================================================
 * FILE SELECTION COMPONENT
 * =============================================================================
 * A reusable file selection component with drag-and-drop support, progress display,
 * and file type validation.
 * 
 * @version 2.0.0 - COMPLETELY STANDALONE
 * @last_updated 2025-10-18
 * =============================================================================
 */

import React, { useState } from 'react';
import { Upload, File, X, CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function FileSelection({
  // Optional props - component works without them
  selectedFile: externalSelectedFile,
  setSelectedFile: externalSetSelectedFile,
  isRunning = false,
  isUploading = false,
  uploadProgress = 0,

  // Configuration
  allowedExtensions = [
    'jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'tiff', 'svg',
    'bin', 'img', 'rom', 'fw', 'chk', 'tar', 'gz', 'zip', '7z',
    'pkg', 'spa', 'a6', 'a8', 'a9'
  ],
  allowedMimeTypes = [
    'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/bmp',
    'image/webp', 'image/tiff', 'image/svg+xml', 'application/octet-stream',
    'application/zip', 'application/x-tar', 'application/gzip', 'application/x-7z-compressed'
  ],
  title = "File Selection",
  description = "Choose a file to upload to your network device",
  acceptText = "Supports common image and firmware formats"
}) {
  // =========================================================================
  // 🧠 COMPLETE STATE MANAGEMENT
  // =========================================================================
  const [internalSelectedFile, setInternalSelectedFile] = useState(null);
  const [isDragging, setIsDragging] = useState(false);

  // =========================================================================
  // 🔄 STATE RESOLUTION
  // =========================================================================
  const selectedFile = externalSelectedFile !== undefined ? externalSelectedFile : internalSelectedFile;
  const setSelectedFile = externalSetSelectedFile || setInternalSelectedFile;

  // =========================================================================
  // 🎯 FILE HANDLING FUNCTIONS
  // =========================================================================
  const isValidFileType = (file) => {
    if (allowedMimeTypes.includes(file.type)) return true;
    const fileExtension = file.name.split('.').pop().toLowerCase();
    return allowedExtensions.includes(fileExtension);
  };

  const getFileTypeDisplay = (file) => {
    if (file.type.startsWith('image/')) return 'Image File';
    if (file.name.match(/\.(bin|img|rom|fw|chk|pkg|spa)$/i)) return 'Firmware File';
    if (file.type === 'application/octet-stream') return 'Binary File';
    if (file.type.includes('zip') || file.type.includes('tar') || file.type.includes('gzip')) return 'Archive File';
    return file.type || 'Unknown Type';
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (!isValidFileType(file)) {
        alert(`File type not supported. Please upload: ${allowedExtensions.join(', ')} files.`);
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
      if (!isValidFileType(file)) {
        alert(`File type not supported. Please upload: ${allowedExtensions.join(', ')} files.`);
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
  // 🎨 UI RENDER
  // =========================================================================
  return (
    <Card className="border-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="h-5 w-5" />
          {title}
        </CardTitle>
        <CardDescription>
          {description}
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
          onClick={() => !(isRunning || isUploading) && document.getElementById('fileInput').click()}
          onDrop={!(isRunning || isUploading) ? handleDrop : (e) => e.preventDefault()}
          onDragOver={!(isRunning || isUploading) ? handleDragOver : (e) => e.preventDefault()}
          onDragLeave={!(isRunning || isUploading) ? handleDragLeave : (e) => e.preventDefault()}
        >
          <input
            id="fileInput"
            type="file"
            className="hidden"
            onChange={handleFileChange}
            accept={allowedExtensions.map(ext => `.${ext}`).join(',')}
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
                  Type: {getFileTypeDisplay(selectedFile)}
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
                  {isDragging ? 'Drop your file here' : 'Choose a file or drag it here'}
                </p>
                <p className="text-sm text-gray-500 max-w-xs mx-auto">
                  {acceptText}
                </p>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
