// frontend/src/components/ui/MegaMenu.jsx (FINAL FIX)

import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom'; // Essential for direct navigation links
import { Loader2, Plus, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import MegaMenuCard from './MegaMenuCard';

// ================================================
// CONFIGURATION
// ================================================
// API Gateway base URL retrieved from environment variables
const API_GATEWAY_URL = import.meta.env.VITE_API_GATEWAY_URL;

/**
 * MegaMenu Component
 * * Manages the top-level navigation, handling data fetching, rendering,
 * and logic for both expandable mega-menus and direct navigation links.
 * * @component
 */
const MegaMenu = ({ activeMenu, onMenuEnter, onMenuLeave, onError }) => {
  // ================================================
  // STATE & REFS
  // ================================================
  const navRef = useRef(null);
  const [menuData, setMenuData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [menuWidth, setMenuWidth] = useState(0);

  // ================================================
  // DATA FETCHING
  // ================================================
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

  // ================================================
  // LAYOUT MEASUREMENT
  // ================================================
  useEffect(() => {
    if (navRef.current) {
      setMenuWidth(navRef.current.offsetWidth);
    }
  }, [menuData, loading]);

  // ================================================
  // HELPER FUNCTIONS
  // ================================================
  const getGridLayout = (itemCount) => {
    switch (itemCount) {
      case 1: return 'grid-cols-1';
      case 2: return 'grid-cols-2';
      case 3: return 'grid-cols-2';
      case 4: return 'grid-cols-2 md:grid-cols-4';
      case 5: return 'grid-cols-2 lg:grid-cols-3';
      case 6: return 'grid-cols-2 lg:grid-cols-3';
      default: return 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4';
    }
  };

  // ================================================
  // RENDER: NAVIGATION BAR ITEMS
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

    // Render navigation menu items
    return menuData.map((menu) => {
      // Determine if this is a direct link (has a URL but no sub-menus)
      const isDirectLink = menu.url && !menu.children?.length;

      // 🚀 FIX: Use a ternary to conditionally return JSX, avoiding parser confusion
      return isDirectLink ? (
        // --- DIRECT LINK (e.g., Operations) ---
        <Link
          key={menu.id}
          to={menu.url} // Navigates instantly
          className="relative h-full flex items-center"
          onClick={onMenuLeave} // Closes any other open menu
        >
          <Button variant="ghost">
            {menu.title}
          </Button>
        </Link>
      ) : (
        // --- DROPDOWN MENU (Default) ---
        <div
          key={menu.id}
          className="relative h-full flex items-center"
          onMouseEnter={() => onMenuEnter(menu.id)} // Triggers dropdown on hover
        >
          <Button
            variant="ghost"
            className={`group ${activeMenu === menu.id ? 'bg-accent' : ''}`}
          >
            {menu.title}
            {/* Icon indicating a dropdown exists */}
            <Plus className={`ml-2 h-4 w-4 text-muted-foreground transition-transform ${activeMenu === menu.id
              ? 'rotate-45 text-primary'
              : 'group-hover:text-foreground'
              }`} />
          </Button>
        </div>
      );
    });
  };

  // ================================================
  // RENDER: MEGA MENU DROPDOWN CONTENT
  // ================================================

  const renderMegaMenuContent = () => {
    if (!activeMenu || menuWidth === 0) return null;
    const activeData = menuData.find((menu) => menu.id === activeMenu);

    // Crucial check: Only render dropdown if children exist
    if (!activeData || !activeData.children?.length) return null;

    const itemCount = activeData.children.length;

    return (
      <div
        className="absolute top-16 border bg-popover shadow-xl rounded-xl z-40 animate-in slide-in-from-top-2 duration-200"
        style={{
          minWidth: `${menuWidth}px`,
          left: '50%',
          transform: 'translateX(-50%)',
        }}
        onMouseEnter={() => onMenuEnter(activeData.id)}
        onMouseLeave={onMenuLeave}
      >
        <div className="mx-auto w-full max-w-7xl" style={{ padding: '.13em' }}>

          {itemCount === 3 ? (
            <div
              className="grid grid-cols-1 md:grid-cols-2 md:grid-rows-2"
              style={{ columnGap: '.13em', rowGap: '.13em' }}
            >
              <MegaMenuCard item={activeData.children[0]} isHero={true} index={0} />
              <MegaMenuCard item={activeData.children[1]} index={1} />
              <MegaMenuCard item={activeData.children[2]} index={2} />
            </div>
          ) : (
            <div
              className={`grid ${getGridLayout(itemCount)}`}
              style={{ columnGap: '.13em', rowGap: '.13em' }}
            >
              {activeData.children.map((child, idx) => (
                <MegaMenuCard key={idx} item={child} index={idx} />
              ))}
            </div>
          )}

          {activeData.footer && (
            <div className="mt-4 pt-4 border-t">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">{activeData.footer.text}</p>
                {activeData.footer.link && (
                  <Link
                    to={activeData.footer.link.url}
                    className="text-sm font-medium text-primary hover:underline inline-flex items-center gap-1"
                  >
                    {activeData.footer.link.text}
                    <ArrowRight className="w-3 h-3" />
                  </Link>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  // ================================================
  // MAIN COMPONENT RENDER
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
