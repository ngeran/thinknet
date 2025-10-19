// File Path: frontend/src/pages/Operations/BackupHistory.jsx
import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Package, History, CheckCircle, XCircle, CloudCog,
  ArrowLeftRight, Clock, Search, Download,
  RefreshCw, TrendingUp, AlertCircle
} from 'lucide-react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

const getStatusBadge = (status) => {
  switch (status) {
    case 'Success':
      return (
        <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800 flex items-center gap-1">
          <CheckCircle className="h-3 w-3" />
          {status}
        </Badge>
      );
    case 'Failed':
      return (
        <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-800 flex items-center gap-1">
          <XCircle className="h-3 w-3" />
          {status}
        </Badge>
      );
    case 'Running':
      return (
        <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800 flex items-center gap-1">
          <RefreshCw className="h-3 w-3 animate-spin" />
          {status}
        </Badge>
      );
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
};

const getOperationTypeBadge = (type) => {
  const variants = {
    'Backup': 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950 dark:text-indigo-300 dark:border-indigo-800',
    'Restore': 'bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950 dark:text-teal-300 dark:border-teal-800',
    'Sync': 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800'
  };

  return (
    <Badge variant="outline" className={`${variants[type] || ''} flex items-center gap-1`}>
      {type === 'Backup' && <CloudCog className="h-3 w-3" />}
      {type === 'Restore' && <ArrowLeftRight className="h-3 w-3" />}
      {type}
    </Badge>
  );
};

// =============================================================================
// COLUMN DEFINITIONS
// =============================================================================

const columns = [
  { accessorKey: "timestamp", header: "Timestamp", icon: Clock },
  { accessorKey: "type", header: "Operation Type" },
  { accessorKey: "device", header: "Device" },
  { accessorKey: "status", header: "Status" },
  { accessorKey: "duration", header: "Duration" },
  { accessorKey: "message", header: "Details" },
];

// =============================================================================
// MODERN STATS CARD COMPONENT
// =============================================================================

const StatCard = ({ title, value, icon: Icon, colorClass, trend, description }) => (
  <Card className="group hover:shadow-lg transition-all duration-300 border-0 bg-card relative overflow-hidden">
    <div className={`absolute top-0 left-0 w-1 h-full ${colorClass.replace('border-', 'bg-')}`} />
    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
      <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      <div className={`p-2 rounded-lg ${colorClass.replace('border-', 'bg-').replace('-500', '-100').replace('-600', '-100')} dark:${colorClass.replace('border-', 'bg-').replace('-500', '-900').replace('-600', '-900')}`}>
        <Icon className={`h-4 w-4 ${colorClass.replace('border-', 'text-')}`} />
      </div>
    </CardHeader>
    <CardContent>
      <div className="text-2xl font-bold text-foreground">{value}</div>
      {trend && (
        <div className="flex items-center gap-1 mt-1">
          <TrendingUp className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
          <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">{trend}</span>
        </div>
      )}
      {description && (
        <p className="text-xs text-muted-foreground mt-2">{description}</p>
      )}
    </CardContent>
  </Card>
);

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function OperationsHistory() {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Mock data for demonstration - replace with actual API call
  const historyData = [
    {
      id: 1,
      timestamp: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
      type: 'Backup',
      device: 'NAS-001',
      status: 'Success',
      duration: '2m 34s',
      message: 'Full system backup completed successfully'
    },
    {
      id: 2,
      timestamp: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
      type: 'Restore',
      device: 'Server-042',
      status: 'Running',
      duration: '1m 12s',
      message: 'Database restoration in progress'
    },
    {
      id: 3,
      timestamp: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
      type: 'Backup',
      device: 'Workstation-789',
      status: 'Failed',
      duration: '0m 45s',
      message: 'Network timeout during backup'
    }
  ];

  const handleRefresh = async () => {
    setIsRefreshing(true);
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1000));
    setIsRefreshing(false);
  };

  // Enhanced stats calculation
  const stats = useMemo(() => {
    const totalOps = historyData.length;

    if (totalOps === 0) {
      return [
        {
          title: "Total Devices",
          value: "0",
          icon: Package,
          colorClass: 'border-gray-400',
          description: "No devices monitored"
        },
        {
          title: "Total Operations",
          value: "0",
          icon: History,
          colorClass: 'border-blue-500',
          description: "No operations recorded"
        },
        {
          title: "Backups Run",
          value: "0",
          icon: CloudCog,
          colorClass: 'border-indigo-500',
          description: "No backup operations"
        },
        {
          title: "Restores Run",
          value: "0",
          icon: ArrowLeftRight,
          colorClass: 'border-teal-500',
          description: "No restore operations"
        },
        {
          title: "Success Rate",
          value: "N/A",
          icon: CheckCircle,
          colorClass: 'border-emerald-500',
          description: "No data available"
        },
        {
          title: "Failed Operations",
          value: "0",
          icon: XCircle,
          colorClass: 'border-rose-500',
          description: "All operations successful"
        },
      ];
    }

    const totalBackups = historyData.filter(d => d.type === 'Backup').length;
    const totalRestores = historyData.filter(d => d.type === 'Restore').length;
    const successCount = historyData.filter(d => d.status === 'Success').length;
    const failedCount = historyData.filter(d => d.status === 'Failed').length;
    const uniqueDevices = new Set(historyData.map(d => d.device)).size;
    const successRate = Math.round((successCount / totalOps) * 100);

    return [
      {
        title: "Total Devices",
        value: uniqueDevices.toString(),
        icon: Package,
        colorClass: 'border-gray-400',
        trend: "+2 this week",
        description: "Active devices in system"
      },
      {
        title: "Total Operations",
        value: totalOps.toString(),
        icon: History,
        colorClass: 'border-blue-500',
        trend: "12% increase",
        description: "All time operations"
      },
      {
        title: "Backups Run",
        value: totalBackups.toString(),
        icon: CloudCog,
        colorClass: 'border-indigo-500',
        description: "Backup operations completed"
      },
      {
        title: "Restores Run",
        value: totalRestores.toString(),
        icon: ArrowLeftRight,
        colorClass: 'border-teal-500',
        description: "Restore operations completed"
      },
      {
        title: "Success Rate",
        value: `${successRate}%`,
        icon: CheckCircle,
        colorClass: successRate >= 90 ? 'border-emerald-500' : successRate >= 80 ? 'border-amber-500' : 'border-rose-500',
        trend: successRate >= 95 ? "Excellent" : "Needs attention",
        description: "Operation success rate"
      },
      {
        title: "Failed Operations",
        value: failedCount.toString(),
        icon: XCircle,
        colorClass: 'border-rose-500',
        description: "Operations requiring review"
      },
    ];
  }, [historyData]);

  const filteredData = historyData.filter(item =>
    item.device.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.type.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.status.toLowerCase().includes(searchTerm.toLowerCase())
  ).filter(item =>
    activeTab === 'all' || item.status.toLowerCase() === activeTab.toLowerCase()
  );

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header Section */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground">
              Operations Dashboard
            </h1>
            <p className="text-muted-foreground mt-2">Monitor and manage your backup and restore operations</p>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" className="flex items-center gap-2">
              <Download className="h-4 w-4" />
              Export
            </Button>
            <Button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="flex items-center gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>

        <Separator />

        {/* Statistics Grid */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {stats.map((stat, index) => (
            <StatCard {...stat} key={index} />
          ))}
        </div>

        {/* Activity Section */}
        <Card className="bg-card">
          <CardHeader className="pb-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <CardTitle className="text-xl font-semibold text-foreground">Recent Activity</CardTitle>

              <div className="flex flex-col sm:flex-row gap-3">
                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search operations..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 w-full sm:w-64"
                  />
                </div>

                {/* Filter Tabs */}
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full sm:w-auto">
                  <TabsList className="bg-muted">
                    <TabsTrigger value="all">All</TabsTrigger>
                    <TabsTrigger value="success">Success</TabsTrigger>
                    <TabsTrigger value="failed">Failed</TabsTrigger>
                    <TabsTrigger value="running">Running</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            {filteredData.length === 0 ? (
              <div className="py-16 text-center">
                <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium text-foreground mb-2">No operations found</h3>
                <p className="text-muted-foreground max-w-sm mx-auto">
                  {searchTerm || activeTab !== 'all'
                    ? 'Try adjusting your search or filter criteria'
                    : 'No operational history available. Operations will appear here once they are processed.'}
                </p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-lg">
                <Table>
                  <TableHeader className="bg-muted/50">
                    <TableRow className="hover:bg-transparent">
                      {columns.map((col) => (
                        <TableHead key={col.accessorKey} className="font-semibold text-foreground py-4">
                          <span className="flex items-center gap-1">
                            {col.icon && <col.icon className="h-4 w-4" />}
                            {col.header}
                          </span>
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredData.map((row) => (
                      <TableRow key={row.id} className="hover:bg-muted/50 transition-colors group">
                        <TableCell className="py-4">
                          <div className="flex flex-col">
                            <span className="font-medium text-foreground">
                              {new Date(row.timestamp).toLocaleDateString()}
                            </span>
                            <span className="text-sm text-muted-foreground">
                              {new Date(row.timestamp).toLocaleTimeString()}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="py-4">
                          {getOperationTypeBadge(row.type)}
                        </TableCell>
                        <TableCell className="py-4 font-medium text-foreground">
                          {row.device}
                        </TableCell>
                        <TableCell className="py-4">
                          {getStatusBadge(row.status)}
                        </TableCell>
                        <TableCell className="py-4 text-muted-foreground">
                          {row.duration}
                        </TableCell>
                        <TableCell className="py-4">
                          <div className="max-w-xs">
                            <p className="text-muted-foreground text-sm leading-relaxed">
                              {row.message}
                            </p>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Stats Footer */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div className="text-center p-4 bg-card rounded-lg border">
            <div className="font-semibold text-foreground">Last Backup</div>
            <div className="text-muted-foreground">2 hours ago</div>
          </div>
          <div className="text-center p-4 bg-card rounded-lg border">
            <div className="font-semibold text-foreground">System Health</div>
            <div className="text-emerald-600 dark:text-emerald-400 font-medium">Optimal</div>
          </div>
          <div className="text-center p-4 bg-card rounded-lg border">
            <div className="font-semibold text-foreground">Storage Used</div>
            <div className="text-muted-foreground">1.2 TB / 2.0 TB</div>
          </div>
        </div>
      </div>
    </div>
  );
}
