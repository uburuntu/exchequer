import { mount } from 'svelte'

// ============================================
// Global Error Reporting for Actionable Issues
// ============================================

const APP_VERSION = '1.0.0';
const GITHUB_ISSUES_URL = 'https://github.com/uburuntu/exchequer/issues/new';

interface ErrorReport {
  type: 'error' | 'unhandledrejection';
  message: string;
  stack?: string;
  url: string;
  timestamp: string;
  userAgent: string;
  appVersion: string;
}

function formatErrorReport(report: ErrorReport): string {
  return `
╔══════════════════════════════════════════════════════════════════╗
║  CGC Error Report                                                 ║
╚══════════════════════════════════════════════════════════════════╝

📍 Type: ${report.type}
📝 Message: ${report.message}
⏰ Time: ${report.timestamp}
🌐 URL: ${report.url}
📱 App Version: ${report.appVersion}

${report.stack ? `📚 Stack Trace:\n${report.stack}` : ''}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
To report this issue, please visit:
${GITHUB_ISSUES_URL}

Include the above error details in your report.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`.trim();
}

function createErrorReport(type: 'error' | 'unhandledrejection', error: Error | string): ErrorReport {
  const isError = error instanceof Error;
  return {
    type,
    message: isError ? error.message : String(error),
    stack: isError ? error.stack : undefined,
    url: window.location.href,
    timestamp: new Date().toISOString(),
    userAgent: navigator.userAgent,
    appVersion: APP_VERSION,
  };
}

// Global error handler for uncaught exceptions
window.addEventListener('error', (event) => {
  const report = createErrorReport('error', event.error || event.message);
  console.error(formatErrorReport(report));

  // Prevent the browser from showing default error dialog in dev
  // but let it bubble in production for error tracking services
  if (import.meta.env.DEV) {
    event.preventDefault();
  }
});

// Global handler for unhandled promise rejections
window.addEventListener('unhandledrejection', (event) => {
  const error = event.reason instanceof Error ? event.reason : String(event.reason);
  const report = createErrorReport('unhandledrejection', error);
  console.error(formatErrorReport(report));
});

// Log app initialization
console.log(
  `%c CGC - UK Capital Gains Tax Calculator v${APP_VERSION} %c`,
  'background: #1a2744; color: #f5f0e5; padding: 4px 8px; border-radius: 4px; font-weight: bold;',
  ''
);
console.log('📊 Privacy-first tax calculations — entirely in your browser');
console.log(`🐛 Report issues: ${GITHUB_ISSUES_URL}`);

// Fontsource fonts - bundled with the app, no external requests
import '@fontsource/playfair-display/400.css'
import '@fontsource/playfair-display/600.css'
import '@fontsource/playfair-display/700.css'
import '@fontsource/source-sans-3/300.css'
import '@fontsource/source-sans-3/400.css'
import '@fontsource/source-sans-3/500.css'
import '@fontsource/source-sans-3/600.css'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'

import './app.css'
import App from './App.svelte'

const app = mount(App, {
  target: document.getElementById('app')!,
})

export default app
