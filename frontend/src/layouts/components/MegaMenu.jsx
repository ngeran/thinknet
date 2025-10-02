// File: MegaMenu.jsx (UPDATED FOR FASTAPI GATEWAY FETCH)

import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
// Assuming 'Button' is a component you defined
import { Button } from '@/components/ui/button';

// --- Configuration ---
// Access the environment variable defined in the .env file.
// This URL MUST point to the FastAPI Gateway (http://localhost:8000) 
// to avoid CORS issues and utilize the proxy logic.
const API_GATEWAY_URL = import.meta.env.VITE_API_BASE_URL;

const MegaMenu = ({ onError }) => {
  const [activeMenu, setActiveMenu] = useState(null);
  const [menuData, setMenuData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const onMenuEnter = (menuId) => setActiveMenu(menuId);
  const onMenuLeave = () => setActiveMenu(null);

  useEffect(() => {
    const fetchNavigationData = async () => {
      try {
        setLoading(true);
        setError(null);

        // --- FIX: Fetching from FastAPI Gateway (http://localhost:8000) ---
        // The Gateway (which proxies to Rust) handles CORS correctly.
        const response = await fetch(`${API_GATEWAY_URL}/api/navigation`);

        if (!response.ok) {
          // If the FastAPI gateway or Rust returns an error status (4xx/5xx)
          const errorText = await response.text();
          throw new Error(`HTTP error! Status: ${response.status} - ${errorText}`);
        }

        const result = await response.json();

        // The FastAPI proxy endpoint already returns the raw navigation array 
        // that it gets from Rust, so we likely don't need the `result.data || result` unwrapping,
        // but we keep it safe for now.
        const navigationData = result.data || result;

        setMenuData(navigationData);
      } catch (err) {
        // Updated console log to reflect the Gateway as the target
        console.error('Failed to fetch navigation data from API Gateway:', err);
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
        onMouseEnter={() => onMenuEnter(activeData.id)} // Used activeData.id here for robustness
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
// ... (You can add defaultProps if needed)
export default MegaMenu;
