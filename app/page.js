import SBTPintarDemo from "../SBTPintarDemo";

export default function Page() {
  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      <div
        style={{
          flexShrink: 0,
          background: "#4C7A4A",
          color: "#fff",
          textAlign: "center",
          fontSize: 12.5,
          padding: "6px 10px",
          fontFamily: "sans-serif",
        }}
      >
        🚧 Demo tampilan — aplikasi sedang dibangun, data yang ditampilkan masih contoh
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
        <SBTPintarDemo />
      </div>
    </div>
  );
}
