import path from "node:path";
import type { NextConfig } from "next";

const config: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(import.meta.dirname, "../../"),
  transpilePackages: ["@chordsheet/api", "@chordsheet/db", "@chordsheet/music", "@chordsheet/realtime"],
  serverExternalPackages: ["playwright-core", "pg", "@prisma/adapter-pg"],
  typedRoutes: false,
};

export default config;
