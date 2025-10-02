// frontend/src/layouts/context/LayoutContext.jsx
import React, { createContext, useContext, useState, useRef, useEffect, useCallback } from 'react';

// NOTE: We are relying on the ThemeProvider component already used in main.jsx
// and are replacing the custom useTheme hook with local state where necessary.
// For the sake of simplification, we'll keep the theme state simple here 
// since the primary ThemeProvider handles the dark/light class on HTML.

export const LayoutContext = createContext({
  activeMegaMenu: null,
  onMenuEnter: () => { },
  onMenuLeave: () => { },
});

export const useLayoutContext = () => {
  const context = useContext(LayoutContext);
  if (!context) {
    throw new Error('useLayoutContext must be used within a LayoutProvider');
  }
  return context;
};

export const LayoutProvider = ({ children }) => {
  const [activeMegaMenu, setActiveMegaMenu] = useState(null);
  const menuTimeoutRef = useRef(null);

  // Cleanup timeout when component unmounts
  useEffect(() => {
    return () => {
      if (menuTimeoutRef.current) {
        clearTimeout(menuTimeoutRef.current);
      }
    };
  }, []);

  // Handle hover/focus enter on a menu item
  const handleMenuEnter = useCallback((menuName) => {
    if (menuTimeoutRef.current) {
      clearTimeout(menuTimeoutRef.current);
    }
    setActiveMegaMenu(menuName);
  }, []);

  // Handle leaving a menu area (delays close slightly for UX).
  const handleMenuLeave = useCallback(() => {
    menuTimeoutRef.current = setTimeout(() => {
      setActiveMegaMenu(null);
    }, 200); // 200ms delay for smooth transition
  }, []);

  const layoutContextValue = {
    activeMegaMenu,
    onMenuEnter: handleMenuEnter,
    onMenuLeave: handleMenuLeave,
  };

  return (
    <LayoutContext.Provider value={layoutContextValue}>
      {children}
    </LayoutContext.Provider>
  );
};
