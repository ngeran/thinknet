import { useState, useEffect } from 'react';
import { FileCode, Download, Copy, Check, Loader2, ChevronRight, ChevronDown, Search, ArrowRight, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import DeviceAuthFields from '@/shared/DeviceAuthFields';
import DeviceTargetSelector from '@/shared/DeviceTargetSelector';

export default function Templates() {
  const [categories, setCategories] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [templateDetails, setTemplateDetails] = useState(null);
  const [formValues, setFormValues] = useState({});
  const [generatedConfig, setGeneratedConfig] = useState('');
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(null);
  const [expandedCategories, setExpandedCategories] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const [parameters, setParameters] = useState({
    hostname: '',
    inventory_file: '',
    username: '',
    password: ''
  });
  const [deploying, setDeploying] = useState(false);
  const [deploymentResult, setDeploymentResult] = useState(null);

  const API_BASE = 'http://localhost:8000/api';

  useEffect(() => {
    fetchTemplates();
  }, []);

  useEffect(() => {
    // Auto-expand all categories initially
    const expanded = {};
    categories.forEach(cat => {
      expanded[cat.name] = true;
    });
    setExpandedCategories(expanded);
  }, [categories]);

  const fetchTemplates = async () => {
    // ... (fetchTemplates logic is unchanged)
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE}/templates`);
      const data = await response.json();
      setCategories(data.categories || []);
      setError(null);
    } catch (err) {
      setError('Failed to load templates');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchTemplateDetails = async (path) => {
    // ... (fetchTemplateDetails logic is unchanged)
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE}/templates/${path}`);
      const data = await response.json();
      setTemplateDetails(data);

      const variables = extractVariables(data.content);
      const initialValues = {};
      variables.forEach(v => initialValues[v] = '');
      setFormValues(initialValues);
      setGeneratedConfig('');
      setDeploymentResult(null);
      setError(null);
    } catch (err) {
      setError('Failed to load template details');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const extractVariables = (content) => {
    // Exclude common device parameters from the template-specific form
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

  const handleTemplateSelect = (template) => {
    setSelectedTemplate(template);
    fetchTemplateDetails(template.path);
  };

  const handleInputChange = (variable, value) => {
    setFormValues(prev => ({ ...prev, [variable]: value }));
  };

  /**
   * FIX: This function is the key! It correctly updates the `parameters` state.
   * We ensure this is properly wired to the shared components below.
   */
  const handleParamChange = (key, value) => {
    setParameters(prev => ({ ...prev, [key]: value }));
  };

  const toggleCategory = (categoryName) => {
    setExpandedCategories(prev => ({
      ...prev,
      [categoryName]: !prev[categoryName]
    }));
  };

  const generateConfig = () => {
    // ... (generateConfig logic is unchanged)
    if (!templateDetails) return;

    let config = templateDetails.content;
    const allValues = { ...formValues, ...parameters };

    Object.entries(allValues).forEach(([key, value]) => {
      const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`\\{\\{\\s*${escapedKey}\\s*\\}\\}`, 'g');
      // Replace only if value is not empty, otherwise template might be cleaner without it
      config = config.replace(regex, value || '');
    });

    config = config.replace(/\{#.*?#\}/gs, '');
    config = config.replace(/\{%\s*if\s+(\w+)\s*%\}(.*?)\{%\s*endif\s*%\}/gs, (match, variable, content) => {
      const variableValue = formValues[variable] || parameters[variable];
      return variableValue ? content : '';
    });
    config = config.replace(/\{%.*?%\}/g, '');
    config = config.split('\n').filter(line => line.trim()).join('\n');

    setGeneratedConfig(config);
  };

  const deployTemplate = async () => {
    // ... (deployTemplate logic is unchanged)
    if (!generatedConfig || (!parameters.hostname && !parameters.inventory_file)) {
      setError('Cannot deploy. Generate configuration and ensure a target device (hostname or inventory) is selected.');
      return;
    }

    setDeploying(true);
    setDeploymentResult(null);
    setError(null);

    const payload = {
      template_path: selectedTemplate.path,
      config: generatedConfig,
      hostname: parameters.hostname,
      inventory_file: parameters.inventory_file,
      username: parameters.username,
      password: parameters.password,
      template_vars: formValues
    };

    try {
      const response = await fetch(`${API_BASE}/deploy`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (response.ok) {
        setDeploymentResult({ success: true, message: 'Deployment successful!', details: data });
      } else {
        setDeploymentResult({ success: false, message: data.message || 'Deployment failed.', details: data });
        setError(data.message || 'Deployment failed.');
      }
    } catch (err) {
      setDeploymentResult({ success: false, message: 'Network or server error during deployment.', details: err.toString() });
      setError('Network or server error during deployment.');
      console.error(err);
    } finally {
      setDeploying(false);
    }
  };


  const copyToClipboard = async () => {
    // ... (copyToClipboard logic is unchanged)
    await navigator.clipboard.writeText(generatedConfig);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadConfig = () => {
    // ... (downloadConfig logic is unchanged)
    const blob = new Blob([generatedConfig], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedTemplate.name.replace('.j2', '')}_config.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ... (filteredCategories logic is unchanged)
  const filteredCategories = categories.map(category => {
    const filteredTemplates = category.templates.filter(template =>
      template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      category.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
    return { ...category, templates: filteredTemplates };
  }).filter(category => category.templates.length > 0);


  if (loading && categories.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* ... (Header and Error Card unchanged) ... */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Network Templates</h1>
        <p className="text-muted-foreground">Select a template and configure your network device</p>
      </div>

      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <p className="text-destructive">⚠️ {error}</p>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ... (Templates Sidebar Card unchanged) ... */}
        <div className="lg:col-span-1">
          <Card className="lg:h-[calc(100vh-12rem)]">
            <CardHeader className="pb-3">
              <CardTitle>Available Templates</CardTitle>
              <CardDescription>Choose a configuration template</CardDescription>
              <div className="relative pt-2">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search templates..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
            </CardHeader>
            <ScrollArea className="h-[calc(100%-8rem)]">
              <CardContent className="space-y-2 pt-0">
                {filteredCategories.map((category) => (
                  <div key={category.name} className="space-y-1">
                    <button
                      onClick={() => toggleCategory(category.name)}
                      className="w-full flex items-center justify-between px-2 py-2 hover:bg-muted rounded-md transition-colors group"
                    >
                      <div className="flex items-center gap-2">
                        {expandedCategories[category.name] ? (
                          <ChevronDown className="w-4 h-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-muted-foreground" />
                        )}
                        <h3 className="text-sm font-semibold uppercase tracking-wider">
                          {category.name}
                        </h3>
                      </div>
                      <Badge variant="secondary" className="text-xs">
                        {category.templates.length}
                      </Badge>
                    </button>

                    {expandedCategories[category.name] && (
                      <div className="space-y-0.5 pl-6">
                        {category.templates.map((template) => (
                          <button
                            key={template.path}
                            onClick={() => handleTemplateSelect(template)}
                            className={`w-full flex items-center justify-between px-3 py-2 rounded-md transition-colors text-sm ${selectedTemplate?.path === template.path
                              ? 'bg-primary text-primary-foreground font-medium'
                              : 'hover:bg-muted'
                              }`}
                          >
                            <div className="flex items-center gap-2">
                              <FileCode className="w-4 h-4" />
                              <span>{template.name.replace('.j2', '')}</span>
                            </div>
                            {selectedTemplate?.path === template.path && (
                              <ChevronRight className="w-4 h-4" />
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}

                {filteredCategories.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    No templates found matching "{searchQuery}"
                  </div>
                )}
              </CardContent>
            </ScrollArea>
          </Card>
        </div>

        <div className="lg:col-span-2">
          {!selectedTemplate ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16">
                <FileCode className="w-16 h-16 text-muted-foreground/50 mb-4" />
                <h3 className="text-xl font-semibold mb-2">No Template Selected</h3>
                <p className="text-muted-foreground text-center">Select a template from the left to begin configuration</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-2xl">
                          {selectedTemplate.name.replace('.j2', '')}
                        </CardTitle>
                        <Badge variant="outline" className="font-mono text-xs">
                          {selectedTemplate.path}
                        </Badge>
                      </div>
                      <CardDescription>Configure the template and device parameters below</CardDescription>
                    </div>
                    {templateDetails && (
                      <div className="text-right">
                        <div className="text-xs text-muted-foreground">Size</div>
                        <div className="text-sm font-medium">{templateDetails.size_kb} KB</div>
                      </div>
                    )}
                  </div>
                </CardHeader>

                <CardContent className="space-y-6">
                  {/* Template Parameters Section */}
                  {templateDetails && Object.keys(formValues).length > 0 && (
                    <div className="space-y-4">
                      <h3 className="text-md font-semibold text-primary">Template Parameters</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {Object.keys(formValues).map((variable) => (
                          <div key={variable} className="space-y-2">
                            <Label htmlFor={variable} className="text-sm">
                              {variable.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                            </Label>
                            <Input
                              id={variable}
                              type="text"
                              value={formValues[variable]}
                              onChange={(e) => handleInputChange(variable, e.target.value)}
                              placeholder={`Enter ${variable.replace(/_/g, ' ')}`}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Device and Auth Parameters Section */}
                  <Separator />
                  <div className="space-y-4">
                    <h3 className="text-md font-semibold text-primary">Target Device & Authentication</h3>

                    {/* FIX: Ensure all required props are passed correctly */}
                    <DeviceTargetSelector
                      hostname={parameters.hostname}
                      inventory_file={parameters.inventory_file}
                      // Pass handlers that use the central handleParamChange function
                      onHostnameChange={(value) => handleParamChange('hostname', value)}
                      onInventoryChange={(value) => handleParamChange('inventory_file', value)}
                    />
                    <DeviceAuthFields
                      username={parameters.username}
                      password={parameters.password}
                      // Pass handlers that use the central handleParamChange function
                      onUsernameChange={(value) => handleParamChange('username', value)}
                      onPasswordChange={(value) => handleParamChange('password', value)}
                    />
                  </div>

                  {/* Generate Config Button */}
                  <div className="flex justify-end pt-4">
                    <Button onClick={generateConfig} disabled={!selectedTemplate || loading}>
                      Generate Configuration <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Generated Configuration Card */}
              {generatedConfig && (
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle>Generated Configuration</CardTitle>
                        <CardDescription>Ready to review and deploy</CardDescription>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          onClick={copyToClipboard}
                          variant="outline"
                          size="sm"
                        >
                          {copied ? <Check className="w-4 h-4 mr-2" /> : <Copy className="w-4 h-4 mr-2" />}
                          {copied ? 'Copied' : 'Copy'}
                        </Button>
                        <Button
                          onClick={downloadConfig}
                          size="sm"
                          variant="secondary"
                        >
                          <Download className="w-4 h-4 mr-2" />
                          Download
                        </Button>
                        {/* DEPLOY BUTTON */}
                        <Button
                          onClick={deployTemplate}
                          disabled={deploying || (!parameters.hostname && !parameters.inventory_file)}
                          className="bg-green-600 hover:bg-green-700 text-white"
                        >
                          {deploying ? (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          ) : (
                            <Upload className="w-4 h-4 mr-2" />
                          )}
                          {deploying ? 'Deploying...' : 'Deploy Template'}
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-96 w-full rounded-md border bg-gray-50 dark:bg-gray-900">
                      <pre className="p-4 text-sm font-mono whitespace-pre-wrap text-foreground">
                        {generatedConfig}
                      </pre>
                    </ScrollArea>
                  </CardContent>
                </Card>
              )}

              {/* Deployment Result Card */}
              {deploymentResult && (
                <Card className={deploymentResult.success ? 'border-green-500' : 'border-red-500'}>
                  <CardHeader>
                    <CardTitle className={deploymentResult.success ? 'text-green-600' : 'text-red-600'}>
                      {deploymentResult.success ? '✅ Deployment Success' : '❌ Deployment Failed'}
                    </CardTitle>
                    <CardDescription>{deploymentResult.message}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <h4 className="text-sm font-medium mb-2">Details:</h4>
                    <pre className="p-3 text-xs rounded-md border bg-muted font-mono whitespace-pre-wrap overflow-x-auto">
                      {JSON.stringify(deploymentResult.details, null, 2)}
                    </pre>
                  </CardContent>
                </Card>
              )}

            </div>
          )}
        </div>
      </div>
    </div>
  );
}
