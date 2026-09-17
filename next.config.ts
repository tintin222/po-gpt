import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@prisma/client", "pdf-parse", "mammoth", "docx", "pptxgenjs", "exceljs"],
  experimental: {
    serverActions: {
      bodySizeLimit: "25mb",
    },
  },
  output: "standalone",
};

export default nextConfig;
