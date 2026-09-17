export const metadata = {
  title: "SBT Pintar — Demo",
  description: "Demo tampilan SBT Pintar untuk warga Cluster Sindangbarang Terrace",
  manifest: "/manifest.json",
  themeColor: "#1F4D3D",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "SBT Pintar" },
  icons: { icon: ["/icon-192.png", "/icon-512.png"], apple: "/apple-touch-icon.png" },
};

export default function RootLayout({ children }) {
  return (
    <html lang="id" style={{ height: "100%" }}>
      <body style={{ margin: 0, height: "100%" }}>{children}</body>
    </html>
  );
}
