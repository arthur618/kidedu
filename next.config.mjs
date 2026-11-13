/** @type {import('next').NextConfig} */
const nextConfig = {
  // Prisma 的查询引擎是原生模块，交给 Node 运行时直接加载。
  serverExternalPackages: ["@prisma/client"],
};

export default nextConfig;
