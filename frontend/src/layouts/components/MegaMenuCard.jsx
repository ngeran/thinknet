// frontend/src/layouts/components/MegaMenuCard.jsx
import React from 'react';
import { Link } from 'react-router-dom';
import * as LucideIcons from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

/**
 * MegaMenuCard Component
 * 
 * Renders an individual card within the MegaMenu dropdown.
 * Handles all card-specific styling, interactions, and presentation.
 * Supports both emoji icons and Lucide React icons.
 * 
 * @component
 * @param {Object} props - Component props
 * @param {Object} props.item - The menu item data
 * @param {string} props.item.title - Card title
 * @param {string} props.item.description - Card description (optional)
 * @param {string} props.item.icon - Card icon - emoji string or Lucide icon name (e.g., "Settings", "Upload")
 * @param {string} props.item.url - Navigation URL
 * @param {string} props.item.badge - Optional badge text (e.g., "New", "Popular")
 * @param {boolean} props.isHero - Whether this is a hero card (larger, featured styling)
 * @param {number} props.index - Card index for key generation
 * 
 * @example
 * // Using Lucide icon
 * <MegaMenuCard 
 *   item={{ title: "Analytics", icon: "BarChart3", url: "/analytics" }} 
 *   isHero={false}
 *   index={0}
 * />
 * 
 * @example
 * // Using emoji (fallback)
 * <MegaMenuCard 
 *   item={{ title: "Analytics", icon: "📊", url: "/analytics" }} 
 *   isHero={false}
 *   index={0}
 * />
 */
const MegaMenuCard = ({ item, isHero = false, index = 0 }) => {
  /**
   * Renders the appropriate icon - either Lucide React icon or emoji fallback
   * @returns {JSX.Element} Icon component
   */
  const renderIcon = () => {
    // Check if icon is a Lucide icon name (PascalCase string)
    if (item.icon && typeof item.icon === 'string') {
      // Try to get the Lucide icon component
      const LucideIcon = LucideIcons[item.icon];

      if (LucideIcon) {
        // Render Lucide icon with appropriate size
        return (
          <LucideIcon
            className={isHero ? 'w-8 h-8' : 'w-6 h-6'}
            strokeWidth={2}
          />
        );
      }
    }

    // Fallback to emoji or default link icon
    return <span className={isHero ? 'text-3xl' : 'text-2xl'}>{item.icon || '🔗'}</span>;
  };

  return (
    <Link
      to={item.url}
      // Hero cards span 2 rows in the 3-item layout
      className={`group ${isHero ? 'md:row-span-2' : ''}`}
      // Fixed height for consistent card sizing
      style={{ height: '200px' }}
    >
      <Card
        className={`h-full transition-all duration-300 hover:shadow-lg hover:border-primary/50 hover:-translate-y-1 rounded-xl ${
          // Hero cards get a subtle gradient background
          isHero ? 'bg-gradient-to-br from-primary/5 to-primary/10' : ''
          }`}
      >
        <CardContent
          className={`${
            // Hero cards get more padding
            isHero ? 'p-8' : 'p-5'
            } h-full flex flex-col justify-between`}
        >
          {/* ================================================
              ICON AND ARROW SECTION
              Top section with icon and hover arrow
              ================================================ */}
          <div className="flex items-start justify-between mb-3">
            {/* Icon Container */}
            <div
              className={`flex items-center justify-center ${
                // Hero cards get larger icons
                isHero ? 'w-16 h-16' : 'w-12 h-12'
                } rounded-lg bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors duration-300`}
            >
              {renderIcon()}
            </div>

            {/* Arrow Icon - Appears on hover */}
            <LucideIcons.ArrowRight
              className={`${isHero ? 'w-5 h-5' : 'w-4 h-4'
                } text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity duration-300`}
            />
          </div>

          {/* ================================================
              TEXT CONTENT SECTION
              Title and description
              ================================================ */}
          <div className="space-y-2 flex-grow">
            {/* Card Title */}
            <h4
              className={`${
                // Hero cards get larger title text
                isHero ? 'text-xl' : 'text-base'
                } font-semibold text-foreground group-hover:text-primary transition-colors duration-300`}
            >
              {item.title}
            </h4>

            {/* Card Description (optional) */}
            {item.description && (
              <p
                className={`${
                  // Hero cards show more lines of description
                  isHero ? 'text-base line-clamp-3' : 'text-sm line-clamp-2'
                  } text-muted-foreground leading-relaxed`}
              >
                {item.description}
              </p>
            )}
          </div>

          {/* ================================================
              BADGE SECTION (OPTIONAL)
              Display badge for "New", "Popular", etc.
              ================================================ */}
          {item.badge && (
            <div className="mt-3">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">
                {item.badge}
              </span>
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
};

// Set display name for React DevTools
MegaMenuCard.displayName = 'MegaMenuCard';

// Default export
export default MegaMenuCard;
