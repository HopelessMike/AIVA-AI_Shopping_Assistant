// src/polyfills.js - Polyfills for compatibility
import regeneratorRuntime from 'regenerator-runtime/runtime';

// Make regeneratorRuntime available globally
if (typeof globalThis.regeneratorRuntime === 'undefined') {
  globalThis.regeneratorRuntime = regeneratorRuntime;
}

if (typeof window !== 'undefined') {
  window.regeneratorRuntime = regeneratorRuntime;
}

console.log('Polyfills loaded successfully');
