/**
 * @format
 */
import React from 'react';
import { AppRegistry } from 'react-native';
import { name as appName } from './app.json';
import CrashScreen, { ErrorBoundary } from './src/CrashScreen';

// Never close silently: remember the first JS error and show it on screen.
let firstError = null;
const g = globalThis;
if (g.ErrorUtils && g.ErrorUtils.setGlobalHandler) {
  g.ErrorUtils.setGlobalHandler((e) => { if (!firstError) firstError = e; });
}

let Root;
try {
  const App = require('./App').default;
  Root = () => React.createElement(ErrorBoundary, null, React.createElement(App));
} catch (e) {
  Root = () => React.createElement(CrashScreen, { error: e });
}

AppRegistry.registerComponent(appName, () => (firstError ? () => React.createElement(CrashScreen, { error: firstError }) : Root));
