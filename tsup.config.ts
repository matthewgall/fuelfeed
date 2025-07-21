import { defineConfig } from 'tsup';

export default defineConfig([
  // Main app bundle
  {
    entry: {
      app: 'src/frontend/main.ts'
    },
    outDir: 'public/js',
    format: ['iife'],
    target: 'es2020',
    platform: 'browser',
    minify: process.env.NODE_ENV === 'production',
    sourcemap: process.env.NODE_ENV === 'development',
    clean: true,
    globalName: 'FuelFeed',
    define: {
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
      'BUILD_TIMESTAMP': JSON.stringify(new Date().toISOString())
    },
    external: ['maptilersdk'], // MapTiler SDK is loaded externally
    esbuildOptions: (options) => {
      options.banner = {
        js: '// FuelFeed PWA - Built with TypeScript + tsup'
      };
    }
  },
  // Service Worker bundle  
  {
    entry: {
      worker: 'src/frontend/service-worker.ts'
    },
    outDir: 'public/js',
    format: ['iife'],
    target: 'es2020',
    platform: 'browser',
    minify: process.env.NODE_ENV === 'production',
    sourcemap: process.env.NODE_ENV === 'development',
    clean: false, // Don't clean since we're building multiple entries
    define: {
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
      'BUILD_TIMESTAMP': JSON.stringify(new Date().toISOString())
    },
    esbuildOptions: (options) => {
      options.banner = {
        js: '// FuelFeed Service Worker - Built with TypeScript + tsup'
      };
    }
  }
]);