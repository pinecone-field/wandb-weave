module.exports = {
  async rewrites() {
    return [
      {
        source: '/cgi-bin/:path*',
        destination: 'http://127.0.0.1:5328/cgi-bin/:path*', // Proxy to Flask
      },
    ]
  },
} 