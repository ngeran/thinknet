import React, { useState } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { ChevronRight, Menu } from 'lucide-react';

// Reusable UI components (assuming you have them from shadcn/ui)
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';

export function CollapsibleSidebar({
  title,
  navItems,
  className
}) {
  const location = useLocation();
  const [isCollapsed, setIsCollapsed] = useState(false);

  // FIX: Use item.route to check against location.pathname
  const isActive = (route) => location.pathname === route;

  // --- Core Sidebar Content (Desktop and Sheet) ---
  const SidebarContent = ({ isMobile = false }) => (
    <ScrollArea className="h-full">
      <div className={`flex flex-col space-y-4 p-4 ${isMobile ? 'w-full' : ''}`}>

        {/* CRITICAL FIX: Ensure navItems is an array before calling map */}
        {(Array.isArray(navItems) ? navItems : []).map((section, index) => (
          <div key={index} className="space-y-2">
            <h4 className={`mb-1 px-3 text-sm font-semibold tracking-wider text-muted-foreground ${isCollapsed && !isMobile ? 'text-center' : ''}`}>
              {/* FIX: Use item.title (backend returns full title) */}
              {isCollapsed && !isMobile ? (section.title[0]) : section.title}
            </h4>
            <div className="space-y-1">
              {section.items.map((item) => (
                <Button
                  // FIX: Use item.id or item.route for the key
                  key={item.id || item.route}
                  asChild
                  // FIX: Pass item.route to the isActive check
                  variant={isActive(item.route) ? "secondary" : "ghost"}
                  // CRITICAL: Collapse to icon-only size 
                  className={`w-full justify-start font-normal ${isCollapsed && !isMobile ? 'justify-center p-0 h-9' : ''}`}
                >
                  {/* CRITICAL: Add w-full flex to the Link */}
                  {/* FIX: Use item.route for the Link's 'to' prop */}
                  <Link to={item.route} className="w-full flex items-center">
                    {/* Icon Container: Ensures the icon is the focus when collapsed */}
                    <div className={`flex items-center transition-all duration-200 ${isCollapsed && !isMobile ? 'justify-center w-full' : 'w-4'}`}>
                      {/* TODO: You need a component to render the icon string (item.icon) here */}
                      {item.icon}
                    </div>
                    {/* Text: Hides the span text */}
                    {!(isCollapsed && !isMobile) && (
                      <span className="ml-3 truncate transition-opacity duration-200">
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
      {/* 1. Desktop Sidebar */}
      <aside
        className={`hidden md:flex flex-col border-r transition-all duration-300 ease-in-out ${isCollapsed ? 'w-[72px]' : 'w-60'} ${className}`}
      >
        {/* Header/Toggle Section */}
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

        {/* Navigation Links */}
        <div className="flex-1 overflow-hidden">
          <SidebarContent />
        </div>
      </aside>

      {/* 2. Mobile Sheet Trigger (Remains the same) */}
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
