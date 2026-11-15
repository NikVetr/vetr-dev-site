export {};
declare global {
  interface Window {
    Stan2R: { submit: typeof import('./core/browser.js').submit };
  }
}
