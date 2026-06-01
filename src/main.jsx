import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { ThemeProvider } from './ui/shared/ThemeContext.jsx'

function AppRoot() {
  const [themeId, setThemeId] = useState(
    () => (typeof localStorage !== 'undefined' && localStorage.getItem('des.themeId')) || 'system'
  );
  return (
    <ThemeProvider themeId={themeId} onThemeChange={setThemeId}>
      <App onThemeChange={setThemeId} />
    </ThemeProvider>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AppRoot />
  </StrictMode>,
)
