import "./globals.css";
import { AuthProvider } from './AuthContext';

export const metadata = {
  title: "GigaChad — Insurer Dashboard",
  description: "AI-Powered Parametric Micro-Insurance for Chennai Q-Commerce Riders",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
        <link rel="icon" href="/logo.png" />
      </head>
      <body className="antialiased bg-background text-white font-body selection:bg-primary/30">
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
