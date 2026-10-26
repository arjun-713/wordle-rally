import { ImageResponse } from "next/og";
export const size = { width: 64, height: 64 };
export const contentType = "image/png";
export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        width: 64,
        height: 64,
        background: "#D8EE81",
        color: "#17211D",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 43,
        fontWeight: 800,
        borderRadius: 6,
      }}
    >
      W
    </div>,
    { ...size },
  );
}
