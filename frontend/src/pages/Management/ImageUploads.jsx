/**
 * =============================================================================
 * FILE LOCATION: frontend/src/pages/Management/ImageUploads.jsx
 * DESCRIPTION:   Production Image Upload Component (Refactored)
 * VERSION:       3.0.6 - Direct Progress Handling Fallback
 * =============================================================================
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Loader2, HardDrive, Upload, CheckCircle2, XCircle,
  AlertCircle, Terminal, FileText, FileCheck,
  Server, CloudUpload
} from 'lucide-react';

// UI Components
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';

// Shared Form Components
import DeviceAuthFields from '@/shared/DeviceAuthFields';
import DeviceTargetSelector from '@/shared/DeviceTargetSelector';
import FileSelection from '@/shared/FileSelection';
import LiveLogViewer from '@/components/realTimeProgress/LiveLogViewer';

// Hooks
import { useJobWebSocket } from '@/hooks/useJobWebSocket';
import useWorkflowMessages from '@/hooks/useWorkflowMessages'; 

// =============================================================================
// SECTION 1: CONFIGURATION
// =============================================================================

const API_BASE = import.meta.env.VITE_API_GATEWAY_URL || 'http://localhost:8000';
const VALIDATION_DEBOUNCE_DELAY = 2000;

const UPLOAD_STEPS = {
  FILE_SELECTION: 1,
  DEVICE_CONFIG: 2,
  STORAGE_VALIDATION: 3,
  UPLOAD: 4,
  COMPLETE: 5
};

// =============================================================================
// SECTION 2: COMPONENT DEFINITION
// =============================================================================

export default function ImageUploads({
  // Optional props for external control
  parameters: externalParameters,
  onParamChange: externalOnParamChange,
  selectedFile: externalSelectedFile,
  setSelectedFile: externalSetSelectedFile,
  isRunning = false,
  isUploading: externalIsUploading,
  uploadProgress: externalUploadProgress
}) {

  // ===========================================================================
  // SECTION 3: STATE MANAGEMENT
  // ===========================================================================

  const [internalSelectedFile, setInternalSelectedFile] = useState(null);
  const [internalParameters, setInternalParameters] = useState({
    hostname: '', username: '', password: ''
  });

  // Storage validation state
  const [checkJobId, setCheckJobId] = useState(null);
  const [storageCheck, setStorageCheck] = useState(null);
  const [isCheckingStorage, setIsCheckingStorage] = useState(false);
  const [storageCheckError, setStorageCheckError] = useState(null);

  // Upload state
  const [uploadJobId, setUploadJobId] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadComplete, setUploadComplete] = useState(false);

  // Terminal logs state
  const [terminalLogs, setTerminalLogs] = useState([]);
  const [showTechnicalLogs, setShowTechnicalLogs] = useState(false);
  const terminalEndRef = useRef(null);

  // UI state
  const [currentStep, setCurrentStep] = useState(UPLOAD_STEPS.FILE_SELECTION);

  // ===========================================================================
  // SECTION 4: PROPS RESOLUTION
  // ===========================================================================

  const selectedFile = externalSelectedFile !== undefined ? externalSelectedFile : internalSelectedFile;
  const parameters = externalParameters || internalParameters;
  const isUploadingResolved = externalIsUploading !== undefined ? externalIsUploading : isUploading;
  const uploadProgressResolved = externalUploadProgress !== undefined ? externalUploadProgress : uploadProgress;

  const setSelectedFile = externalSetSelectedFile || setInternalSelectedFile;
  const setParameters = externalOnParamChange
    ? (name, value) => externalOnParamChange(name, value)
    : (name, value) => setInternalParameters(prev => ({ ...prev, [name]: value }));

  // ===========================================================================
  // SECTION 5: WEBSOCKET & MESSAGING
  // ===========================================================================

  const { sendMessage, lastMessage, isConnected } = useJobWebSocket();

  // Create a memoized map of setters to pass to the hook
  const stateSetters = useMemo(() => ({
    // Mapped keys for 'image-upload' config in hook - MUST MATCH stateMap in useWorkflowMessages
    uploadJobId: setUploadJobId,
    uploadProgress: setUploadProgress, 
    isUploading: setIsUploading,
    uploadComplete: setUploadComplete,
    uploadError: setUploadError,
    terminalLogs: setTerminalLogs,
    // Custom keys specific to this component's logic
    setStorageCheck, 
    setStorageCheckError,
    setIsCheckingStorage
  }), []);

  /**
   * INTEGRATE THE REUSABLE HOOK
   */
  useWorkflowMessages({
    workflowType: 'image-upload',
    jobId: uploadJobId || checkJobId, // Listen for either job type
    lastMessage,
    stateSetters,
  });

  // ===========================================================================
  // SECTION 5A: DIRECT PROGRESS HANDLING FALLBACK
  // ===========================================================================

  /**
   * DIRECT FIX: Handle progress updates directly as a fallback
   * This ensures progress updates work even if the hook has issues
   */
  useEffect(() => {
    if (!lastMessage) return;

    try {
      const eventData = JSON.parse(lastMessage);
      
      // Handle PROGRESS_UPDATE events directly
      if (eventData.event_type === 'PROGRESS_UPDATE') {
        const progress = eventData.data?.progress;
        console.log('🔄 [DIRECT] PROGRESS_UPDATE received:', progress, '%'); // DEBUG
        
        if (typeof progress === 'number' && progress >= 0 && progress <= 100) {
          console.log('✅ [DIRECT] Setting upload progress:', progress, '%'); // DEBUG
          setUploadProgress(progress);
        }
      }
      
      // Handle completion events directly
      if (eventData.event_type === 'UPLOAD_COMPLETE' || eventData.success === true) {
        console.log('✅ [DIRECT] Upload complete detected'); // DEBUG
        setUploadProgress(100);
        setUploadComplete(true);
        setIsUploading(false);
      }
      
      // Handle error events directly
      if (eventData.event_type === 'ERROR') {
        console.log('❌ [DIRECT] Error detected:', eventData.message); // DEBUG
        setUploadError(eventData.message);
        setIsUploading(false);
      }
      
    } catch (err) {
      // Not JSON, ignore - this is normal for some log messages
    }
  }, [lastMessage]);

  // Auto-scroll logs
  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [terminalLogs]);

  // ===========================================================================
  // SECTION 6: STEP MANAGEMENT
  // ===========================================================================

  useEffect(() => {
    if (uploadComplete) {
      setCurrentStep(UPLOAD_STEPS.COMPLETE);
    } else if (isUploadingResolved) {
      setCurrentStep(UPLOAD_STEPS.UPLOAD);
    } else if (storageCheck && storageCheck.has_sufficient_space) {
      setCurrentStep(UPLOAD_STEPS.STORAGE_VALIDATION);
    } else if (parameters.hostname && parameters.username && parameters.password) {
      setCurrentStep(UPLOAD_STEPS.DEVICE_CONFIG);
    } else if (selectedFile) {
      setCurrentStep(UPLOAD_STEPS.FILE_SELECTION);
    }
  }, [selectedFile, parameters, storageCheck, isUploadingResolved, uploadComplete]);

  // ===========================================================================
  // SECTION 7: ACTIONS (API CALLS)
  // ===========================================================================

  const startStorageCheck = async () => {
    if (!selectedFile || !parameters.hostname || !parameters.username || !parameters.password) return;

    setIsCheckingStorage(true);
    setStorageCheckError(null);
    setStorageCheck(null);
    setTerminalLogs([{
      id: 'validation_start',
      type: 'INFO',
      message: `🔍 Validating storage on ${parameters.hostname}...`,
      timestamp: new Date().toLocaleTimeString(),
      isTechnical: false
    }]);

    try {
      const payload = {
        hostname: parameters.hostname,
        username: parameters.username,
        password: parameters.password,
        tests: ["test_storage_check"],
        mode: "check",
        tag: "snap",
        file_size: selectedFile.size
      };

      const response = await fetch(`${API_BASE}/api/operations/validation/execute-v2`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) throw new Error(await response.text());

      const data = await response.json();
      setCheckJobId(data.job_id);

      if (data.ws_channel && isConnected) {
        sendMessage({ type: 'SUBSCRIBE', channel: data.ws_channel });
      }

    } catch (error) {
      setStorageCheckError(error.message);
      setIsCheckingStorage(false);
      setTerminalLogs(prev => [...prev, {
        id: 'validation_error',
        type: 'ERROR',
        message: `Validation failed: ${error.message}`,
        timestamp: new Date().toLocaleTimeString(),
        isTechnical: false
      }]);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile || !parameters.hostname || !parameters.username || !parameters.password) return;

    // FIX: Explicitly clear the storage check states before starting upload.
    setIsCheckingStorage(false);
    setStorageCheckError(null);
    
    setIsUploading(true);
    setUploadError(null);
    setUploadProgress(0);
    setUploadComplete(false);
    
    setTerminalLogs(prev => [...prev, {
      id: 'upload_start',
      type: 'INFO',
      message: `📤 Starting upload of ${selectedFile.name}...`,
      timestamp: new Date().toLocaleTimeString(),
      isTechnical: false
    }]);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('hostname', parameters.hostname);
      formData.append('username', parameters.username);
      formData.append('password', parameters.password);
      formData.append('protocol', 'scp');
      formData.append('scriptId', `image_upload_${Date.now()}`);
      formData.append('wsClientId', 'web_client');
      formData.append('remote_filename', selectedFile.name);

      const response = await fetch(`${API_BASE}/api/files/upload`, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) throw new Error(await response.text());

      const data = await response.json();
      setUploadJobId(data.job_id);

      if (data.ws_channel && isConnected) {
        sendMessage({ type: 'SUBSCRIBE', channel: data.ws_channel });
      }

    } catch (error) {
      setUploadError(error.message);
      setIsUploading(false);
      setTerminalLogs(prev => [...prev, {
        id: 'upload_error',
        type: 'ERROR',
        message: `Upload failed: ${error.message}`,
        timestamp: new Date().toLocaleTimeString(),
        isTechnical: false
      }]);
    }
  };

  const handleReset = () => {
    setInternalSelectedFile(null);
    setInternalParameters({ hostname: '', username: '', password: '' });
    setStorageCheck(null);
    setStorageCheckError(null);
    setUploadError(null);
    setUploadProgress(0);
    setUploadComplete(false);
    setTerminalLogs([]);
    setCurrentStep(UPLOAD_STEPS.FILE_SELECTION);
  };

  // ===========================================================================
  // SECTION 8: AUTO-VALIDATION TRIGGER
  // ===========================================================================

  useEffect(() => {
    const isReady = selectedFile && parameters.hostname && parameters.username && parameters.password;

    if (isReady && !isCheckingStorage && !storageCheck) {
      const timer = setTimeout(startStorageCheck, VALIDATION_DEBOUNCE_DELAY);
      return () => clearTimeout(timer);
    } else if (!isReady) {
      setStorageCheck(null);
      setStorageCheckError(null);
    }
  }, [selectedFile, parameters.hostname, parameters.username, parameters.password]);

  // ===========================================================================
  // SECTION 9: HELPER FUNCTIONS
  // ===========================================================================

  const getStorageStatusIcon = () => {
    if (isCheckingStorage) return <Loader2 className="h-5 w-5 animate-spin text-gray-600" />;
    if (storageCheckError || (storageCheck && !storageCheck.has_sufficient_space)) return <XCircle className="h-5 w-5 text-red-600" />;
    if (storageCheck && storageCheck.has_sufficient_space) return <CheckCircle2 className="h-5 w-5 text-green-600" />;
    return <HardDrive className="h-5 w-5 text-gray-400" />;
  };

  const getStorageStatusText = () => {
    if (isCheckingStorage) return 'Validating storage...';
    if (storageCheckError) return 'Validation failed';
    if (storageCheck && !storageCheck.has_sufficient_space) return 'Insufficient space';
    if (storageCheck && storageCheck.has_sufficient_space) return 'Storage validated';
    return 'Pending validation';
  };

  const getStorageStatusColor = () => {
    if (isCheckingStorage) return 'border-gray-400 bg-gray-50';
    if (storageCheckError || (storageCheck && !storageCheck.has_sufficient_space)) return 'border-red-200 bg-red-50';
    if (storageCheck && storageCheck.has_sufficient_space) return 'border-green-200 bg-green-50';
    return 'border-gray-200 bg-gray-50';
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return '0 B';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  };

  // ===========================================================================
  // SECTION 10: RENDER UI
  // ===========================================================================

  return (
    <div className="w-full max-w-7xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <CloudUpload className="h-8 w-8 text-gray-900" />
            Image Upload Workflow
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            Upload firmware images and configuration files with pre-validation.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant={isConnected ? "success" : "destructive"} className="text-sm">
            {isConnected ? '🟢 WS Connected' : '🔴 WS Disconnected'}
          </Badge>
          {uploadComplete && (
            <Badge variant="success" className="text-sm">✅ Upload Complete</Badge>
          )}
        </div>
      </div>
      <Separator />

      {/* Progress Steps */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            {[
              { step: UPLOAD_STEPS.FILE_SELECTION, label: '1. Select File', icon: FileCheck },
              { step: UPLOAD_STEPS.DEVICE_CONFIG, label: '2. Device Config', icon: Server },
              { step: UPLOAD_STEPS.STORAGE_VALIDATION, label: '3. Storage Check', icon: HardDrive },
              { step: UPLOAD_STEPS.UPLOAD, label: '4. Upload', icon: Upload },
              { step: UPLOAD_STEPS.COMPLETE, label: '5. Complete', icon: CheckCircle2 }
            ].map(({ step, label, icon: Icon }, index) => (
              <React.Fragment key={step}>
                <div className={`flex flex-col items-center w-1/5 text-center ${currentStep >= step ? 'text-gray-900' : 'text-gray-400'}`}>
                  <div className={`flex items-center justify-center w-10 h-10 rounded-full border-2 ${
                    currentStep >= step ? 'bg-gray-900 border-gray-900 text-white' : 'border-gray-300 bg-white'
                  }`}>
                    {currentStep > step ? <CheckCircle2 className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
                  </div>
                  <span className="text-xs font-medium mt-2 hidden sm:block">{label}</span>
                  {currentStep === step && <div className="w-2 h-2 bg-gray-900 rounded-full mt-1" />}
                </div>
                {index < 4 && <div className={`flex-1 h-1 mx-2 sm:mx-4 ${currentStep > step ? 'bg-gray-900' : 'bg-gray-200'}`} />}
              </React.Fragment>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Main Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Step 1: File */}
        <Card className={currentStep >= UPLOAD_STEPS.FILE_SELECTION ? 'border-gray-900 shadow-lg' : 'border-gray-200'}>
          <CardHeader className="pb-4 bg-gray-50/50">
            <CardTitle className="flex items-center gap-2 text-lg">
              <FileCheck className="h-5 w-5 text-gray-900" />
              1. Select File
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <FileSelection
              selectedFile={selectedFile}
              setSelectedFile={setSelectedFile}
              isRunning={isRunning || isUploadingResolved}
            />
          </CardContent>
        </Card>

        {/* Step 2: Config */}
        <Card className={currentStep >= UPLOAD_STEPS.DEVICE_CONFIG ? 'border-gray-900 shadow-lg' : 'border-gray-200'}>
          <CardHeader className="pb-4 bg-gray-50/50">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Server className="h-5 w-5 text-gray-900" />
              2. Device Configuration
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-6">
            <DeviceTargetSelector parameters={parameters} onParamChange={setParameters} />
            <Separator />
            <DeviceAuthFields parameters={parameters} onParamChange={setParameters} />
          </CardContent>
        </Card>

        {/* Step 3: Logs */}
        <Card className="border-gray-200">
          <CardHeader className="pb-4 bg-gray-50/50">
             <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-lg text-gray-900">
                <Terminal className="h-5 w-5 text-gray-900" />
                Live Execution Log
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowTechnicalLogs(!showTechnicalLogs)}
                className="text-xs text-gray-600"
              >
                {showTechnicalLogs ? 'Hide Debug' : 'Show Debug'}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <LiveLogViewer
              logs={terminalLogs}
              isConnected={isConnected}
              height="h-[350px]"
              showTechnical={showTechnicalLogs}
              isDarkTheme={true}
            />
          </CardContent>
        </Card>

        {/* Step 4: Action */}
        <Card className={currentStep >= UPLOAD_STEPS.STORAGE_VALIDATION ? 'border-gray-900 shadow-lg' : 'border-gray-200'}>
          <CardHeader className="pb-4 bg-gray-50/50">
            <CardTitle className="flex items-center gap-2 text-lg">
              <HardDrive className="h-5 w-5 text-gray-900" />
              3. Validation & Upload
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6 pt-6">
            {/* Status Box */}
            <div className={`p-4 rounded-xl border-2 ${getStorageStatusColor()} space-y-3`}>
              <div className="flex items-center justify-between">
                <span className="font-bold flex items-center gap-2">
                  {getStorageStatusIcon()} {getStorageStatusText()}
                </span>
                {isCheckingStorage && <Loader2 className="h-4 w-4 animate-spin" />}
              </div>

              {storageCheck && storageCheck.has_sufficient_space && (
                 <div className="p-3 bg-green-100 rounded text-sm text-green-800 border border-green-300">
                    <div className="font-semibold mb-1">✅ Sufficient Space Found</div>
                    <div className="grid grid-cols-2 gap-1 text-xs">
                      <span className="font-medium">Required:</span>
                      <span className="font-mono text-right">{(storageCheck.required_mb || 0).toFixed(2)} MB</span>
                      <span className="font-medium">Available:</span>
                      <span className="font-mono text-green-700 font-bold text-right">
                        {(storageCheck.available_mb || 0).toFixed(2)} MB
                      </span>
                    </div>
                </div>
              )}
              
              {(storageCheckError || (storageCheck && !storageCheck.has_sufficient_space)) && (
                 <Button onClick={startStorageCheck} disabled={isCheckingStorage} variant="outline" size="sm" className="w-full mt-3">
                   Retry Validation
                 </Button>
              )}
            </div>

            {/* Upload Action */}
            <div className="space-y-4">
              {!uploadComplete ? (
                <>
                  <Button
                    onClick={handleUpload}
                    disabled={!selectedFile || !parameters.hostname || !parameters.username || !parameters.password || !storageCheck?.has_sufficient_space || isUploadingResolved}
                    className="w-full bg-gray-900 hover:bg-black"
                    size="lg"
                  >
                    {isUploadingResolved ? `Uploading... ${uploadProgressResolved.toFixed(0)}%` : 'Start Upload'}
                  </Button>
                  {isUploadingResolved && <Progress value={uploadProgressResolved} className="h-3" />}
                </>
              ) : (
                <Button onClick={handleReset} className="w-full bg-gray-900">Upload Another File</Button>
              )}
              
              {uploadError && (
                <Alert className="bg-red-50 border-red-200">
                  <AlertCircle className="h-4 w-4 text-red-600" />
                  <AlertDescription className="text-red-800">{uploadError}</AlertDescription>
                </Alert>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
