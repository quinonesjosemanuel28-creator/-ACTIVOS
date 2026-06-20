/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    // Formatos modernos para mejor performance (P2).
    formats: ['image/avif', 'image/webp'],
  },
};

export default nextConfig;
