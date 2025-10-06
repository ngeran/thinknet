// File Path: frontend/src/pages/Operations/BackupHistory.jsx (SHADCN UI CONVERSION)

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Package, LineChart, CheckCircle, XCircle } from 'lucide-react'; // Lucide icons for consistency

const StatCard = ({ title, value, icon: Icon, colorClass }) => (
  <Card className={`shadow-lg border-l-4 ${colorClass}`}>
    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
      <CardTitle className="text-sm font-medium">{title}</CardTitle>
      <Icon className="h-5 w-5 text-muted-foreground" />
    </CardHeader>
    <CardContent>
      <div className="text-2xl font-bold">{value}</div>
    </CardContent>
  </Card>
);

const BackupHistory = () => {
  // Placeholder Data
  const stats = [
    { title: "Total Devices", value: 30, icon: Package, colorClass: 'border-blue-500' },
    { title: "Total Backups", value: 1245, icon: LineChart, colorClass: 'border-primary' },
    { title: "Last 24h Success", value: 98, icon: CheckCircle, colorClass: 'border-green-500' },
    { title: "Last 24h Failed", value: 2, icon: XCircle, colorClass: 'border-destructive' },
  ];

  return (
    <div className="p-8 pt-6 space-y-8">
      <h1 className="text-3xl font-bold tracking-tight">Backup History Dashboard 📊</h1>
      <Separator />

      {/* Statistics Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat, index) => (
          <StatCard {...stat} key={index} />
        ))}
      </div>

      {/* Recent Backup Table Placeholder */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Backup Activities</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            [Placeholder for Data Table showing recent backup job results, device, and timestamp.]
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default BackupHistory;
