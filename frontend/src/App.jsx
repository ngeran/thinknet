// frontend/src/App.jsx
import { Routes, Route } from 'react-router-dom';
import AppLayout from './layouts/AppLayout.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Automation from './pages/Automation.jsx';

function App() {
  return (
    <Routes>
      {/* AppLayout provides the consistent header, sidebar, footer structure */}
      <Route path="/" element={<AppLayout />}>
        <Route index element={<Dashboard />} />
        <Route path="automation" element={<Automation />} />
        {/* Route for the specific automation testing page */}
        <Route path="operations/backups" element={<Automation />} /> 
        
        {/* Add more routes here based on your navigation.yml */}
        <Route path="*" element={<div>404 | Page Not Found</div>} />
      </Route>
    </Routes>
  );
}

export default App;
