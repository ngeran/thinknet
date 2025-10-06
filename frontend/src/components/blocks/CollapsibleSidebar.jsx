import React, { useState } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { ChevronRight, Menu } from 'lucide-react';

// IMPORTANT: Import all necessary Lucide icons for dynamic rendering
// For production, you might only import the ones you need, but for demonstration:
import * as LucideIcons from 'lucide-react';

// Reusable UI components (assuming shadcn/ui)
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';

/**
 * Utility function to dynamically map an icon string name (e.g., "Settings")
 * to the corresponding Lucide React component.
 * @param {string} iconName The string name of the icon (e.g., "Archive")
 * @returns {JSX.Element} The Lucide icon component with standard sizing.
 */
const getIconComponent = (iconName) => {
  // Finds the component based on the string name, defaulting to "Square" if not found.
  const IconComponent = LucideIcons[iconName] || LucideIcons['Square'];
  // All icons are consistently sized here
  return <IconComponent className="h-4 w-4" />;
};


export function CollapsibleSidebar({
  title,
  navItems,
  className
}) {
  const location = useLocation();
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Helper: Checks if the current route matches the item's route
  const isActive = (route) => location.pathname === route;

  // --- Core Sidebar Content (Desktop and Sheet) ---
  const SidebarContent = ({ isMobile = false }) => (
    <ScrollArea className="h-full">
      <div className={`flex flex-col space-y-4 p-4 ${isMobile ? 'w-full' : ''}`}>

        {(Array.isArray(navItems) ? navItems : []).map((section, index) => (
          <div key={index} className="space-y-2">

            {/* Section Title: Shows only the first letter when collapsed on desktop */}
            <h4 className={`mb-1 px-3 text-sm font-semibold tracking-wider text-muted-foreground ${isCollapsed && !isMobile ? 'text-center' : ''}`}>
              {isCollapsed && !isMobile ? (section.title[0]) : section.title}
            </h4>

            <div className="space-y-1">
              {section.items.map((item) => (
                <Button
                  key={item.id || item.route}
                  asChild
                  variant={isActive(item.route) ? "secondary" : "ghost"}
                  // FIX: Use px-2 (padding-x) for subtle padding in collapsed state
                  className={`w-full justify-start font-normal ${isCollapsed && !isMobile ? 'justify-center px-2 h-9' : ''}`}
                >
                  {/* Link: Must be w-full flex to control children layout */}
                  <Link to={item.route} className="w-full flex items-center">

                    {/* Icon Container: Fixed size in expanded state, centered in collapsed state */}
                    <div
                      // FIX: Use consistent w-5 h-5 (20px square) for icon placement
                      className={`flex items-center transition-all duration-200 
                                ${isCollapsed && !isMobile ? 'justify-center w-full' : 'w-5 h-5'}`}
                    >
                      {/* CRITICAL FIX: Dynamically render the icon component */}
                      {getIconComponent(item.icon)}
                    </div>

                    {/* Text: Hides completely when collapsed on desktop */}
                    {!(isCollapsed && !isMobile) && (
                      <span
                        // FIX: Ensure text occupies the remaining width and aligns left
                        className="ml-3 truncate transition-opacity duration-200 w-full text-left"
                      >
                        {item.title}
                      </span>
                    )}
                  </Link>
                </Button>
              ))}
            </div>
            {index < navItems.length - 1 && <Separator className="my-4" />}
          </div>
        ))}
      </div>
    </ScrollArea>
  );

  // --- Main Component Structure ---
  return (
    <>
      {/* 1. Desktop Sidebar: Width adjusts based on isCollapsed state */}
      <aside
        className={`hidden md:flex flex-col border-r transition-all duration-300 ease-in-out ${isCollapsed ? 'w-[72px]' : 'w-60'} ${className}`}
      >
        {/* Header/Toggle Section: Fixed height area */}
        <div className={`flex items-center p-4 h-[65px] ${isCollapsed ? 'justify-center' : 'justify-between'}`}>
          <h3 className={`font-bold transition-opacity duration-150 ${isCollapsed ? 'opacity-0 w-0' : 'opacity-100'} whitespace-nowrap overflow-hidden`}>
            {title}
          </h3>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsCollapsed(!isCollapsed)}
            aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <ChevronRight
              className={`h-4 w-4 transition-transform duration-300 ${isCollapsed ? 'rotate-0' : 'rotate-180'}`}
            />
          </Button>
        </div>

        <Separator />

        {/* Navigation Links Area */}
        <div className="flex-1 overflow-hidden">
          <SidebarContent />
        </div>
      </aside>

      {/* 2. Mobile Sheet: Full sidebar content displayed in a slide-out panel */}
      <div className="md:hidden absolute top-4 left-4 z-50">
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" size="icon" aria-label="Open menu">
              <Menu className="h-4 w-4" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="p-0 w-60">
            <div className="flex items-center p-4 h-[65px]">
              <h3 className="font-bold">{title}</h3>
            </div>
            <Separator />
            <SidebarContent isMobile={true} />
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}
export default CollapsibleSidebar;
