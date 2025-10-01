// frontend/src/layouts/AppLayout.jsx
import { Outlet } from 'react-router-dom';
import Header from './components/Header.jsx';
// Import your Navigation component (Sidebar) here if you implement it

const AppLayout = () => {
  // A simple, fixed-header layout
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <Header />
      <div className="flex flex-1 pt-16"> {/* Add padding for fixed header height */}
        
        {/* Sidebar/Navigation component would go here */}
        
        <main className="flex-1 p-4 md:p-8">
          {/* Renders the specific page content (Dashboard, Automation, etc.) */}
          <Outlet />
        </main>
      </div>
      {/* <Footer /> component would go here */}
    </div>
  );
};
export default AppLayout;
