// frontend/src/layouts/components/Header.jsx
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button'; // shadcn Button
import MegaMenu from './MegaMenu.jsx';
import { ThemeToggle } from '@/components/theme-toggle.jsx'; // Your ThemeToggle component

const Header = () => {
  const [activeMenu, setActiveMenu] = useState(null);

  const onMenuEnter = (menuId) => setActiveMenu(menuId);
  const onMenuLeave = () => setActiveMenu(null);

  return (
    <header className="fixed top-0 left-0 right-0 z-50 border-b bg-background shadow-md h-16">
      <div className="flex items-center justify-between h-full px-6">
        {/* Logo/Title */}
        <Link to="/" className="text-xl font-bold tracking-tight">
          ThinkNet 
        </Link>

        {/* MegaMenu (Navigation) */}
        <div 
          className="flex space-x-4 h-full"
          onMouseLeave={onMenuLeave} // Allows the menu to close when mouse leaves header area
        >
          <MegaMenu 
            activeMenu={activeMenu}
            onMenuEnter={onMenuEnter}
            onMenuLeave={onMenuLeave}
          />
        </div>

        {/* Theme Toggle and User Icon */}
        <div className="flex items-center space-x-4">
          <ThemeToggle />
          <Button variant="ghost" size="icon">
            👤 {/* Placeholder for User Icon */}
          </Button>
        </div>
      </div>
      
      {/* Render Mega Menu Content overlay (This is handled inside MegaMenu.jsx) */}
    </header>
  );
};

export default Header;
