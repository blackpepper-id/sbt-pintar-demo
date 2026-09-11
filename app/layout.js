export const metadata = {
  title: "SBT Pintar — Demo",
  description: "Demo tampilan SBT Pintar untuk warga Cluster Sindangbarang Terrace",
};

export default function RootLayout({ children }) {
  return (
    <html lang="id" style={{ height: "100%" }}>
      <body style={{ margin: 0, height: "100%" }}>{children}</body>
    </html>
  );
}
