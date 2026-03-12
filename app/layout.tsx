import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Todo App - Core Feature 1",
  description:
    "CRUD todo app with Singapore timezone and optimistic UI updates.",
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
