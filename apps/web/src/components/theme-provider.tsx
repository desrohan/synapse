"use client";

"use client";

import * as React from "react";

export function ThemeProvider({
  children,
  defaultTheme = "dark",
  ...props
}: any) {
  const [theme, setTheme] = React.useState(defaultTheme);

  React.useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(theme);
  }, [theme]);

  // We provide a basic context just in case components use it, but no script tags!
  return (
    <div data-theme={theme} style={{ display: 'contents' }} {...props}>
      {children}
    </div>
  );
}
