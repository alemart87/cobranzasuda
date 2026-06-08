/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  // La compresión gzip de Next bufferea las respuestas SSE (rompe el streaming
  // del agente). La desactivamos; el proxy de Render comprime el resto y respeta
  // `no-transform` en el stream del agente.
  compress: false,
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: process.env.BACKEND_URL
          ? `${process.env.BACKEND_URL}/api/:path*`
          : "http://localhost:8000/api/:path*",
      },
    ];
  },
};

module.exports = nextConfig;
