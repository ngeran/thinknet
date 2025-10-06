// src/layouts/AppLayout.jsx (FINAL CSS FIX)

import { Outlet } from 'react-router-dom';
import Header from './components/Header.jsx';
import Footer from './components/Footer.jsx';
import { LayoutProvider } from './context/LayoutContext.jsx';


const AppLayout = () => {
  return (
    <LayoutProvider>
      <div className="min-h-screen bg-background text-foreground flex flex-col">

        {/* ======================= 1. HEADER ======================= */}
        <Header />

        {/* ======================= 2. MAIN FLEX AREA ===================== */}
        <div className="flex flex-1 pt-16">

          <main className="flex-1 overflow-y-auto">

            {/* ✅ RESTORING THE CENTERING CONTAINER HERE ✅
                This brings back the centered, bounded look for all non-Operations pages. 
                OperationsLayout will now intentionally break out of it.
            */}
            <div className="max-w-7xl mx-auto p-4 md:p-8">
              <Outlet />
            </div>
          </main>

        </div>

        {/* ======================= 5. FOOTER ======================= */}
        <Footer />

      </div>
    </LayoutProvider>
  );
};
export default AppLayout;
