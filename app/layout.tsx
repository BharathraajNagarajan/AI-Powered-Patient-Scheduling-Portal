import type { Metadata } from "next";
import { officeInfo, PRODUCT_NAME } from "@/lib/office-info";
import "./globals.css";

export const metadata: Metadata = {
  title: `${PRODUCT_NAME} | ${officeInfo.name}`,
  description: `Schedule appointments with ${officeInfo.name} using an AI-powered patient scheduling portal.`,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="accent-bar" />
        <div className="relative z-10 min-h-screen">{children}</div>
      </body>
    </html>
  );
}
