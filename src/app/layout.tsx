import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Homebase AI project tracker",
  description:
    "Milestones, owners, and signup impact for the Homebase AI team's Linear projects.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
