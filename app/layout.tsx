import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kyron Medical | Patient Care Portal",
  description: "Schedule appointments and manage your care with Kyron Medical's AI-powered patient portal.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <div className="relative z-10 min-h-screen">
          {/* Top accent line */}
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            height: '3px',
            background: 'linear-gradient(90deg, #0891b2, #38bdf8, #06b6d4, #0891b2)',
            backgroundSize: '200% 100%',
            animation: 'shimmer 3s linear infinite',
            zIndex: 9999
          }} />
          {children}
        </div>
        <style>{`
          @keyframes shimmer {
            0% { background-position: 200% 0; }
            100% { background-position: -200% 0; }
          }
        `}</style>
      </body>
    </html>
  );
}