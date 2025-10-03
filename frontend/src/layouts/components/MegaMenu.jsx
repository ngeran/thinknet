// frontend/src/layouts/components/MegaMenu.jsx (Refactored - Fully Commented)
import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Plus, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import MegaMenuCard from './MegaMenuCard';

// ================================================
// CONFIGURATION
// ================================================
// API Gateway base URL from environment variables
const API_GATEWAY_URL = import.meta.env.VITE_API_BASE_URL;

/**
 * MegaMenu Component
 * 
 * A navigation component that displays a horizontal menu bar with dropdown mega menus.
 * Acts as a shell/orchestrator that manages layout, data fetching, and state,
 * while delegating card rendering to the MegaMenuCard component.
 * 
 * @component
 * @param {Object} props - Component props
 * @param {string} props.activeMenu - Currently active menu ID
 * @param {Function} props.onMenuEnter - Callback when mouse enters a menu item
 * @param {Function} props.onMenuLeave - Callback when mouse leaves the dropdown
 * @param {Function} props.onError - Error handler callback
 */
const MegaMenu = ({ activeMenu, onMenuEnter, onMenuLeave, onError }) => {
  // ================================================
  // STATE MANAGEMENT
  // ================================================

  // Ref to measure the width of the navigation bar for dropdown positioning
  const navRef = useRef(null);

  // Stores the navigation menu data fetched from the API
  const [menuData, setMenuData] = useState([]);

  // Loading state for API fetch operation
  const [loading, setLoading] = useState(false);

  // Error state to track any fetch failures
  const [error, setError] = useState(null);

  // Stores the measured width of the navigation bar in pixels
  const [menuWidth, setMenuWidth] = useState(0);

  // ================================================
  // DATA FETCHING
  // ================================================

  /**
   * Effect: Fetch navigation data from API on component mount
   * Retrieves menu structure and navigation items from the backend
   */
  useEffect(() => {
    const fetchNavigationData = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch navigation data from API Gateway
        const response = await fetch(`${API_GATEWAY_URL}/api/navigation`);

        // Handle HTTP errors
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`HTTP error! Status: ${response.status} - ${errorText}`);
        }

        // Parse JSON response and handle different response formats
        const result = await response.json();
        setMenuData(result.data || result);

      } catch (err) {
        // Log error and update state
        console.error('Failed to fetch navigation data from API Gateway:', err);
        setError(err.message);

        // Call parent error handler if provided
        onError?.(err, 'navigation-fetch');

        // Set empty array to prevent rendering issues
        setMenuData([]);
      } finally {
        // Always set loading to false when done
        setLoading(false);
      }
    };

    fetchNavigationData();
  }, [onError]);

  // ================================================
  // LAYOUT MEASUREMENT
  // ================================================

  /**
   * Effect: Measure navigation bar width for dropdown positioning
   * Runs whenever menuData or loading state changes
   */
  useEffect(() => {
    if (navRef.current) {
      // Get the actual rendered width of the nav element
      setMenuWidth(navRef.current.offsetWidth);
    }
  }, [menuData, loading]);

  // ================================================
  // HELPER FUNCTIONS
  // ================================================

  /**
   * Determines the optimal grid layout class based on number of items
   * Provides smart responsive layouts for different item counts
   * 
   * @param {number} itemCount - Number of items to display
   * @returns {string} Tailwind grid class string
   */
  const getGridLayout = (itemCount) => {
    switch (itemCount) {
      case 1:
        // Single item takes full width
        return 'grid-cols-1';
      case 2:
        // Two items side by side
        return 'grid-cols-2';
      case 3:
        // Three items use special layout (handled separately)
        return 'grid-cols-2';
      case 4:
        // Four items: 2 columns on mobile, 4 on desktop
        return 'grid-cols-2 md:grid-cols-4';
      case 5:
        // Five items: 2 columns on mobile, 3 on large screens
        return 'grid-cols-2 lg:grid-cols-3';
      case 6:
        // Six items: 2 columns on mobile, 3 on large screens (3x2 grid)
        return 'grid-cols-2 lg:grid-cols-3';
      default:
        // Seven or more items: standard responsive grid
        return 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4';
    }
  };

  // ================================================
  // RENDER: NAVIGATION BAR ITEMS
  // ================================================

  /**
   * Renders the main navigation menu items (buttons) in the header
   * Shows loading state, error state, or the actual menu items
   * 
   * @returns {JSX.Element} Navigation bar content
   */
  const renderMenuItems = () => {
    // Show loading indicator while fetching data
    if (loading) {
      return (
        <Button variant="ghost" className="opacity-50 cursor-default">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Loading...
        </Button>
      );
    }

    // Show error indicator if fetch failed
    if (error) {
      return (
        <Button
          variant="ghost"
          className="text-destructive hover:bg-destructive/10"
          title={error}
        >
          ⚠️ Nav Error
        </Button>
      );
    }

    // Render navigation menu items
    return menuData.map((menu) => (
      <div
        key={menu.id}
        className="relative h-full flex items-center"
        // Trigger dropdown on mouse enter
        onMouseEnter={() => onMenuEnter(menu.id)}
      >
        <Button
          variant="ghost"
          // Highlight active menu with accent background
          className={`group ${activeMenu === menu.id ? 'bg-accent' : ''}`}
        >
          {menu.title}
          {/* Plus icon rotates 45° when active (becomes X shape) */}
          <Plus className={`ml-2 h-4 w-4 text-muted-foreground transition-transform ${activeMenu === menu.id
              ? 'rotate-45 text-primary'
              : 'group-hover:text-foreground'
            }`} />
        </Button>
      </div>
    ));
  };

  // ================================================
  // RENDER: MEGA MENU DROPDOWN CONTENT
  // ================================================

  /**
   * Renders the dropdown mega menu content with smart layout
   * Acts as a shell that positions and layouts MegaMenuCard components
   * 
   * @returns {JSX.Element|null} Mega menu dropdown or null if not active
   */
  const renderMegaMenuContent = () => {
    // Don't render if no active menu or width not measured yet
    if (!activeMenu || menuWidth === 0) return null;

    // Find the data for the currently active menu
    const activeData = menuData.find((menu) => menu.id === activeMenu);

    // Don't render if no data or no children items
    if (!activeData || !activeData.children?.length) return null;

    const itemCount = activeData.children.length;

    return (
      <div
        className="absolute top-16 border bg-popover shadow-xl rounded-xl z-40 animate-in slide-in-from-top-2 duration-200"
        style={{
          // Ensure dropdown is at least as wide as the nav bar
          minWidth: `${menuWidth}px`,
          // Center dropdown horizontally below the nav bar
          left: '50%',
          transform: 'translateX(-50%)',
        }}
        // Keep dropdown open when hovering over it
        onMouseEnter={() => onMenuEnter(activeData.id)}
        // Close dropdown when mouse leaves
        onMouseLeave={onMenuLeave}
      >
        {/* Inner container with max width and minimal padding */}
        <div className="mx-auto w-full max-w-7xl" style={{ padding: '.13em' }}>

          {/* ================================================
              CARDS GRID LAYOUT
              Smart layout selection based on item count
              ================================================ */}

          {itemCount === 3 ? (
            // SPECIAL LAYOUT FOR 3 ITEMS
            // First item (hero) takes left half and spans 2 rows
            // Other 2 items stack vertically on the right
            <div
              className="grid grid-cols-1 md:grid-cols-2 md:grid-rows-2"
              style={{ columnGap: '.13em', rowGap: '.13em' }}
            >
              {/* Hero card - featured item with enhanced styling */}
              <MegaMenuCard
                item={activeData.children[0]}
                isHero={true}
                index={0}
              />
              {/* Regular cards stacked on the right */}
              <MegaMenuCard
                item={activeData.children[1]}
                index={1}
              />
              <MegaMenuCard
                item={activeData.children[2]}
                index={2}
              />
            </div>
          ) : (
            // DYNAMIC GRID FOR ALL OTHER ITEM COUNTS
            // Uses getGridLayout() to determine optimal columns
            <div
              className={`grid ${getGridLayout(itemCount)}`}
              style={{ columnGap: '.13em', rowGap: '.13em' }}
            >
              {activeData.children.map((child, idx) => (
                <MegaMenuCard
                  key={idx}
                  item={child}
                  index={idx}
                />
              ))}
            </div>
          )}

          {/* ================================================
              OPTIONAL FOOTER SECTION
              Display additional links or information
              ================================================ */}

          {activeData.footer && (
            <div className="mt-4 pt-4 border-t">
              <div className="flex items-center justify-between">
                {/* Footer text */}
                <p className="text-sm text-muted-foreground">
                  {activeData.footer.text}
                </p>

                {/* Optional footer link (e.g., "View All") */}
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

  /**
   * Main render: Navigation bar + conditional dropdown
   * The nav bar is always visible, dropdown appears on hover
   */
  return (
    <>
      {/* NAVIGATION BAR - Horizontal menu buttons */}
      <nav
        ref={navRef}
        className="flex space-x-4 h-full items-center"
      >
        {renderMenuItems()}
      </nav>

      {/* MEGA MENU DROPDOWN - Appears below nav bar when active */}
      {renderMegaMenuContent()}
    </>
  );
};

// Set display name for React DevTools
MegaMenu.displayName = 'MegaMenu';

export default MegaMenu;
