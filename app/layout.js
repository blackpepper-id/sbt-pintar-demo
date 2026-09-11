export const metadata = {
  title: "SBT Pintar — Demo",
  description: "Demo tampilan SBT Pintar untuk warga Cluster Sindangbarang Terrace",
};

export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}
