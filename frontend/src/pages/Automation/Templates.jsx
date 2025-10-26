import { useState, useEffect, useCallback, useMemo } from 'react';
import { FileCode, Download, Copy, Check, Loader2, ChevronRight, Search, ArrowRight, Upload, CheckCircle2, Circle, AlertCircle, Terminal, Play, Eye, ChevronDown } from 'lucide-react';

// ============================================================================
// UI COMPONENT IMPORTS
// ============================================================================
// shadcn/ui components for consistent design system
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

// ============================================================================
// SHARED COMPONENT IMPORTS
// ============================================================================
// Custom reusable components for device configuration
// Note: These components use the onParamChange callback pattern for form state management
import DeviceAuthFields from '@/shared/DeviceAuthFields';
import DeviceTargetSelector from '@/shared/DeviceTargetSelector';

// ============================================================================
// API CONFIGURATION
// ============================================================================
// Backend service endpoints
const API_BASE = 'http://localhost:8000/api';      // FastAPI Gateway (REST API)
const WS_BASE = 'ws://localhost:3100/ws';          // Rust Hub (WebSocket Server)

/**
 * Templates Component
 * 
 * Main component for network configuration template management and deployment.
 * Provides a 4-step wizard interface for:
 * 1. Template Selection - Browse and search available Jinja2 templates
 * 2. Configuration - Input template variables and device credentials
 * 3. Review - Preview generated configuration
 * 4. Deployment - Real-time deployment to network devices via WebSocket
 * 
 * Architecture:
 * - Frontend: React with shadcn/ui components
 * - Backend: FastAPI (REST) + Rust Hub (WebSocket)
 * - Template Engine: Jinja2 templates for network configurations
 * - Real-time Updates: WebSocket connection for deployment progress
 */
export default function Templates() {
  // ==========================================================================
  // STATE MANAGEMENT
  // ==========================================================================

  // --------------------------------------------------------------------------
  // Template Data State
  // --------------------------------------------------------------------------
  const [categories, setCategories] = useState([]);
  // Structure: [{ name: 'Category Name', templates: [{ name: 'template.j2', path: 'path/to/template.j2' }] }]

  const [selectedTemplate, setSelectedTemplate] = useState(null);
  // Currently selected template object from the category list

  const [templateDetails, setTemplateDetails] = useState(null);
  // Full template details including Jinja2 content fetched from backend

  const [formValues, setFormValues] = useState({});
  // Template variable values extracted from Jinja2 content
  // Example: { interface_name: 'ge-0/0/0', ip_address: '192.168.1.1/24', description: 'Uplink' }

  const [generatedConfig, setGeneratedConfig] = useState('');
  // Final rendered configuration after Jinja2 processing

  // --------------------------------------------------------------------------
  // UI State
  // --------------------------------------------------------------------------
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentStep, setCurrentStep] = useState(1);
  const [expandedCategories, setExpandedCategories] = useState({});
  const [selectedCategory, setSelectedCategory] = useState(null); // For sidebar category selection
  const [viewMode, setViewMode] = useState('grid'); // 'grid' or 'list' view

  // --------------------------------------------------------------------------
  // Device Configuration State
  // --------------------------------------------------------------------------
  const [parameters, setParameters] = useState({
    hostname: '',          // Single device hostname
    inventory_file: '',    // Ansible inventory file path (for bulk deployment)
    username: '',          // SSH/NETCONF username
    password: ''           // SSH/NETCONF password
  });

  // --------------------------------------------------------------------------
  // Deployment State (Real-Time WebSocket Integration)
  // --------------------------------------------------------------------------
  const [deploying, setDeploying] = useState(false);
  // Indicates active deployment in progress

  const [deploymentSteps, setDeploymentSteps] = useState([]);
  // Array of deployment steps with status tracking
  // Structure: [{ message: 'Step description', status: 'IN_PROGRESS|COMPLETE|FAILED', id: 'unique-id' }]
  // Status values match backend contract: 'IN_PROGRESS', 'COMPLETE', 'FAILED'

  const [deploymentResult, setDeploymentResult] = useState(null);
  // Final deployment result after completion or failure
  // Structure: { success: boolean, message: string, details: object }

  const [wsConnection, setWsConnection] = useState(null);
  // Active WebSocket connection for real-time updates

  // --------------------------------------------------------------------------
  // Stepper Configuration (4-Step Wizard)
  // --------------------------------------------------------------------------
  const steps = [
    { id: 1, name: 'Select Template', icon: FileCode },
    { id: 2, name: 'Configure', icon: Terminal },
    { id: 3, name: 'Review', icon: Eye },
    { id: 4, name: 'Deploy', icon: Play }
  ];

  // ==========================================================================
  // DATA FETCHING FUNCTIONS
  // ==========================================================================

  /**
   * Fetches template categories from the backend API
   * 
   * Endpoint: GET /api/templates
   * Response: { categories: [{ name: string, templates: [{ name, path }] }] }
   * 
   * This loads the template catalog on component mount, organizing templates
   * into categories for better navigation and discovery.
   */
  const fetchTemplates = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE}/templates`);
      const data = await response.json();
      setCategories(data.categories || []);
      setError(null);
    } catch (err) {
      setError('Failed to load templates');
      console.error('Template fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Fetches specific template content and metadata
   * 
   * Endpoint: GET /api/templates/{path}
   * Response: { content: string, metadata: object }
   * 
   * This loads the actual Jinja2 template content and automatically:
   * 1. Extracts template variables from {{ variable }} patterns
   * 2. Initializes form state with empty values
   * 3. Resets deployment state for clean configuration
   * 
   * @param {string} path - Template file path (e.g., 'interfaces/basic_interface.j2')
   */
  const fetchTemplateDetails = useCallback(async (path) => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE}/templates/${path}`);
      const data = await response.json();
      setTemplateDetails(data);

      // Extract variables from Jinja2 template content
      const variables = extractVariables(data.content);
      const initialValues = {};
      variables.forEach(v => initialValues[v] = '');
      setFormValues(initialValues);

      // Reset deployment state when loading new template
      setGeneratedConfig('');
      setDeploymentResult(null);
      setDeploymentSteps([]);
      setError(null);
    } catch (err) {
      setError('Failed to load template details');
      console.error('Template details fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // ==========================================================================
  // TEMPLATE PROCESSING FUNCTIONS
  // ==========================================================================

  /**
   * Extracts variables from Jinja2 template content
   * 
   * Parses the template to find all {{ variable }} patterns and filters out
   * deployment-specific parameters that are handled separately (username, 
   * password, hostname, inventory_file).
   * 
   * Regex Pattern: /\{\{\s*(\w+)\s*\}\}/g
   * - Matches: {{ variable }}, {{variable}}, {{ var_name }}
   * - Excludes: {% if %}, {# comments #}, deployment parameters
   * 
   * @param {string} content - Raw Jinja2 template content
   * @returns {string[]} - Array of unique variable names
   */
  const extractVariables = (content) => {
    const deploymentVars = ['username', 'password', 'hostname', 'inventory_file'];
    const regex = /\{\{\s*(\w+)\s*\}\}/g;
    const variables = new Set();
    let match;

    while ((match = regex.exec(content)) !== null) {
      if (!deploymentVars.includes(match[1])) {
        variables.add(match[1]);
      }
    }
    return Array.from(variables);
  };

  // ==========================================================================
  // EVENT HANDLERS
  // ==========================================================================

  /**
   * Handles template selection from the grid/list view
   * 
   * When a user selects a template:
   * 1. Sets the selected template in state
   * 2. Fetches the full template details and content
   * 3. Advances to the configuration step (Step 2)
   * 
   * @param {object} template - Selected template object { name, path }
   */
  const handleTemplateSelect = (template) => {
    setSelectedTemplate(template);
    fetchTemplateDetails(template.path);
    setCurrentStep(2);
  };

  /**
   * Handles template variable input changes
   * 
   * Updates form state when user modifies template variables
   * (interface_name, ip_address, description, vlan_id, mtu, etc.)
   * 
   * @param {string} variable - Variable name (e.g., 'interface_name')
   * @param {string} value - New value entered by user
   */
  const handleInputChange = (variable, value) => {
    setFormValues(prev => ({ ...prev, [variable]: value }));
  };

  /**
   * Handles device parameter changes
   * 
   * Updates device configuration state (hostname, credentials, inventory file)
   * Called by DeviceTargetSelector and DeviceAuthFields components.
   * 
   * @param {string} name - Parameter name (hostname, username, password, inventory_file)
   * @param {string} value - New parameter value
   */
  const handleParamChange = (name, value) => {
    setParameters(prev => ({ ...prev, [name]: value }));
  };

  // ==========================================================================
  // CONFIGURATION GENERATION
  // ==========================================================================

  /**
   * Generates final configuration from Jinja2 template
   * 
   * This is the core template rendering function with proper Jinja2 support:
   * 
   * PROCESSING ORDER (CRITICAL):
   * 1. Process conditional blocks ({% if %} ... {% endif %})
   * 2. Replace variable placeholders ({{ variable }})
   * 3. Clean up Jinja2 artifacts (comments, leftover tags)
   * 4. Remove empty lines for clean output
   * 
   * CONDITIONAL HANDLING:
   * - Supports: {% if variable %} content {% endif %}
   * - Supports: {% if variable %} content {% else %} alternate {% endif %}
   * - Logic: Include 'if' content when variable has value, 'else' content otherwise
   * 
   * VARIABLE REPLACEMENT:
   * - Combines template variables (formValues) and device parameters
   * - Uses regex to safely replace all variable instances
   * - Handles special characters in variable names
   * 
   * Example Template:
   * ```
   * interface {{ interface_name }}
   * {% if description %}
   * description {{ description }}
   * {% endif %}
   * ip address {{ ip_address }}
   * ```
   * 
   * Output (with description="Uplink"):
   * ```
   * interface ge-0/0/0
   * description Uplink
   * ip address 192.168.1.1/24
   * ```
   */
  const generateConfig = () => {
    if (!templateDetails) return;

    let config = templateDetails.content;
    const allValues = { ...formValues, ...parameters };

    console.log('🔧 Template variables for config generation:', formValues);

    // STEP 1: Process Jinja2 conditional blocks ({% if %} ... {% endif %})
    // This regex matches both simple if/endif and if/else/endif patterns
    config = config.replace(/\{%\s*if\s+(\w+)\s*%\}(.*?)(?:\{%\s*else\s*%\}(.*?))?\{%\s*endif\s*%\}/gs,
      (match, variable, ifContent, elseContent) => {
        const variableValue = formValues[variable] || parameters[variable];
        console.log(`🔍 Conditional check: ${variable} = "${variableValue}"`);

        // Include ifContent when variable has value, elseContent when it doesn't
        if (variableValue) {
          return ifContent || '';
        } else {
          return elseContent || '';
        }
      }
    );

    // STEP 2: Replace all {{ variable }} placeholders with actual values
    Object.entries(allValues).forEach(([key, value]) => {
      // Escape special regex characters in variable names
      const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`\\{\\{\\s*${escapedKey}\\s*\\}\\}`, 'g');
      config = config.replace(regex, value || '');
    });

    // STEP 3: Clean up Jinja2 artifacts
    config = config.replace(/\{#.*?#\}/gs, ''); // Remove {# comments #}
    config = config.replace(/\{%.*?%\}/g, '');  // Remove leftover {% tags %}

    // STEP 4: Clean up empty lines while preserving configuration structure
    config = config.split('\n')
      .filter(line => line.trim()) // Remove completely empty lines
      .join('\n');

    console.log('✅ Final generated configuration:', config);
    setGeneratedConfig(config);
    setCurrentStep(3); // Advance to review step
  };

  /**
   * Advances to deployment step after configuration review
   * 
   * Called when user clicks "Proceed to Deployment" on the review screen.
   * Transitions from Step 3 (Review) to Step 4 (Deploy).
   */
  const proceedToDeployment = () => {
    setCurrentStep(4);
  };

  // ==========================================================================
  // WEBSOCKET MESSAGE PROCESSING
  // ==========================================================================

  /**
   * Extracts nested progress data from WebSocket messages
   * 
   * The backend (fastapi_worker.py) wraps progress events in multiple JSON layers:
   * 
   * Layer 1 (WebSocket): { data: "..." }
   * Layer 2 (Worker): { event_type: "ORCHESTRATOR_LOG", message: "[STDOUT] {...}" }
   * Layer 3 (Progress): { event_type: "STEP_START", message: "...", data: {...} }
   * 
   * This function unwraps these layers to extract the actual progress event.
   * 
   * PARSING STRATEGY:
   * 1. Parse initial WebSocket message JSON
   * 2. If 'data' field exists, parse it as nested JSON
   * 3. If message is ORCHESTRATOR_LOG, extract JSON from [STDOUT]/[STDERR] prefix
   * 4. Return the deepest nested payload found
   * 
   * @param {object} initialParsed - Initial parsed WebSocket message
   * @returns {object} - { payload: object, isNested: boolean }
   */
  const extractNestedProgressData = (initialParsed) => {
    let currentPayload = initialParsed;
    let deepestNestedData = null;

    if (initialParsed.data) {
      try {
        // Parse the 'data' field (may be string or object)
        const dataPayload = typeof initialParsed.data === 'string'
          ? JSON.parse(initialParsed.data)
          : initialParsed.data;

        currentPayload = dataPayload;

        // Handle ORCHESTRATOR_LOG messages that contain nested JSON
        // Format: "[STDOUT] {\"event_type\":\"STEP_START\",...}"
        if (dataPayload.event_type === "ORCHESTRATOR_LOG" && dataPayload.message) {
          const message = dataPayload.message;
          const jsonMatch = message.match(/\[(STDOUT|STDERR)(?:_RAW)?\]\s*(\{.*\})/s);

          if (jsonMatch && jsonMatch[2]) {
            try {
              deepestNestedData = JSON.parse(jsonMatch[2]);
            } catch {
              console.warn('[TEMPLATES] Failed to parse nested JSON from ORCHESTRATOR_LOG message');
            }
          }
        }
      } catch (error) {
        console.warn('[TEMPLATES] Failed to parse data field:', error.message);
      }
    }

    return {
      payload: deepestNestedData || currentPayload,
      isNested: !!deepestNestedData
    };
  };

  // ==========================================================================
  // DEPLOYMENT FUNCTION (Real-Time WebSocket Integration)
  // ==========================================================================

  /**
   * Deploys template configuration to network device with real-time progress
   * 
   * DEPLOYMENT FLOW:
   * 1. Submit deployment job to FastAPI backend (POST /api/deploy)
   * 2. Receive job_id and ws_channel for real-time updates
   * 3. Establish WebSocket connection to Rust Hub
   * 4. Subscribe to job channel (CRITICAL: Must send SUBSCRIBE after connection)
   * 5. Process real-time progress events via WebSocket
   * 6. Display deployment steps and final result
   * 
   * WEBSOCKET EVENT TYPES:
   * - STEP_START: New deployment step begins (e.g., "Connecting to device")
   * - STEP_COMPLETE: Current step finishes successfully
   * - OPERATION_COMPLETE: Entire deployment finishes (SUCCESS or FAILED)
   * - ORCHESTRATOR_LOG: Log message (may contain nested progress events)
   * 
   * STATE MANAGEMENT:
   * - deploying: true during active deployment
   * - deploymentSteps: Array of steps with status (IN_PROGRESS, COMPLETE, FAILED)
   * - deploymentResult: Final result with success flag and details
   * 
   * ERROR HANDLING:
   * - Job submission failures (network, validation, backend errors)
   * - WebSocket connection failures (Rust Hub unavailable)
   * - Deployment failures (device unreachable, configuration errors)
   * - Unexpected disconnections (tracked via intendedClose flag)
   */
  const deployTemplate = async () => {
    // -------------------------------------------------------------------------
    // Validation: Ensure configuration and target device are specified
    // -------------------------------------------------------------------------
    if (!generatedConfig || (!parameters.hostname && !parameters.inventory_file)) {
      setError('Cannot deploy. Generate configuration and ensure a target device is selected.');
      return;
    }

    // -------------------------------------------------------------------------
    // STEP 1: Initialize Deployment State
    // -------------------------------------------------------------------------
    setDeploying(true);
    setDeploymentResult(null);
    setError(null);
    setDeploymentSteps([]);

    // Close any previous WebSocket connection to prevent conflicts
    if (wsConnection) {
      wsConnection.close();
      setWsConnection(null);
    }

    // Prepare deployment payload for backend
    const payload = {
      template_path: selectedTemplate.path,
      config: generatedConfig,
      hostname: parameters.hostname,
      inventory_file: parameters.inventory_file,
      username: parameters.username,
      password: parameters.password,
      template_vars: formValues
    };

    let ws;
    let intendedClose = false; // Flag to bypass race condition in onclose handler

    try {
      // -----------------------------------------------------------------------
      // STEP 2: Submit Job to FastAPI Gateway
      // -----------------------------------------------------------------------
      const response = await fetch(`${API_BASE}/deploy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      // Accept both 202 (ideal async) and 200 (current backend behavior)
      if (response.status !== 202 && response.status !== 200) {
        const errorData = await response.json();
        throw new Error(errorData.detail || `Job queuing failed with status ${response.status}.`);
      }

      const queuedJob = await response.json();
      const { job_id, ws_channel } = queuedJob;

      // Update UI: Job successfully queued
      setDeploymentSteps([{
        message: `Job ${job_id} successfully queued. Connecting to real-time stream on channel: ${ws_channel}`,
        status: 'IN_PROGRESS',
        id: 'job-queue'
      }]);

      // -----------------------------------------------------------------------
      // STEP 3: Establish WebSocket Connection to Rust Hub
      // -----------------------------------------------------------------------
      ws = new WebSocket(`${WS_BASE}`);
      setWsConnection(ws);

      // -----------------------------------------------------------------------
      // WebSocket Event: Connection Opened
      // -----------------------------------------------------------------------
      ws.onopen = () => {
        // 🔒 CRITICAL: Send SUBSCRIBE command after connection is established
        // The Rust Hub uses a pub/sub model - we must subscribe to the job channel
        // to receive deployment progress events
        const subscribeCommand = {
          type: 'SUBSCRIBE',
          channel: ws_channel // Format: 'job:config-deploy-{UUID}'
        };
        ws.send(JSON.stringify(subscribeCommand));

        // Update UI: Connection established and subscribed
        setDeploymentSteps(prev => prev.map(step =>
          step.id === 'job-queue' ? { ...step, status: 'COMPLETE' } : step
        ));
        setDeploymentSteps(prev => [...prev, {
          message: 'Real-time connection established. Subscribed to job channel.',
          status: 'COMPLETE',
          id: 'ws-connected'
        }]);
        console.log(`✅ Subscribed to job channel: ${ws_channel}`);
      };

      // -----------------------------------------------------------------------
      // WebSocket Event: Message Received (Real-Time Progress Updates)
      // -----------------------------------------------------------------------
      ws.onmessage = (event) => {
        console.log('[TEMPLATES] Raw WebSocket message received:', event.data);

        // Parse the WebSocket message
        let realTimeData;
        try {
          realTimeData = JSON.parse(event.data);
          console.log('[TEMPLATES] Parsed WebSocket message:', realTimeData);
        } catch (e) {
          console.error("Failed to parse WebSocket message:", event.data, e);
          return;
        }

        // Extract nested progress data from ORCHESTRATOR_LOG wrapper
        const { payload: finalPayload, isNested } = extractNestedProgressData(realTimeData);

        console.log('[TEMPLATES] Final payload after extraction:', finalPayload);
        console.log('[TEMPLATES] Event type:', finalPayload.event_type);

        // -------------------------------------------------------------------
        // Process Event: STEP_START
        // -------------------------------------------------------------------
        // A new deployment step has started (e.g., "Connecting to device")
        if (finalPayload.event_type === 'STEP_START') {
          setDeploymentSteps(prev => {
            // Mark the last 'IN_PROGRESS' step as 'COMPLETE' before adding new step
            const newSteps = prev.map(step =>
              step.status === 'IN_PROGRESS' ? { ...step, status: 'COMPLETE' } : step
            );
            // Add the new step with status 'IN_PROGRESS'
            return [...newSteps, {
              message: finalPayload.message,
              status: 'IN_PROGRESS',
              id: finalPayload.data?.name || `step-${finalPayload.data?.step}`
            }];
          });
        }
        // -------------------------------------------------------------------
        // Process Event: STEP_COMPLETE
        // -------------------------------------------------------------------
        // Current step finished successfully
        else if (finalPayload.event_type === 'STEP_COMPLETE') {
          setDeploymentSteps(prev => prev.map(step =>
            step.status === 'IN_PROGRESS' ? { ...step, status: 'COMPLETE' } : step
          ));
        }
        // -------------------------------------------------------------------
        // Process Event: OPERATION_COMPLETE
        // -------------------------------------------------------------------
        // Entire deployment finished (SUCCESS or FAILED)
        else if (finalPayload.event_type === 'OPERATION_COMPLETE') {
          const finalStatus = finalPayload.data?.status; // SUCCESS or FAILED
          const finalMessage = finalPayload.message || `Deployment ${finalStatus}.`;

          // Finalize last running step
          setDeploymentSteps(prev => prev.map(step =>
            step.status === 'IN_PROGRESS' ? {
              ...step,
              status: finalStatus === 'SUCCESS' ? 'COMPLETE' : 'FAILED'
            } : step
          ));

          // Add final result step
          setDeploymentSteps(prev => [...prev, {
            message: finalMessage,
            status: finalStatus === 'SUCCESS' ? 'COMPLETE' : 'FAILED',
            id: 'final-result'
          }]);

          // Set final result state
          setDeploymentResult({
            success: finalStatus === 'SUCCESS',
            message: finalMessage,
            details: finalPayload.data
          });

          setDeploying(false);
          intendedClose = true; // Mark as intentional close
          ws.close();
        }
        // -------------------------------------------------------------------
        // Process Event: ORCHESTRATOR_LOG (Nested Progress Events)
        // -------------------------------------------------------------------
        else if (finalPayload.event_type === 'ORCHESTRATOR_LOG' && isNested) {
          console.log('[TEMPLATES] Processing nested progress event:', finalPayload.event_type);
        }
        // -------------------------------------------------------------------
        // Process Event: Raw Success/Failure Messages
        // -------------------------------------------------------------------
        // Handle direct success/failure responses (legacy format)
        else if (finalPayload.success !== undefined) {
          const finalStatus = finalPayload.success ? 'SUCCESS' : 'FAILED';
          const finalMessage = finalPayload.message || `Deployment ${finalStatus}.`;

          setDeploymentSteps(prev => [...prev, {
            message: finalMessage,
            status: finalStatus === 'SUCCESS' ? 'COMPLETE' : 'FAILED',
            id: 'final-result'
          }]);

          setDeploymentResult({
            success: finalPayload.success,
            message: finalMessage,
            details: finalPayload
          });

          setDeploying(false);
          intendedClose = true;
          ws.close();
        }
      };

      // -----------------------------------------------------------------------
      // WebSocket Event: Error
      // -----------------------------------------------------------------------
      ws.onerror = (err) => {
        console.error("WebSocket Error:", err);
        // Only set error if we weren't intending to close successfully
        if (!intendedClose) {
          setError("Real-time stream connection failed. Check Rust Hub/Worker status.");
        }
        setDeploying(false);
        if (ws) ws.close();
      };

      // -----------------------------------------------------------------------
      // WebSocket Event: Connection Closed
      // -----------------------------------------------------------------------
      ws.onclose = () => {
        console.log("WebSocket connection closed.");
        // Only show error if the close was not intended by OPERATION_COMPLETE
        if (!intendedClose) {
          setError(prev => prev || "Stream closed unexpectedly before job completion. Check logs for details.");
          setDeploying(false);
        }
      };

    } catch (err) {
      // -----------------------------------------------------------------------
      // Error Handling: Job Submission Failed
      // -----------------------------------------------------------------------
      console.error('Job Submission Failed:', err);
      setError(err.message || "An error occurred during job submission to FastAPI.");
      setDeploying(false);
      // Clean up WebSocket connection if it was started
      if (ws && ws.readyState < 2) ws.close();
    }
  };

  // ==========================================================================
  // UTILITY FUNCTIONS
  // ==========================================================================

  /**
   * Copies generated configuration to clipboard
   * 
   * Uses the Clipboard API to copy the configuration text.
   * Shows a temporary "Copied" indicator for 2 seconds.
   */
  const copyToClipboard = async () => {
    await navigator.clipboard.writeText(generatedConfig);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  /**
   * Downloads generated configuration as a text file
   * 
   * Creates a downloadable text file with the configuration content.
   * Filename format: {template_name}_config.txt
   */
  const downloadConfig = () => {
    const blob = new Blob([generatedConfig], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedTemplate.name.replace('.j2', '')}_config.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  /**
   * Filters categories and templates based on search query and selected category
   * 
   * Returns a memoized filtered list of categories where either:
   * - Category name matches search query
   * - Template name matches search query
   * - Matches selected category from sidebar
   * 
   * Empty categories are filtered out to keep the UI clean.
   */
  const filteredCategories = useMemo(() => {
    let filtered = categories;

    // Filter by selected category from sidebar
    if (selectedCategory) {
      filtered = filtered.filter(cat => cat.name === selectedCategory);
    }

    // Filter by search query
    if (searchQuery) {
      filtered = filtered.map(category => {
        const filteredTemplates = category.templates.filter(template =>
          template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          category.name.toLowerCase().includes(searchQuery.toLowerCase())
        );
        return { ...category, templates: filteredTemplates };
      }).filter(category => category.templates.length > 0);
    }

    return filtered;
  }, [categories, searchQuery, selectedCategory]);

  /**
   * Toggles category expansion in template list
   * 
   * Controls the expanded/collapsed state of template categories.
   * Used in the original dropdown design (kept for backward compatibility).
   * 
   * @param {string} categoryName - Name of category to toggle
   */
  const toggleCategory = (categoryName) => {
    setExpandedCategories(prev => ({
      ...prev,
      [categoryName]: !prev[categoryName]
    }));
  };

  /**
   * Validation for proceeding to review step
   * 
   * Checks that all required fields are filled:
   * - Template selected
   * - Target device (hostname OR inventory_file)
   * - Authentication credentials (username AND password)
   * - Required template fields (interface_name AND ip_address)
   */
  const canProceedToReview = selectedTemplate &&
    (parameters.hostname || parameters.inventory_file) &&
    parameters.username &&
    parameters.password &&
    formValues.interface_name &&
    formValues.ip_address;

  /**
   * Custom Icon Component for Deployment Steps
   * 
   * Displays appropriate icon based on step status:
   * - COMPLETE: Green checkmark
   * - IN_PROGRESS: Spinning loader (black/white)
   * - FAILED: Red alert icon
   * - Default/Pending: Gray circle
   * 
   * @param {string} status - Step status (COMPLETE, IN_PROGRESS, FAILED, or null)
   */
  const StepIcon = ({ status }) => {
    if (status === 'COMPLETE') return <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />;
    if (status === 'IN_PROGRESS') return <Loader2 className="w-5 h-5 animate-spin text-black dark:text-white flex-shrink-0" />;
    if (status === 'FAILED') return <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />;
    // Default/Pending status
    return <Circle className="w-5 h-5 text-gray-300 dark:text-gray-700 flex-shrink-0" />;
  };

  // ==========================================================================
  // LIFECYCLE EFFECTS
  // ==========================================================================

  /**
   * Effect: Fetch templates on component mount
   * 
   * Loads the template catalog when the component first renders.
   * Dependencies: [fetchTemplates] ensures stable reference via useCallback.
   */
  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  /**
   * Effect: Cleanup WebSocket connection on component unmount
   * 
   * Ensures WebSocket connection is properly closed when user navigates away
   * or component unmounts to prevent memory leaks and orphaned connections.
   */
  useEffect(() => {
    return () => {
      if (wsConnection) {
        wsConnection.close();
      }
    };
  }, [wsConnection]);

  // ==========================================================================
  // RENDER: LOADING STATE
  // ==========================================================================

  if (loading && categories.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white dark:bg-black">
        <Loader2 className="w-8 h-8 animate-spin text-black dark:text-white" />
      </div>
    );
  }

  // ==========================================================================
  // MAIN COMPONENT RENDER
  // ==========================================================================

  return (
    <div className="min-h-screen bg-white dark:bg-black">
      {/* ====================================================================
          HEADER SECTION: Stepper Navigation
          ==================================================================== */}
      <div className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-black sticky top-0 z-10">
        <div className="container mx-auto px-6 py-4">
          {/* Page Title */}
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold text-black dark:text-white">Template Deployment</h1>
              <p className="text-sm text-gray-600 dark:text-gray-400">Configure and deploy network templates</p>
            </div>
          </div>

          {/* Stepper Navigation (4 Steps) */}
          <div className="flex items-center justify-center space-x-4">
            {steps.map((step, idx) => {
              const StepIconComponent = step.icon;
              const isActive = currentStep === step.id;
              const isComplete = currentStep > step.id;

              return (
                <div key={step.id} className="flex items-center">
                  <div className="flex flex-col items-center">
                    {/* Step Circle */}
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all ${isComplete ? 'bg-black dark:bg-white border-black dark:border-white' :
                        isActive ? 'border-black dark:border-white bg-white dark:bg-black' :
                          'border-gray-300 dark:border-gray-700 bg-white dark:bg-black'
                      }`}>
                      {isComplete ? (
                        <CheckCircle2 className="w-5 h-5 text-white dark:text-black" />
                      ) : (
                        <StepIconComponent className={`w-5 h-5 ${isActive ? 'text-black dark:text-white' : 'text-gray-400 dark:text-gray-600'
                          }`} />
                      )}
                    </div>
                    {/* Step Label */}
                    <span className={`text-xs mt-2 font-medium ${isActive || isComplete ? 'text-black dark:text-white' : 'text-gray-400 dark:text-gray-600'
                      }`}>
                      {step.name}
                    </span>
                  </div>
                  {/* Connector Line */}
                  {idx < steps.length - 1 && (
                    <div className={`w-20 h-0.5 mb-6 mx-4 ${currentStep > step.id ? 'bg-black dark:bg-white' : 'bg-gray-300 dark:bg-gray-700'
                      }`} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ====================================================================
          MAIN CONTENT AREA
          ==================================================================== */}
      <div className="container mx-auto px-6 py-6">
        {/* Error Display Banner */}
        {error && (
          <div className="mb-4 p-4 border border-red-500 bg-red-50 dark:bg-red-950/20 rounded-lg flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}

        {/* ==================================================================
            STEP 1: TEMPLATE SELECTION
            ==================================================================
            Scalable template browser with sidebar navigation:
            - LEFT SIDEBAR: Category navigation (no scrolling needed)
            - RIGHT PANEL: Template grid for selected category
            - SEARCH: Global search across all templates
            - Scales to 100+ templates without vertical scrolling
            ================================================================== */}
        {currentStep === 1 && (
          <div className="flex gap-6 h-[calc(100vh-20rem)]">
            {/* ==============================================================
                LEFT SIDEBAR: Category Navigation
                ============================================================== */}
            <div className="w-64 flex-shrink-0 space-y-3">
              {/* Search Bar */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                <Input
                  type="text"
                  placeholder="Search templates..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setSelectedCategory(null); // Clear category filter when searching
                  }}
                  className="pl-9 h-10 text-sm border-gray-300 dark:border-gray-700 bg-white dark:bg-black"
                />
              </div>

              {/* Category List */}
              <Card className="border-gray-200 dark:border-gray-800 h-[calc(100%-3rem)]">
                <CardHeader className="pb-3 border-b border-gray-200 dark:border-gray-800">
                  <CardTitle className="text-sm font-semibold">Categories</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <ScrollArea className="h-[calc(100vh-28rem)]">
                    <div className="p-3 space-y-1">
                      {/* All Templates Option */}
                      <button
                        onClick={() => {
                          setSelectedCategory(null);
                          setSearchQuery('');
                        }}
                        className={`w-full flex items-center justify-between px-3 py-2.5 rounded-md text-left transition-all ${!selectedCategory && !searchQuery
                            ? 'bg-black dark:bg-white text-white dark:text-black font-medium'
                            : 'hover:bg-gray-100 dark:hover:bg-gray-900 text-black dark:text-white'
                          }`}
                      >
                        <div className="flex items-center gap-2">
                          <div className={`w-1.5 h-1.5 rounded-full ${!selectedCategory && !searchQuery
                              ? 'bg-white dark:bg-black'
                              : 'bg-gray-400 dark:bg-gray-600'
                            }`} />
                          <span className="text-sm">All Templates</span>
                        </div>
                        <Badge variant={!selectedCategory && !searchQuery ? "secondary" : "outline"} className="text-xs h-5">
                          {categories.reduce((acc, cat) => acc + cat.templates.length, 0)}
                        </Badge>
                      </button>

                      <Separator className="my-2 bg-gray-200 dark:bg-gray-800" />

                      {/* Category Items */}
                      {categories.map((category) => (
                        <button
                          key={category.name}
                          onClick={() => {
                            setSelectedCategory(category.name);
                            setSearchQuery('');
                          }}
                          className={`w-full flex items-center justify-between px-3 py-2.5 rounded-md text-left transition-all ${selectedCategory === category.name
                              ? 'bg-black dark:bg-white text-white dark:text-black font-medium'
                              : 'hover:bg-gray-100 dark:hover:bg-gray-900 text-black dark:text-white'
                            }`}
                        >
                          <div className="flex items-center gap-2">
                            <div className={`w-1.5 h-1.5 rounded-full ${selectedCategory === category.name
                                ? 'bg-white dark:bg-black'
                                : 'bg-gray-400 dark:bg-gray-600'
                              }`} />
                            <span className="text-sm truncate">{category.name}</span>
                          </div>
                          <Badge
                            variant={selectedCategory === category.name ? "secondary" : "outline"}
                            className="text-xs h-5 flex-shrink-0"
                          >
                            {category.templates.length}
                          </Badge>
                        </button>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>

            {/* ==============================================================
                RIGHT PANEL: Template Grid
                ============================================================== */}
            <div className="flex-1 min-w-0">
              <Card className="border-gray-200 dark:border-gray-800 h-full flex flex-col">
                <CardHeader className="pb-3 border-b border-gray-200 dark:border-gray-800 flex-shrink-0">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-lg">
                        {searchQuery ? `Search Results` : selectedCategory || 'All Templates'}
                      </CardTitle>
                      <CardDescription className="text-xs mt-1">
                        {searchQuery && `Found ${filteredCategories.reduce((acc, cat) => acc + cat.templates.length, 0)} templates matching "${searchQuery}"`}
                        {!searchQuery && selectedCategory && `${filteredCategories[0]?.templates.length || 0} templates in this category`}
                        {!searchQuery && !selectedCategory && `Browse ${categories.reduce((acc, cat) => acc + cat.templates.length, 0)} available templates`}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="flex-1 overflow-hidden p-0">
                  <ScrollArea className="h-full">
                    <div className="p-6">
                      {/* Template Grid */}
                      {filteredCategories.length > 0 ? (
                        <div className="space-y-8">
                          {filteredCategories.map((category) => (
                            <div key={category.name} className="space-y-4">
                              {/* Category Header (only show if viewing all or searching) */}
                              {(!selectedCategory || searchQuery) && (
                                <div className="flex items-center gap-3 pb-2">
                                  <div className="h-px w-8 bg-gray-300 dark:bg-gray-700" />
                                  <h3 className="text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">
                                    {category.name}
                                  </h3>
                                  <div className="h-px flex-1 bg-gray-300 dark:bg-gray-700" />
                                </div>
                              )}

                              {/* Template Cards Grid */}
                              <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                                {category.templates.map((template) => (
                                  <button
                                    key={template.path}
                                    onClick={() => handleTemplateSelect(template)}
                                    className="group relative p-5 text-left border-2 border-gray-200 dark:border-gray-800 rounded-lg hover:border-black dark:hover:border-white transition-all duration-200 bg-white dark:bg-black hover:shadow-lg"
                                  >
                                    {/* Template Icon */}
                                    <div className="absolute top-5 right-5 w-9 h-9 rounded-lg bg-gray-100 dark:bg-gray-900 flex items-center justify-center group-hover:bg-black dark:group-hover:bg-white transition-colors">
                                      <FileCode className="w-4 h-4 text-gray-400 dark:text-gray-600 group-hover:text-white dark:group-hover:text-black transition-colors" />
                                    </div>

                                    {/* Template Content */}
                                    <div className="pr-12 space-y-2.5">
                                      <div>
                                        <h4 className="text-sm font-semibold text-black dark:text-white line-clamp-2 mb-1">
                                          {template.name.replace('.j2', '')}
                                        </h4>
                                        <p className="text-xs font-mono text-gray-500 dark:text-gray-400 truncate">
                                          {template.path.split('/').pop()}
                                        </p>
                                      </div>

                                      {/* Action Indicator */}
                                      <div className="flex items-center gap-1.5 text-xs font-medium text-gray-400 group-hover:text-black dark:group-hover:text-white transition-colors">
                                        <span>Configure</span>
                                        <ArrowRight className="w-3 h-3 transition-transform group-hover:translate-x-0.5" />
                                      </div>
                                    </div>
                                  </button>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        /* No Results State */
                        <div className="flex flex-col items-center justify-center h-full py-20">
                          <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-900 flex items-center justify-center mb-4">
                            <Search className="w-8 h-8 text-gray-300 dark:text-gray-700" />
                          </div>
                          <h3 className="text-lg font-semibold text-black dark:text-white mb-2">
                            No templates found
                          </h3>
                          <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm text-center">
                            {searchQuery
                              ? `No templates match "${searchQuery}". Try different search terms.`
                              : 'No templates available in this category.'
                            }
                          </p>
                          {(searchQuery || selectedCategory) && (
                            <Button
                              variant="outline"
                              onClick={() => {
                                setSearchQuery('');
                                setSelectedCategory(null);
                              }}
                              className="mt-4"
                              size="sm"
                            >
                              View All Templates
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* ==================================================================
            STEP 2: CONFIGURATION
            ==================================================================
            Form for entering template variables and device credentials:
            - Template parameters (interface_name, ip_address, etc.)
            - Target device selection (hostname or inventory file)
            - Authentication credentials (username, password)
            ================================================================== */}
        {currentStep === 2 && selectedTemplate && (
          <div className="space-y-4">
            <Card className="border-gray-200 dark:border-gray-800">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-xl">{selectedTemplate.name.replace('.j2', '')}</CardTitle>
                    <CardDescription>Configure template parameters and target device</CardDescription>
                  </div>
                  <Button variant="outline" onClick={() => setCurrentStep(1)} size="sm">
                    Change Template
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Template Parameters Section */}
                {Object.keys(formValues).length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold">Template Parameters</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {/* Required Field: Interface Name */}
                      <div className="space-y-1.5">
                        <Label htmlFor="interface_name" className="text-xs font-medium">
                          INTERFACE NAME *
                        </Label>
                        <Input
                          id="interface_name"
                          type="text"
                          value={formValues.interface_name || ''}
                          onChange={(e) => handleInputChange('interface_name', e.target.value)}
                          placeholder="Enter interface name (e.g., ge-0/0/0)"
                          className="border-gray-300 dark:border-gray-700"
                          required
                        />
                      </div>
                      {/* Required Field: IP Address */}
                      <div className="space-y-1.5">
                        <Label htmlFor="ip_address" className="text-xs font-medium">
                          IP ADDRESS *
                        </Label>
                        <Input
                          id="ip_address"
                          type="text"
                          value={formValues.ip_address || ''}
                          onChange={(e) => handleInputChange('ip_address', e.target.value)}
                          placeholder="Enter IP address (e.g., 192.168.1.1/24)"
                          className="border-gray-300 dark:border-gray-700"
                          required
                        />
                      </div>
                      {/* Optional Field: Description */}
                      <div className="space-y-1.5">
                        <Label htmlFor="description" className="text-xs font-medium">
                          DESCRIPTION
                        </Label>
                        <Input
                          id="description"
                          type="text"
                          value={formValues.description || ''}
                          onChange={(e) => handleInputChange('description', e.target.value)}
                          placeholder="Enter description (optional)"
                          className="border-gray-300 dark:border-gray-700"
                        />
                      </div>
                      {/* Optional Field: VLAN ID */}
                      <div className="space-y-1.5">
                        <Label htmlFor="vlan_id" className="text-xs font-medium">
                          VLAN ID
                        </Label>
                        <Input
                          id="vlan_id"
                          type="text"
                          value={formValues.vlan_id || ''}
                          onChange={(e) => handleInputChange('vlan_id', e.target.value)}
                          placeholder="Enter VLAN ID (optional)"
                          className="border-gray-300 dark:border-gray-700"
                        />
                      </div>
                      {/* Optional Field: MTU */}
                      <div className="space-y-1.5">
                        <Label htmlFor="mtu" className="text-xs font-medium">
                          MTU
                        </Label>
                        <Input
                          id="mtu"
                          type="text"
                          value={formValues.mtu || ''}
                          onChange={(e) => handleInputChange('mtu', e.target.value)}
                          placeholder="Enter MTU (optional)"
                          className="border-gray-300 dark:border-gray-700"
                        />
                      </div>
                    </div>
                    <Separator className="bg-gray-200 dark:bg-gray-800" />
                  </div>
                )}

                {/* Device Configuration Row: Target Device + Authentication Side by Side */}
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold">Device Configuration</h3>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Left Column: Target Device */}
                    <div className="space-y-3">
                      <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Target Device</h4>
                      <DeviceTargetSelector
                        parameters={parameters}
                        onParamChange={handleParamChange}
                      />
                    </div>

                    {/* Right Column: Authentication */}
                    <div className="space-y-3">
                      <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Authentication</h4>
                      <DeviceAuthFields
                        parameters={parameters}
                        onParamChange={handleParamChange}
                      />
                    </div>
                  </div>
                </div>

                {/* Generate Configuration Button */}
                <div className="flex justify-end pt-4">
                  <Button
                    onClick={generateConfig}
                    disabled={!canProceedToReview}
                    className="bg-black dark:bg-white text-white dark:text-black hover:bg-gray-800 dark:hover:bg-gray-200"
                  >
                    Generate Configuration
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ==================================================================
            STEP 3: REVIEW CONFIGURATION
            ==================================================================
            Preview and verify generated configuration before deployment:
            - Configuration summary (template, target, variables)
            - Full configuration preview with syntax highlighting
            - Copy and download options
            ================================================================== */}
        {currentStep === 3 && generatedConfig && (
          <div className="space-y-4">
            <Card className="border-gray-200 dark:border-gray-800">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-xl">Review Configuration</CardTitle>
                    <CardDescription>Verify the generated configuration before proceeding to deployment</CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setCurrentStep(2)} size="sm">
                      Back to Edit
                    </Button>
                    <Button onClick={copyToClipboard} variant="outline" size="sm">
                      {copied ? <Check className="w-4 h-4 mr-1" /> : <Copy className="w-4 h-4 mr-1" />}
                      {copied ? 'Copied' : 'Copy'}
                    </Button>
                    <Button onClick={downloadConfig} variant="outline" size="sm">
                      <Download className="w-4 h-4 mr-1" />
                      Download
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Configuration Summary */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4 p-4 rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800">
                  <div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Template</div>
                    <div className="text-sm font-medium">{selectedTemplate.name.replace('.j2', '')}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Target</div>
                    <div className="text-sm font-medium">{parameters.hostname || parameters.inventory_file}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">IP Address</div>
                    <div className="text-sm font-medium">{formValues.ip_address || 'Not specified'}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Username</div>
                    <div className="text-sm font-medium">{parameters.username}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Lines</div>
                    <div className="text-sm font-medium">{generatedConfig.split('\n').length}</div>
                  </div>
                </div>

                {/* Configuration Preview */}
                <ScrollArea className="h-96 w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950">
                  <pre className="p-4 text-xs font-mono text-black dark:text-white">
                    {generatedConfig}
                  </pre>
                </ScrollArea>

                {/* Proceed to Deployment Button */}
                <div className="flex justify-end gap-2 pt-4">
                  <Button
                    onClick={proceedToDeployment}
                    className="bg-black dark:bg-white text-white dark:text-black hover:bg-gray-800 dark:hover:bg-gray-200"
                  >
                    Proceed to Deployment
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ==================================================================
            STEP 4: DEPLOY CONFIGURATION
            ==================================================================
            Execute deployment with real-time progress updates:
            - Deployment summary
            - Real-time step-by-step progress via WebSocket
            - Final result display with detailed information
            ================================================================== */}
        {currentStep === 4 && (
          <div className="space-y-4">
            <Card className="border-gray-200 dark:border-gray-800">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-xl">Deploy Configuration</CardTitle>
                    <CardDescription>Execute deployment to target device</CardDescription>
                  </div>
                  {!deploying && !deploymentResult && (
                    <Button variant="outline" onClick={() => setCurrentStep(3)} size="sm">
                      Back to Review
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Deployment Summary */}
                <div className="p-4 rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800">
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
                    <div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Template</div>
                      <div className="text-sm font-medium">{selectedTemplate.name.replace('.j2', '')}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Target Device</div>
                      <div className="text-sm font-medium">{parameters.hostname || parameters.inventory_file}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">IP Address</div>
                      <div className="text-sm font-medium">{formValues.ip_address || 'Not specified'}</div>
                    </div>
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    Ready to deploy {generatedConfig.split('\n').length} lines of configuration
                  </div>
                </div>

                {/* Deploy Button */}
                {!deploying && !deploymentResult && (
                  <div className="flex justify-center py-8">
                    <Button
                      onClick={deployTemplate}
                      size="lg"
                      className="bg-black dark:bg-white text-white dark:text-black hover:bg-gray-800 dark:hover:bg-gray-200"
                    >
                      <Upload className="w-5 h-5 mr-2" />
                      Start Deployment
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Deployment Progress Display */}
            {(deploying || deploymentResult) && (
              <Card className={`border-2 ${deploymentResult?.success ? 'border-green-500' :
                  deploymentResult ? 'border-red-500' :
                    'border-gray-200 dark:border-gray-800'
                }`}>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    {deploymentResult?.success ? (
                      <>
                        <CheckCircle2 className="w-5 h-5 text-green-600" />
                        Deployment Successful
                      </>
                    ) : deploymentResult?.success === false ? (
                      <>
                        <AlertCircle className="w-5 h-5 text-red-600" />
                        Deployment Failed
                      </>
                    ) : (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Deploying Configuration
                      </>
                    )}
                  </CardTitle>
                  {deploymentResult && (
                    <CardDescription>{deploymentResult.message}</CardDescription>
                  )}
                </CardHeader>
                <CardContent>
                  {/* Real-Time Step Progress */}
                  <div className="space-y-3">
                    {deploymentSteps.map((step, index) => (
                      <div key={index} className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors">
                        <StepIcon status={step.status} />
                        <span className={`text-sm ${step.status === 'COMPLETE' ? 'text-green-600' :
                            step.status === 'IN_PROGRESS' ? 'text-black dark:text-white font-medium' :
                              step.status === 'FAILED' ? 'text-red-600 font-medium' :
                                'text-gray-400 dark:text-gray-600'
                          }`}>
                          {step.message}
                        </span>
                      </div>
                    ))}
                    {/* Waiting Indicator */}
                    {deploying && deploymentSteps.length > 0 && deploymentSteps[deploymentSteps.length - 1].status !== 'IN_PROGRESS' && (
                      <div className="flex items-center gap-3 p-3 text-sm text-gray-500 dark:text-gray-400">
                        <Loader2 className="w-5 h-5 animate-spin" />
                        <span>Waiting for next step update...</span>
                      </div>
                    )}
                  </div>

                  {/* Deployment Results */}
                  {deploymentResult && (
                    <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-800 space-y-3">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500">Deployment Details</h4>
                      <ScrollArea className="h-40">
                        <pre className="p-4 text-xs rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 font-mono overflow-auto">
                          {JSON.stringify(deploymentResult.details, null, 2)}
                        </pre>
                      </ScrollArea>

                      {/* Reset Button */}
                      {(deploymentResult.success || deploymentResult.success === false) && (
                        <div className="flex justify-center pt-4">
                          <Button
                            onClick={() => {
                              setCurrentStep(1);
                              setSelectedTemplate(null);
                              setGeneratedConfig('');
                              setDeploymentResult(null);
                              setDeploymentSteps([]);
                              if (wsConnection) wsConnection.close();
                            }}
                            variant="outline"
                          >
                            Deploy Another Template
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
