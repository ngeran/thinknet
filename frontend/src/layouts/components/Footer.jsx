// frontend/src/layouts/components/Footer.jsx (Tailwind/shadcn)

import React from 'react';
// We no longer need useLayoutContext for basic theming, 
// as the body/HTML class in main.jsx handles theme application globally.

// ================================================
// FOOTER COMPONENT
// ================================================

// We simplify the props since styling is handled via Tailwind
const Footer = () => {

  // --- Tailwind Utility Components ---

  // The separator is now a simple border
  const renderSeparator = () => (
    <div className="border-t border-border"></div>
  );

  const renderLogo = () => (
    // The logo links to the root page
    <a href="/" aria-current="page" className="flex items-center">
      {/* ⚠️ NOTE: Ensure this image URL is accessible from the container! */}
      <img
        src="https://cdn.prod.website-files.com/66e53bf67b6fc1646ce0777e/66e55b9f58de957ca8d85777e/66e55b9f58de957ca8d85785_Effortel_logo.svg"
        loading="lazy"
        alt="Effortel Logo"
        className="h-6" // Tailwind height class
      />
    </a>
  );

  // Copyright text uses muted colors
  const renderCopyright = () => (
    <div className="text-sm text-muted-foreground">©2025 Effortel</div>
  );

  // Designer link uses primary color for accent
  const renderDesignerAttribution = () => (
    <a
      href="https://www.onioncreative.studio/"
      target="_blank"
      rel="noopener noreferrer"
      className="text-sm text-muted-foreground hover:text-primary transition-colors"
    >
      Design & Dev by <span className="font-semibold underline">Onion</span>
    </a>
  );

  // ================================================
  // MAIN RENDER
  // ================================================

  return (
    // ✅ Footer container uses theme colors and is fixed at the bottom 
    // if the main content doesn't fill the screen (bg-card often preferred for footers)
    <footer className="w-full mt-auto bg-card text-foreground">
      {renderSeparator()}

      {/* Inner container for max width and padding */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex items-center justify-between h-full">

          {/* Content Row: Logo | Copyright | Attribution */}
          <div className="flex justify-between items-center w-full">
            {renderLogo()}
            {renderCopyright()}
            {renderDesignerAttribution()}
          </div>

        </div>
      </div>
    </footer>
  );
};

// ================================================
// COMPONENT METADATA
// ================================================

Footer.displayName = 'Footer';

export default Footer;
