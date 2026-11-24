/**
 * CSS Theme Color Utilities
 * 
 * This module provides utility functions for working with CSS variables
 * within the Three.js application. It helps convert CSS variables to
 * Three.js compatible color formats.
 */

import * as THREE from 'three';

// Cache for parsed theme colors to improve performance
const colorCache = new Map<string, number>();

/**
 * Gets a CSS variable value and returns it as a hex color number for Three.js
 * @param variableName CSS variable name (including --prefix)
 * @param fallback Fallback color in hex format (0xRRGGBB)
 * @param useCache Whether to use cached values (default: true)
 */
export function getThemeColorAsHex(variableName: string, fallback: number = 0xffffff, useCache: boolean = true): number {
  if (typeof document === 'undefined') return fallback;
  
  // Check cache first
  const cacheKey = `${variableName}_${document.documentElement.classList.contains('dark-theme') ? 'dark' : 'light'}`;
  if (useCache && colorCache.has(cacheKey)) {
    return colorCache.get(cacheKey)!;
  }
  
  // Try getting the CSS variable from the document element
  let cssColor = getComputedStyle(document.documentElement)
    .getPropertyValue(variableName).trim();
    
  // If not found on documentElement, try on body
  if (!cssColor) {
    cssColor = getComputedStyle(document.body || document.documentElement)
      .getPropertyValue(variableName).trim();
  }
  
  // Debug logging to understand what's happening
  console.debug(`getThemeColorAsHex: ${variableName} -> "${cssColor}"`);
    
  if (!cssColor) {
    console.warn(`CSS variable ${variableName} is empty or not found, using fallback 0x${fallback.toString(16)}`);
    return fallback;  
  }
  
  let result = fallback;
  
  try {
    // Handle different CSS color formats
    if (cssColor.startsWith('#')) {
      // Handle hex format (#fff or #ffffff)
      const cleanHex = cssColor.replace('#', '');
      let hexValue;
      
      if (cleanHex.length === 3) {
        // Convert 3-digit hex to 6-digit (e.g., #f0a -> #ff00aa)
        hexValue = parseInt(
          cleanHex.split('').map(char => char + char).join(''), 
          16
        );
      } else {
        hexValue = parseInt(cleanHex, 16);
      }
      
      if (isNaN(hexValue)) {
        console.warn(`Invalid hex color: ${cssColor}`);
        result = fallback;
      } else {
        console.debug(`Parsed hex ${cssColor} -> 0x${hexValue.toString(16)}`);
        result = hexValue;
      }
    } else if (cssColor.startsWith('rgb')) {
      // Handle rgb/rgba format
      const rgbMatch = cssColor.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
      if (rgbMatch) {
        const r = parseInt(rgbMatch[1]);
        const g = parseInt(rgbMatch[2]);
        const b = parseInt(rgbMatch[3]);
        
        if (isNaN(r) || isNaN(g) || isNaN(b) || r > 255 || g > 255 || b > 255) {
          console.warn(`Invalid RGB values: ${cssColor}`);
          result = fallback;
        } else {
          const hexValue = (r << 16) + (g << 8) + b;
          console.debug(`Parsed rgb ${cssColor} -> 0x${hexValue.toString(16)}`);
          result = hexValue;
        }
      }
    } else if (cssColor.match(/^[a-zA-Z]+$/)) {
      // Handle named colors (red, blue, etc.)
      const tempEl = document.createElement('div');
      tempEl.style.color = cssColor;
      tempEl.style.display = 'none';
      document.body.appendChild(tempEl);
      
      const computedColor = getComputedStyle(tempEl).color;
      document.body.removeChild(tempEl);
      
      // Now parse the computed RGB color
      const rgbMatch = computedColor.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
      if (rgbMatch) {
        const r = parseInt(rgbMatch[1]);
        const g = parseInt(rgbMatch[2]);
        const b = parseInt(rgbMatch[3]);
        const hexValue = (r << 16) + (g << 8) + b;
        console.debug(`Parsed named color ${cssColor} -> ${computedColor} -> 0x${hexValue.toString(16)}`);
        result = hexValue;
      }
    } else {
      console.warn(`Could not parse color format: "${cssColor}" for variable ${variableName}, using fallback`);
      result = fallback;
    }
  } catch (error) {
    console.warn(`Failed to parse color for ${variableName}:`, error);
    result = fallback;
  }
  
  // Cache the result
  if (useCache) {
    colorCache.set(cacheKey, result);
  }
  
  return result;
}

/**
 * Gets a CSS variable and returns it as a THREE.Color object
 * @param variableName CSS variable name (including --prefix)
 * @param fallback Fallback color in hex format (0xRRGGBB)
 */
export function getThemeColorAsThreeColor(variableName: string, fallback: number = 0xffffff): THREE.Color {
  return new THREE.Color(getThemeColorAsHex(variableName, fallback));
}

/**
 * Gets multiple CSS variables and returns them as an object with hex number values
 * @param variables Object with keys as desired property names and values as CSS variable names
 * @param fallbacks Object with fallback colors
 */
export function getThemeColors(
  variables: Record<string, string>, 
  fallbacks: Record<string, number> = {}
): Record<string, number> {
  const result: Record<string, number> = {};
  
  Object.entries(variables).forEach(([key, varName]) => {
    result[key] = getThemeColorAsHex(varName, fallbacks[key] ?? 0xffffff);
  });
  
  return result;
}

/**
 * Updates the theme colors in the application
 * This can be called when theme changes
 */
export function updateThemeColors(): void {
  // Clear the color cache when theme changes
  colorCache.clear();
  
  // Invalidate CSS cache by forcing a style recalculation
  if (typeof document !== 'undefined') {
    document.documentElement.style.display = 'none';
    // Trigger reflow
    void document.documentElement.offsetHeight;
    document.documentElement.style.display = '';
  }
  
  // Get current theme for logging
  const currentTheme = document.documentElement.classList.contains('dark-theme') ? 'dark' : 'light';
  
  // Event to notify components that theme colors have changed
  window.dispatchEvent(new CustomEvent('theme-colors-changed', { 
    detail: { theme: currentTheme } 
  }));
  
  // Force ThreeJSCore refresh by dispatching an additional specific event
  window.dispatchEvent(new CustomEvent('threejs-theme-update', { 
    detail: { theme: currentTheme } 
  }));
  
  console.log(`Theme colors updated to ${currentTheme} theme`);
}

/**
 * Sets up a listener for theme changes
 * @param callback Function to run when theme changes
 */
export function addThemeChangeListener(callback: () => void): () => void {
  const handleThemeChange = () => {
    callback();
  };
  
  window.addEventListener('theme-colors-changed', handleThemeChange);
  
  // Return cleanup function
  return () => {
    window.removeEventListener('theme-colors-changed', handleThemeChange);
  };
}

/**
 * Toggles between light and dark themes
 * @returns The name of the new active theme
 */
export function toggleTheme(): 'light' | 'dark' {
  if (typeof document === 'undefined') return 'light';
  
  const isDarkTheme = document.documentElement.classList.contains('dark-theme');
  
  if (isDarkTheme) {
    document.documentElement.classList.remove('dark-theme');
    updateThemeColors();
    return 'light';
  } else {
    document.documentElement.classList.add('dark-theme');
    updateThemeColors();
    return 'dark';
  }
}

/**
 * Initialize the theme system on application startup
 * Makes sure there's a consistent theme state (light by default)
 */
export function initializeTheme(): 'light' | 'dark' {
  if (typeof document === 'undefined') return 'light';
  
  // Check for user preference or previously set theme
  const userPrefersDark = window.matchMedia && 
    window.matchMedia('(prefers-color-scheme: dark)').matches;
  
  // Check if theme is already set
  const hasThemeClass = document.documentElement.classList.contains('dark-theme');
  
  if (userPrefersDark && !hasThemeClass) {
    // User prefers dark mode but it's not set
    document.documentElement.classList.add('dark-theme');
    updateThemeColors();
    return 'dark';
  } else if (!userPrefersDark && hasThemeClass) {
    // User prefers light mode but dark is set
    document.documentElement.classList.remove('dark-theme');
    updateThemeColors();
    return 'light';
  } else if (hasThemeClass) {
    // Dark theme is already set correctly
    updateThemeColors();
    return 'dark';
  } else {
    // Light theme is already set or is the default
    updateThemeColors();
    return 'light';
  }
}

/**
 * Waits for theme CSS to be loaded and available
 * This is useful when initializing components that need theme colors immediately
 */
export function waitForThemeColors(): Promise<boolean> {
  return new Promise((resolve) => {
    // Test if common CSS variables are available
    const testVariables = ['--color-primary', '--color-building-blue', '--color-scene-background'];
    
    let settled = false;
    // Assigned once, below; a let because finish (defined first) reads it, possibly before the assignment.
    // eslint-disable-next-line prefer-const
    let timeoutId: number | undefined;
    const finish = (loaded: boolean) => {
      if (settled) return;
      settled = true;
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      document.removeEventListener('DOMContentLoaded', checkColors);
      resolve(loaded);
    };

    const checkColors = () => {
      const allLoaded = testVariables.every(varName => {
        const cssValue = getComputedStyle(document.documentElement)
          .getPropertyValue(varName).trim();
        return cssValue !== '';
      });
      
      if (allLoaded) {
        console.debug('Theme colors are available');
        finish(true);
        return;
      }
      
      // If CSS not loaded yet, wait a bit and try again
      setTimeout(checkColors, 10);
    };
    
    // Start checking immediately
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', checkColors);
    } else {
      checkColors();
    }
    
    // Timeout after 2 seconds
    timeoutId = window.setTimeout(() => {
      if (settled) return;
      console.warn('Theme colors may not be loaded properly, continuing anyway');
      finish(false);
    }, 2000);
  });
}

/**
 * Force refresh all theme-related materials and colors
 * Call this when switching themes to update all Three.js objects
 */
export function refreshThemeColors(): void {
  updateThemeColors();
  
  // Dispatch a more specific event for Three.js components to listen to
  window.dispatchEvent(new CustomEvent('theme-refresh-required', {
    detail: { 
      timestamp: Date.now(),
      theme: document.documentElement.classList.contains('dark-theme') ? 'dark' : 'light'
    }
  }));
}

/**
 * Get all available CSS variables from the theme-colors.css
 * This helps debug which variables are actually available
 */
export function getAllThemeVariables(): string[] {
  const variables: string[] = [];
  
  if (typeof document === 'undefined') return variables;
  
  // Get all stylesheets
  for (let i = 0; i < document.styleSheets.length; i++) {
    try {
      const styleSheet = document.styleSheets[i];
      const rules = styleSheet.cssRules || styleSheet.rules;
      
      for (let j = 0; j < rules.length; j++) {
        const rule = rules[j] as CSSStyleRule;
        if (rule.selectorText === ':root' || rule.selectorText === '.dark-theme') {
          const style = rule.style;
          for (let k = 0; k < style.length; k++) {
            const property = style[k];
            if (property.startsWith('--color-')) {
              if (!variables.includes(property)) {
                variables.push(property);
              }
            }
          }
        }
      }
    } catch (e) {
      // Skip stylesheets that can't be accessed (CORS issues)
      console.debug('Cannot access stylesheet:', e);
    }
  }
  
  return variables.sort();
}

/**
 * Debug function to output all theme colors to the console
 * Useful for troubleshooting theme issues
 * @param variables Array of CSS variable names to debug
 */
export function debugThemeColors(variables: string[] = []): void {
  if (typeof document === 'undefined') return;
  
  // If no variables provided, debug common ones
  if (variables.length === 0) {
    variables = [
      '--color-sun-light',
      '--color-ambient-light',
      '--color-hemisphere-sky',
      '--color-hemisphere-ground',
      '--color-ground',
      '--color-grid',
      '--color-scene-background',
      '--color-building-default',
      '--color-building-preview',
      '--color-building-selected',
      '--color-primary',
      '--color-background'
    ];
  }
  
  console.group('Theme Colors Debug');
  
  // Current theme
  const theme = document.documentElement.classList.contains('dark-theme') ? 'dark' : 'light';
  console.log(`Current theme: ${theme}`);
  
  // Log each variable's CSS value and parsed Three.js value
  variables.forEach(varName => {
    const cssValue = getComputedStyle(document.documentElement)
      .getPropertyValue(varName).trim();
    const threeJsValue = getThemeColorAsHex(varName).toString(16).padStart(6, '0');
    
    console.log(
      `${varName}:`,
      cssValue || '(not set)',
      `→ 0x${threeJsValue}`
    );
  });
  
  console.groupEnd();
}

/**
 * Test function to verify that CSS variables are working properly
 * Call this in the browser console to check if the theme system is working
 */
export function testThemeColorSystem(): void {
  console.group('Theme Color System Test');
  
  // Test a few key variables
  const testVars = [
    '--color-primary',
    '--color-background', 
    '--color-building-default',
    '--color-scene-background'
  ];
  
  testVars.forEach(varName => {
    const cssValue = getComputedStyle(document.documentElement)
      .getPropertyValue(varName).trim();
    const parsedValue = getThemeColorAsHex(varName, 0x000000);
    
    console.log(`${varName}:`, {
      cssValue,
      parsedHex: `0x${parsedValue.toString(16).padStart(6, '0')}`,
      isWorking: cssValue !== '' && parsedValue !== 0x000000
    });
  });
  
  console.groupEnd();
}
