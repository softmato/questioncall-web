import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdfkit"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
        pathname: "/**",
      },
    ],
  },
  allowedDevOrigins: ['http://[IP_ADDRESS]', 'http://[IP_ADDRESS]', 'http://192.168.1.69'],
  // The installable app (PWA) is the QuestionCall phone app exported for the
  // browser into public/app. It is one page: every /app route is its
  // index.html, whose router reads the path. Returned as afterFiles, so the
  // app's own files are still served as files and [username] never sees /app.
  async rewrites() {
    return [{ source: "/app/:path*", destination: "/app/index.html" }];
  },
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.questioncall.com" }],
        destination: "https://questioncall.com/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;