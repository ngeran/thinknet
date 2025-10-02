// frontend/src/layouts/components/MegaMenu.jsx (Tailwind/shadcn)

import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';

// --- CONFIGURATION ---
// Configuration variables and constants.
const API_GATEWAY_URL = import.meta.env.VITE_API_BASE_URL;


const MegaMenu = ({ activeMenu, onMenuEnter, onMenuLeave, onError }) => {
  // --- STATE MANAGEMENT ---
  // State for fetching data and managing UI width.
  const navRef = useRef(null); // Ref to measure the width of the main navigation bar.
  const [menuData, setMenuData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [menuWidth, setMenuWidth] = useState(0); // Stores the measured width of the navigation bar.

  // --- DATA FETCHING & SIDE EFFECTS ---
  // Fetches navigation data from the API and measures the navigation bar width.

  useEffect(() => {
    const fetchNavigationData = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch(`${API_GATEWAY_URL}/api/navigation`);

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`HTTP error! Status: ${response.status} - ${errorText}`);
        }

        const result = await response.json();
        setMenuData(result.data || result);
      } catch (err) {
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

  useEffect(() => {
    // Measures the width of the rendered <nav> element and stores it.
    if (navRef.current) {
      setMenuWidth(navRef.current.offsetWidth);
    }
  }, [menuData, loading]);


  // ================================================
  // --- RENDER MENU ITEMS (NAVIGATION BAR) ---
  // Renders the main clickable buttons in the center of the Header.
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
        <Button variant="ghost" className="text-destructive hover:bg-destructive/10" title={error}>
          ⚠️ Nav Error
        </Button>
      );
    }

    // Renders the navigation links without the individual icons (fixed).
    return menuData.map((menu) => (
      <div
        key={menu.id}
        className="relative h-full flex items-center"
        onMouseEnter={() => onMenuEnter(menu.id)}
      >
        <Button
          variant="ghost"
          className={`group ${activeMenu === menu.id ? 'bg-accent' : ''}`}
        >
          {menu.title}
          {/* Added Plus icon for visual cue and rotation effect on hover/active */}
          <Plus className={`ml-2 h-4 w-4 text-muted-foreground transition-transform ${activeMenu === menu.id ? 'rotate-45 text-primary' : 'group-hover:text-foreground'
            }`} />
        </Button>
      </div>
    ));
  };


  // ================================================
  // --- RENDER DROPDOWN CONTENT (MEGA MENU) ---
  // Renders the wide, dynamically sized dropdown that appears below the header.
  // ================================================

  const renderMegaMenuContent = () => {
    if (!activeMenu || menuWidth === 0) return null;

    const activeData = menuData.find((menu) => menu.id === activeMenu);
    if (!activeData) return null;

    return (
      <div
        className="absolute top-16 border bg-popover shadow-xl p-8 rounded-b-xl z-40"
        style={{
          // FIX: Ensures the dropdown is at least as wide as the navigation bar.
          minWidth: `${menuWidth}px`,
          // Centers the dropdown horizontally relative to the menu bar's parent.
          left: '50%',
          transform: 'translateX(-50%)',
        }}
        onMouseEnter={() => onMenuEnter(activeData.id)}
        onMouseLeave={onMenuLeave}
      >
        {/* Inner container allows content to expand up to max-w-6xl, 
                  giving the "fill the screen" look while remaining constrained. 
                */}
        <div className="mx-auto w-full max-w-6xl">
          <h3 className="text-xl font-semibold text-primary mb-4">{activeData.subtitle || activeData.title}</h3>

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
                    {child.description && <span className="text-sm text-muted-foreground">{child.description}</span>}
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
  // --- MAIN RENDER BLOCK ---
  // Combines the navigation bar and the conditional dropdown content.
  // ================================================

  return (
    <>
      <nav
        ref={navRef}
        className="flex space-x-4 h-full items-center"
      >
        {renderMenuItems()}
      </nav>

      {renderMegaMenuContent()}
    </>
  );
};

MegaMenu.displayName = 'MegaMenu';
export default MegaMenu;
