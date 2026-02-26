/**
 * CSS injection engine for Pinmark.
 * Applies visual tag styles to DOM elements using CSS custom properties.
 * Uses requestAnimationFrame batching and CSS transitions for smooth animations.
 */
import type { TagStyle, Settings } from '../shared/types';
import { DEFAULT_TAG_STYLES } from '../shared/types';

const ATTR = 'data-pinmark-tags';
const CLASS = 'pinmark-styled';

let currentSettings: Settings | null = null;

/** Inject global CSS once into the page */
export function injectBaseStyles(): void {
  if (document.getElementById('pinmark-base-styles')) return;
  const style = document.createElement('style');
  style.id = 'pinmark-base-styles';
  style.textContent = `
    .${CLASS} {
      transition: opacity 300ms ease, box-shadow 300ms ease, background-color 300ms ease, outline 300ms ease !important;
      position: relative;
    }
  `;
  document.head.appendChild(style);
}

/** Update cached settings for style resolution */
export function setStyleSettings(settings: Settings): void {
  currentSettings = settings;
}

/** Resolve the combined style for a set of tags */
function resolveStyle(tags: string[]): TagStyle {
  const styles = currentSettings?.tagStyles ?? DEFAULT_TAG_STYLES;
  const merged: TagStyle = {};
  for (const tag of tags) {
    const s = styles[tag];
    if (!s) continue;
    if (s.opacity !== undefined) merged.opacity = s.opacity;
    if (s.boxShadow) merged.boxShadow = s.boxShadow;
    if (s.backgroundColor) merged.backgroundColor = s.backgroundColor;
    if (s.borderColor) merged.borderColor = s.borderColor;
    if (s.outline) merged.outline = s.outline;
  }
  return merged;
}

/** Apply tag styles to an element */
export function applyTagStyles(el: HTMLElement, tags: string[]): void {
  if (tags.length === 0) {
    clearTagStyles(el);
    return;
  }

  el.setAttribute(ATTR, tags.join(' '));
  el.classList.add(CLASS);

  const style = resolveStyle(tags);
  el.style.opacity = style.opacity !== undefined ? String(style.opacity) : '';
  el.style.boxShadow = style.boxShadow ?? '';
  el.style.backgroundColor = style.backgroundColor ?? '';
  el.style.outline = style.outline ?? '';
  if (style.borderColor) {
    el.style.borderColor = style.borderColor;
    el.style.borderStyle = 'solid';
    el.style.borderWidth = '2px';
  }
}

/** Remove pinmark styles from an element */
export function clearTagStyles(el: HTMLElement): void {
  el.removeAttribute(ATTR);
  el.classList.remove(CLASS);
  el.style.opacity = '';
  el.style.boxShadow = '';
  el.style.backgroundColor = '';
  el.style.outline = '';
  el.style.borderColor = '';
}
