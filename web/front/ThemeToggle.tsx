import React from 'react'

const {
  THEME_LIGHT,
  THEME_TOGGLE_ICON_CLASS,
  THEME_TOGGLE_LABEL_CLASS,
  getStoredTheme,
  setTheme,
  themeToggleIcon,
  themeToggleLabel,
  toggleTheme,
} = require('ourbigbook/runtime_common')

const ThemeToggle = () => {
  const [theme, setThemeState] = React.useState(THEME_LIGHT)

  React.useEffect(() => {
    setThemeState(setTheme(getStoredTheme(), { persist: false }))
  }, [])

  return <button
    type="button"
    className="ourbigbook-theme-toggle"
    onClick={() => setThemeState(toggleTheme())}
  >
    <span className={`fas fa-solid-900 ${THEME_TOGGLE_ICON_CLASS}`} aria-hidden="true">
      {themeToggleIcon(theme)}
    </span>
    {' '}
    <span className={THEME_TOGGLE_LABEL_CLASS}>{themeToggleLabel(theme)}</span>
  </button>
}

export default ThemeToggle
