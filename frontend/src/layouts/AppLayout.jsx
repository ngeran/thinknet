// src/layouts/AppLayout.jsx (FINAL LAYOUT FIX - Fixed/Sticky Header Handling)

import { Outlet, useLocation } from 'react-router-dom';
import Header from './components/Header.jsx';
import Footer from './components/Footer.jsx';
import { LayoutProvider } from './context/LayoutContext.jsx';


// Define a standard header height class for reserving space
// NOTE: Use the Tailwind class that matches your Header component's actual height.
// h-[64px] (or h-16) is a common choice.
const HEADER_HEIGHT_CLASS = 'h-16';

const AppLayout = () => {
  const location = useLocation();

  // Check if the current route starts with '/operations' (Full-width route logic)
  const isFullWidthLayout = location.pathname.startsWith('/operations');
  const centeringClasses = "max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4";

  return (
    <LayoutProvider>
      {/* Main container must be min-h-screen for full height */}
      <div className="min-h-screen bg-background text-foreground flex flex-col">

        {/* ======================= 1. HEADER (Fixed/Sticky) ======================= */}
        {/* Assume the Header uses fixed/sticky positioning and a height of h-16 */}
        <Header className={`fixed top-0 left-0 right-0 z-40 ${HEADER_HEIGHT_CLASS}`} />

        {/* 2. HEIGHT RESERVATION DIV 🔑 */}
        {/* This empty div reserves the space vacated by the fixed Header */}
        <div className={HEADER_HEIGHT_CLASS}></div>


        {/* ======================= 3. MAIN FLEX AREA ===================== */}
        {/* flex-1 ensures this area takes all remaining vertical space */}
        <div className="flex flex-1">

          <main className="flex-1 overflow-y-auto">

            {/* CONDITIONAL LAYOUT LOGIC (To handle symmetry vs. full width) */}
            {isFullWidthLayout ? (
              // Full-width layout (for Operations Sidebar)
              <Outlet />
            ) : (
              // Symmetrical layout (for Dashboard and other pages)
              <div className={centeringClasses}>
                <Outlet />
              </div>
            )}

          </main>

        </div>

        {/* ======================= 4. FOOTER ======================= */}
        <Footer />

      </div>
    </LayoutProvider>
  );
};
export default AppLayout;
