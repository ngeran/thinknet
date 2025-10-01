// frontend/src/pages/Dashboard.jsx
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

function Dashboard() {
  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold tracking-tight">Welcome to ThinkNet</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>WS Hub</CardTitle>
          </CardHeader>
          <CardContent>
            <p>Rust WebSocket service is running on port 3100.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>FastAPI Gateway</CardTitle>
          </CardHeader>
          <CardContent>
            <p>HTTP service is running on port 8000.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>MegaMenu Data</CardTitle>
          </CardHeader>
          <CardContent>
            <p>Data loaded from <code>navigation.yaml</code> via Rust API.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default Dashboard;
