import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfkit ships its font metric files (Helvetica.afm, etc.) inside
  // node_modules. Next/Turbopack rewrites the package's __dirname during
  // bundling and the runtime can't find them. Marking the package external
  // makes the API route load it from node_modules at runtime instead.
  serverExternalPackages: ["pdfkit"],
};

export default nextConfig;
