/**
 * Shared theme definitions for Pinmark UI.
 * Provides both dark and light color tokens and a React hook that
 * automatically switches between them based on the OS/browser
 * `prefers-color-scheme` media query.
 */
import { useState, useEffect, useContext, createContext } from 'react';

export interface Theme {
  bg: string;
  surface: string;
  surface2: string;
  accent: string;
  accentHover: string;
  text: string;
  textMuted: string;
  border: string;
  good: string;
  bad: string;
  processed: string;
  ignore: string;
}

export const darkTheme: Theme = {
  bg: '#0f0f14',
  surface: '#1a1a24',
  surface2: '#22222e',
  accent: '#7c6af7',
  accentHover: '#9b8df9',
  text: '#e1e1e8',
  textMuted: '#888898',
  border: 'rgba(255,255,255,0.07)',
  good: '#48c78e',
  bad: '#ff6363',
  processed: '#888',
  ignore: '#555',
};

export const lightTheme: Theme = {
  bg: '#f5f5fa',
  surface: '#ffffff',
  surface2: '#ededf5',
  accent: '#6254e8',
  accentHover: '#7c6af7',
  text: '#18181f',
  textMuted: '#6b6b80',
  border: 'rgba(0,0,0,0.08)',
  good: '#28a065',
  bad: '#d94545',
  processed: '#777',
  ignore: '#aaa',
};

export const ThemeContext = createContext<Theme>(darkTheme);

/** Returns the active theme, re-rendering when the OS colour-scheme changes. */
export function useTheme(): Theme {
  const [isDark, setIsDark] = useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches,
  );

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setIsDark(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return isDark ? darkTheme : lightTheme;
}

/** Returns the active theme from the nearest ThemeContext provider. */
export function useThemeContext(): Theme {
  return useContext(ThemeContext);
}
