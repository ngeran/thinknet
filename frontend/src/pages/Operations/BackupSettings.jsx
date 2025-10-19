// File Path: frontend/src/pages/Operations/OperationsSettings.jsx

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Save, CloudCog, ArrowLeftRight, Settings } from 'lucide-react'; // Added icons

const SettingsSection = ({ title, children }) => (
  <Card>
    <CardHeader>
      <CardTitle>{title}</CardTitle>
    </CardHeader>
    <CardContent className="space-y-6">
      {children}
      <Button type="submit" className="w-full">
        <Save className="mr-2 h-4 w-4" /> Save {title}
      </Button>
    </CardContent>
  </Card>
);

const OperationsSettings = () => {
  return (
    <div className="p-8 pt-6 space-y-8">
      <h1 className="text-3xl font-bold tracking-tight">Operation Settings ⚙️</h1>
      <Separator />

      <Tabs defaultValue="global" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="global">
            <Settings className="mr-2 h-4 w-4" /> Global Paths
          </TabsTrigger>
          <TabsTrigger value="backup">
            <CloudCog className="mr-2 h-4 w-4" /> Backup Policies
          </TabsTrigger>
          <TabsTrigger value="restore">
            <ArrowLeftRight className="mr-2 h-4 w-4" /> Restore Policies
          </TabsTrigger>
        </TabsList>

        {/* ==================================================================== */}
        {/* 1. GLOBAL SETTINGS (Shared Paths/Configs) */}
        {/* ==================================================================== */}
        <TabsContent value="global" className="space-y-4 pt-4">
          <SettingsSection title="Shared System Paths">
            <div className="space-y-2">
              <Label htmlFor="backup_path">Default Backup Root Path (`--backup_path`)</Label>
              <Input id="backup_path" defaultValue="/app/shared/data/backups" />
              <p className="text-sm text-muted-foreground">
                This is the base container path where all backup and restore files are located.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="inventory_path">Inventory File Root Path (for bulk ops)</Label>
              <Input id="inventory_path" defaultValue="/app/shared/data/inventories" />
              <p className="text-sm text-muted-foreground">
                Used by the orchestrator to resolve inventory files (`--inventory_file`).
              </p>
            </div>
          </SettingsSection>
        </TabsContent>

        {/* ==================================================================== */}
        {/* 2. BACKUP POLICIES (Scheduling, Retention) */}
        {/* ==================================================================== */}
        <TabsContent value="backup" className="space-y-4 pt-4">
          <SettingsSection title="Automated Backup Policies">
            <div className="space-y-2">
              <Label htmlFor="schedule">Scheduling Frequency</Label>
              <Select defaultValue="daily">
                <SelectTrigger id="schedule">
                  <SelectValue placeholder="Select frequency" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily (23:00 UTC)</SelectItem>
                  <SelectItem value="weekly">Weekly (Sunday 02:00 UTC)</SelectItem>
                  <SelectItem value="manual">Manual Only</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="retention">File Retention Policy (Days)</Label>
              <Input id="retention" type="number" defaultValue="90" />
              <p className="text-sm text-muted-foreground">
                Number of days to retain backup files before automatic deletion.
              </p>
            </div>
          </SettingsSection>
        </TabsContent>

        {/* ==================================================================== */}
        {/* 3. RESTORE POLICIES (Matching run.py parameters) */}
        {/* ==================================================================== */}
        <TabsContent value="restore" className="space-y-4 pt-4">
          <SettingsSection title="Default Restore Behavior">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="restore_type">Default Restore Type (`--type`)</Label>
                <Select defaultValue="override">
                  <SelectTrigger id="restore_type">
                    <SelectValue placeholder="Select restore method" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="override">Override (Full Replace)</SelectItem>
                    <SelectItem value="merge">Merge (Combine with running config)</SelectItem>
                    <SelectItem value="update">Update (Smart update, generally merge)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="commit_timeout">Commit Timeout (Seconds - `--commit_timeout`)</Label>
                <Input id="commit_timeout" type="number" defaultValue="300" />
                <p className="text-sm text-muted-foreground">
                  Maximum time the orchestrator will wait for a standard commit to complete.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmed_timeout">Confirmed Commit Timeout (Minutes - `--confirmed_commit_timeout`)</Label>
                <Input id="confirmed_timeout" type="number" defaultValue="0" />
                <p className="text-sm text-muted-foreground">
                  Set to a value greater than 0 to enable a temporary **`commit confirmed X`** to prevent lockouts.
                </p>
              </div>
            </div>
          </SettingsSection>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default OperationsSettings;
