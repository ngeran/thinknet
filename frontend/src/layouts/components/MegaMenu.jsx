// frontend/src/layouts/components/MegaMenu.jsx
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react'; // Example icon for loading

// The environment variable pointing to Rust HTTP (e.g., http://127.0.0.1:3100)
const RUST_BASE_URL = import.meta.env.VITE_RUST_HTTP_URL || 'http://127.0.0.1:3100'; 

// ================================================
// MEGA MENU COMPONENT
// (Styling simplified to use Tailwind/shadcn classes)
// ================================================

const MegaMenu = ({ activeMenu, onMenuEnter, onMenuLeave, onError }) => {
  const [menuData, setMenuData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch navigation data from Rust backend API
  useEffect(() => {
    const fetchNavigationData = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Fetch from the Rust API endpoint
        const response = await fetch(`${RUST_BASE_URL}/api/navigation`);
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        
        // Rust returns data wrapped in { valid: true, data: [...] }
        const navigationData = result.data || result;
        
        setMenuData(navigationData);
      } catch (err) {
        console.error('Failed to fetch navigation data from Rust:', err);
        setError(err.message);
        onError?.(err, 'navigation-fetch');
        setMenuData([]);
      } finally {
        setLoading(false);
      }
    };

    fetchNavigationData();
  }, [onError]);

  // ================================================
  // RENDER FUNCTIONS
  // ================================================

  const renderMenuItems = () => {
    if (loading) {
      return (
        <Button variant="ghost" className="opacity-50 cursor-default">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Loading...
        </Button>
      );
    }
    
    if (error) {
      return (
        <Button variant="ghost" className="text-red-500 hover:bg-red-50" title={error}>
          ⚠️ Nav Error
        </Button>
      );
    }

    return menuData.map((menu) => (
      <div
        key={menu.id}
        className="relative h-full flex items-center"
        onMouseEnter={() => onMenuEnter(menu.id)}
        onMouseLeave={onMenuLeave}
      >
        <Button variant="ghost" className={activeMenu === menu.id ? 'bg-accent' : ''}>
          {menu.icon && <span className="mr-2 text-lg">{menu.icon}</span>}
          {menu.title}
        </Button>
      </div>
    ));
  };

  const renderMegaMenuContent = () => {
    if (!activeMenu) return null;

    const activeData = menuData.find((menu) => menu.id === activeMenu);
    if (!activeData) return null;

    return (
      <div
        className="absolute top-16 left-0 right-0 border-b border-x bg-background shadow-xl p-8"
        onMouseEnter={() => onMenuEnter(activeMenu)}
        onMouseLeave={onMenuLeave}
      >
        <div className="max-w-7xl mx-auto">
          <h3 className="text-lg font-semibold text-primary mb-4">{activeData.subtitle || activeData.title}</h3>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {activeData.children?.map((child, idx) => (
              <Link
                key={idx}
                to={child.url}
                className="group p-4 rounded-lg hover:bg-accent transition-colors block"
              >
                <div className="flex items-center space-x-3">
                  <span className="text-xl text-primary">{child.icon || '🔗'}</span>
                  <div className="flex flex-col">
                    <span className="font-medium group-hover:text-primary">{child.title}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    );
  };

  // ================================================
  // MAIN RENDER
  // ================================================

  return (
    <>
      <nav className="flex space-x-1 h-full">
        {renderMenuItems()}
      </nav>

      {/* Render the floating menu content */}
      {renderMegaMenuContent()}
    </>
  );
};

MegaMenu.displayName = 'MegaMenu';
// ... (defaultProps remain the same)
export default MegaMenu;
