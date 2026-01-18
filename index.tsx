
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Suppress specific Recharts warning that occurs during initial render
// This is a known false-positive when using ResponsiveContainer
const originalWarn = console.warn;
console.warn = (...args) => {
  if (typeof args[0] === 'string' && args[0].includes('The width(-1) and height(-1) of chart should be greater than 0')) {
    return;
  }
  originalWarn.apply(console, args);
};

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <App />
);
