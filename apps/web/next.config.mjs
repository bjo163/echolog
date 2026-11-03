const nextConfig = {
  transpilePackages: ['@echolog/ui', '@echolog/shared', '@echolog/contract'],
  async rewrites() {
    return [
      { source: '/api/:path*', destination: 'http://127.0.0.1:3006/api/:path*' },
      { source: '/health/:path*', destination: 'http://127.0.0.1:3006/health/:path*' },
    ]
  },
}
export default nextConfig