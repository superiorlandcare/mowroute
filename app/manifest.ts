import type { MetadataRoute } from "next";

// PWA web app manifest (spec §14.5, §16): installable, standalone, brand theme.
// Served by Next at /manifest.webmanifest.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MowRoute",
    short_name: "MowRoute",
    description: "Route + billing for the crew.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f5f5f4", // stone-100
    theme_color: "#16a34a", // green-600
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
