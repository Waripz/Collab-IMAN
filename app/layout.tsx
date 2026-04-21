import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "IMAN Collab",
  description: "Track your product performance on Shopify — Iman Shoppe Bookstore",
  icons: {
    icon: "/icon.png",
    apple: "/icon.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
