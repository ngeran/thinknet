/**
 * =============================================================================
 * DEVICE AUTHENTICATION FIELDS COMPONENT
 * =============================================================================
 *
 * File Path: src/shared/DeviceAuthFields.jsx
 * Version: 3.1.1
 *
 * DESCRIPTION:
 * A modern, accessible authentication component featuring username and password
 * fields with real-time validation, password visibility toggle, and elegant
 * shadcn/ui-inspired styling with subtle animations and micro-interactions.
 *
 * UPDATE (v3.1.1): Added form wrapper and keydown event handling to prevent page refreshes
 * on input, ensuring Enter key and other keypresses do not trigger unwanted form submissions.
 *
 * KEY FEATURES:
 * • Real-time field validation with visual feedback
 * • Password visibility toggle with smooth transitions
 * • Responsive grid layout (stacked on mobile, side-by-side on desktop)
 * • Accessibility-first design with proper ARIA labels
 * • Modern glassmorphism design with gradient backgrounds
 * • Animated validation messages and icons
 * • Customizable theming and styling options
 * • Form submission prevention for input fields
 *
 * DEPENDENCIES:
 * • react: ^18.0.0 (useState, useEffect hooks for state management)
 * • lucide-react: ^0.263.1 (User, Lock, Shield, Eye, EyeOff icons)
 * • tailwindcss: ^3.0.0 (utility-first CSS framework)
 *
 * HOW TO USE:
 * ```jsx
 * import DeviceAuthFields from './DeviceAuthFields';
 *
 * function MyApp() {
 *   const [authParams, setAuthParams] = useState({});
 *
 *   const handleParamChange = (name, value) => {
 *     setAuthParams(prev => ({ ...prev, [name]: value }));
 *   };
 *
 *   return (
 *     <DeviceAuthFields
 *       parameters={authParams}
 *       onParamChange={handleParamChange}
 *       title="Device Login"
 *       description="Enter your credentials"
 *     />
 *   );
 * }
 * ```
 */

import React, { useState, useEffect, useRef } from "react";
import { User, Lock, Shield, Eye, EyeOff } from "lucide-react";

// =============================================================================
// MAIN COMPONENT EXPORT
// =============================================================================
// Primary authentication fields component with validation and modern UI
export default function DeviceAuthFields({
  parameters = {},
  onParamChange = () => { },
  title = "Device Authentication",
  description = "Secure credentials for device access",
  className = ""
}) {
  // =============================================================================
  // STATE MANAGEMENT SECTION
  // =============================================================================
  // Manages password visibility toggle state
  const [showPassword, setShowPassword] = useState(false);
  const componentRef = useRef(null);

  // =============================================================================
  // VALIDATION LOGIC SECTION
  // =============================================================================
  // Computes field validation states for real-time feedback
  const isUsernameValid = parameters.username?.trim().length > 0;
  const isPasswordValid = parameters.password?.trim().length > 0;

  // =============================================================================
  // EVENT HANDLERS SECTION
  // =============================================================================
  // Handles input field changes and propagates to parent component
  const handleInputChange = (e) => {
    e.stopPropagation();
    const { name, value } = e.target;
    onParamChange(name, value);
  };

  // Toggles password visibility with state update
  const togglePasswordVisibility = (e) => {
    e.stopPropagation();
    setShowPassword(prev => !prev);
  };

  // Prevents default form submission
  const handleFormSubmit = (e) => {
    e.preventDefault();
    e.stopPropagation();
    return false;
  };

  // Prevents Enter key from triggering page refresh
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (componentRef.current && componentRef.current.contains(document.activeElement)) {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, []);

  // =============================================================================
  // STYLING HELPERS SECTION
  // =============================================================================
  // Dynamic CSS classes based on validation state
  const getInputClasses = (isValid) => `
    w-full pl-10 pr-4 py-3 text-sm
    border rounded-lg transition-all duration-200
    placeholder:text-muted-foreground
    focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2
    hover:border-muted-foreground/50
    ${isValid
      ? 'border-border bg-background'
      : 'border-destructive/50 bg-destructive/5 focus:ring-destructive/20'
    }
  `.trim();

  const getIconClasses = (isValid) => `
    absolute left-3 top-3 h-4 w-4 transition-colors duration-200
    ${isValid ? 'text-muted-foreground' : 'text-destructive'}
  `.trim();

  // =============================================================================
  // COMPONENT RENDER SECTION
  // =============================================================================
  return (
    <div className={`
      bg-card border rounded-xl shadow-sm backdrop-blur-sm
      ${className}
    `.trim()}>
      {/* HEADER SECTION - Title, description, and security indicator */}
      <div className="px-6 py-4 border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Shield className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">{title}</h3>
              <p className="text-sm text-muted-foreground">{description}</p>
            </div>
          </div>

          {/* Security Status Badge */}
          <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/50 rounded-full border">
            <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse" />
            <span className="text-xs font-medium text-muted-foreground">Secure</span>
          </div>
        </div>
      </div>

      {/* FORM FIELDS SECTION - Username and password inputs with validation */}
      <form onSubmit={handleFormSubmit} ref={componentRef} className="p-6">
        <div className="grid gap-4 md:grid-cols-2">
          {/* Username Input Field */}
          <div className="space-y-2">
            <div className="relative">
              <input
                type="text"
                name="username"
                value={parameters.username || ""}
                onChange={handleInputChange}
                placeholder="Username"
                className={getInputClasses(isUsernameValid)}
                aria-describedby={!isUsernameValid ? "username-error" : undefined}
              />
              <User className={getIconClasses(isUsernameValid)} />
            </div>
            {!isUsernameValid && (
              <p
                id="username-error"
                className="text-xs text-destructive animate-in fade-in duration-200"
              >
                Username is required
              </p>
            )}
          </div>

          {/* Password Input Field with Visibility Toggle */}
          <div className="space-y-2">
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                name="password"
                value={parameters.password || ""}
                onChange={handleInputChange}
                placeholder="Password"
                className={`${getInputClasses(isPasswordValid)} pr-10`}
                aria-describedby={!isPasswordValid ? "password-error" : undefined}
              />
              <Lock className={getIconClasses(isPasswordValid)} />

              {/* Password Visibility Toggle Button */}
              <button
                type="button"
                onClick={togglePasswordVisibility}
                className="absolute right-3 top-3 h-4 w-4 text-muted-foreground hover:text-foreground transition-colors"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {!isPasswordValid && (
              <p
                id="password-error"
                className="text-xs text-destructive animate-in fade-in duration-200"
              >
                Password is required
              </p>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}
