const nextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: process.cwd(),
  ...(process.env.NAMMA_STATIC_EXPORT === '1' ? { output: 'export' } : {})
};

export default nextConfig;
