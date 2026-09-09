import { Locator } from "./locator";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Locator />
      </body>
    </html>
  );
}
