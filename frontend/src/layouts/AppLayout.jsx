/**
 * File Path: src/layouts/AppLayout.jsx
 * Version: 1.1.0
 * Description: Core application layout providing a fixed Header and Footer,
 * a full-height main content area, and context for global state (e.g., Mega Menu).
 *
 * Key Features:
 * - Full-height (min-h-screen) Flexbox layout (Header | Main Content/Sidebar | Footer).
 * - Automatic spacing (pt-16) to account for a fixed-height header.
 * - Integration point for Layout Context (Mega Menu state).
 * - Flexible structure for adding a sidebar or hero component.
 *
 * Detail How-To Guide:
 * -------------------------------------------------------------------------------------
 * 1. Integrating a Sidebar (Optional Navigation Panel):
 * To add a persistent sidebar, uncomment the placeholder below.
 * - The recommended component is placed inside the <div className="flex flex-1 pt-16"> container.
 * - Ensure your custom Sidebar component uses Tailwind classes (e.g., w-64, border-r)
 * to define its width and separation from the main content.
 *
 * 2. Integrating a Hero Section (Content above the Outlet):
 * To display a fixed Hero component on specific routes (like the Dashboard):
 * - Place the <Hero /> component inside the <main> element, *above* the <Outlet />.
 * - Use React Router to conditionally render the <Hero /> based on the current path.
 *
 * 3. Adding Modals/Overlays:
 * Any global overlays (Modals, Toasts, etc.) should be rendered outside of the 
 * <div className="min-h-screen..."> block to ensure they stack correctly on top 
 * of all other content.
 * -------------------------------------------------------------------------------------
 */

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

          {/* 3. MAIN CONTENT: flex-1 ensures it takes remaining width.
                p-4/md:p-8 is the padding INSIDE the main scrollable area.
            */}
          <main className="flex-1 overflow-y-auto">
            {/* ✅ NEW CONTAINER FOR ALIGNMENT ✅
                    
                    This div enforces the max-width and centering, making the content 
                    align exactly with the header's content boundaries (max-w-7xl). 
                    The header uses px-4, so we must re-apply the horizontal padding here.
                */}
            <div className="max-w-7xl mx-auto p-4 md:p-8">
              {/* Renders the specific page content (Dashboard, Automation, etc.) */}
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
