import { ImageResponse } from "next/og";
export const size = { width: 64, height: 64 };
export const contentType = "image/png";
export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        width: 64,
        height: 64,
        background: "#426c48",
        color: "white",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 43,
        fontWeight: 800,
        borderRadius: 12,
      }}
    >
      W
    </div>,
    { ...size },
  );
}
