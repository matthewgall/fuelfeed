# ⛽ FuelFeed

**A real-time UK fuel price aggregator and mapping service**

[![Deploy](https://img.shields.io/badge/deploy-Cloudflare%20Workers-orange)](https://fuelaround.me)
[![Version](https://img.shields.io/badge/version-2024.11.0-blue)](https://github.com/matthewgall/fuelfeed)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![MapTiler](https://img.shields.io/badge/MapTiler-v3.6.0-green)](https://www.maptiler.com/)

## 🌟 Features

- **🗺️ Interactive Map** - Explore fuel stations across the UK with real-time price data
- **💰 Best Price Highlighting** - Automatically identifies and highlights the cheapest fuel stations
- **📱 Mobile Optimized** - Responsive design with touch-friendly controls and performance optimizations
- **⚡ Lightning Fast** - Powered by Cloudflare Workers with intelligent caching
- **🔄 Real-time Updates** - Aggregates data from 15+ major UK fuel retailers every 30 minutes
- **🎯 Smart Filtering** - Fuel type categorization (Unleaded, Diesel, Premium) with color-coded pricing
- **🏆 Competitive Analysis** - Advanced algorithms for best price detection with tie-breaking logic
- **📍 Viewport Persistence** - Remembers your last viewed location and returns you there on reload

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- Cloudflare account with Workers access
- MapTiler account (for mapping services)

### Installation

```bash
# Clone the repository
git clone https://github.com/matthewgall/fuelfeed.git
cd fuelfeed

# Install dependencies
npm install

# Configure environment
cp wrangler.toml.example wrangler.toml
# Edit wrangler.toml with your Cloudflare settings

# Start development server
npm run dev
```

### Deployment

```bash
# Deploy to Cloudflare Workers
npm run deploy
```

## 🏗️ Architecture

FuelFeed is built on a modern serverless architecture:

### **Frontend**
- **Vanilla JavaScript** - Lightweight, fast-loading client
- **MapTiler SDK v3.6.0** - High-performance mapping with mobile optimization
- **Progressive Web App** - Installable with offline capabilities
- **Service Worker** - Background caching and performance optimization

### **Backend**
- **Cloudflare Workers** - Edge computing for global performance
- **TypeScript** - Type-safe backend development
- **Itty Router** - Lightweight HTTP routing
- **D1 Database** - Serverless SQL database for metadata
- **KV Storage** - Ultra-fast caching layer
- **R2 Storage** - Object storage for static assets

### **Data Pipeline**
- **Automated Mirroring** - Scheduled data collection from 15+ retailers
- **Price Normalization** - Standardized pricing across different data formats
- **Spatial Caching** - Tile-based geographic caching system
- **Smart Invalidation** - Dependency-based cache management

## 📊 Data Sources

FuelFeed aggregates data from major UK fuel retailers:

| Retailer | Coverage | Update Frequency |
|----------|----------|------------------|
| ASDA | Nationwide | Hourly |
| BP | Nationwide | Real-time |
| Esso | Nationwide | Hourly |
| Shell | Nationwide | Real-time |
| Tesco | Nationwide | Hourly |
| Morrisons | Nationwide | Hourly |
| Sainsbury's | Nationwide | Hourly |
| Jet | Regional | Hourly |
| Gulf | Regional | Hourly |
| Texaco | Regional | Hourly |
| +5 more | Various | Hourly |

## 🛠️ Development

### Project Structure

```
fuelfeed/
├── src/                    # Backend TypeScript source
│   ├── index.ts           # Main Worker entry point
│   ├── cache-manager.ts   # Intelligent caching system
│   ├── fuel-categorizer.ts # Fuel type classification
│   ├── price-normalizer.ts # Price standardization
│   └── fuel.ts           # Core fuel data processing
├── public/                # Frontend assets
│   ├── js/
│   │   ├── app.js        # Main application logic
│   │   ├── station-cache.js # Client-side caching
│   │   └── worker.js     # Service worker
│   └── index.html        # Main application page
├── test/                  # Test suite
├── mirror.mjs            # Data mirroring script
├── feeds.json            # Data source configuration
└── wrangler.toml         # Cloudflare Worker configuration
```

### Key Components

#### **Cache Management**
- **Spatial Tiling** - Geographic data divided into efficient tiles
- **LRU Eviction** - Intelligent memory management
- **Multi-level Caching** - Edge, KV, and browser caches
- **Compression** - Gzip compression for optimal transfer

#### **Fuel Categorization**
```typescript
// Automatic fuel type grouping
E5, E10 → Unleaded
B7 → Diesel
Super, V-Power → Premium
```

#### **Best Price Detection**
- **Three-pass algorithm** for accurate price comparison
- **Tie-breaking logic** using average fuel prices
- **Geographic clustering** for regional best prices

#### **Viewport Persistence**
- **Auto-save** - Saves map position after 1 second of inactivity
- **Validation** - Ensures coordinates are within UK bounds
- **Expiration** - Stored locations expire after 30 days
- **Fallback** - Graceful degradation to default UK view

### API Endpoints

```bash
# Get all fuel data
GET /api/data.json

# Get map-optimized data
GET /api/data.mapbox

# Get data for specific bounding box
GET /api/data.mapbox?bbox=west,south,east,north

# Get limited results for mobile
GET /api/data.mapbox?limit=300
```

### Testing

```bash
# Run test suite
npm run test

# Test specific components
node test/test-cache-performance.mjs
node test/test-normalizer.mjs
node test/test-mirror.mjs
```

### Debugging

```bash
# Browser console commands for viewport management
resetViewport()        # Clear saved location and reload
getViewportInfo()      # View stored vs current viewport
```

### Data Mirroring

```bash
# Manual data refresh
npm run mirror

# The system automatically runs every 30 minutes via Cloudflare Cron
```

## 📱 Mobile Optimization

FuelFeed includes extensive mobile optimizations:

- **Device Detection** - Automatic low-end device detection
- **Performance Limits** - Station limits: 100 (low-end), 300 (mobile), 1000 (desktop)
- **Simplified Rendering** - Reduced complexity for mobile GPUs
- **Touch Optimization** - Larger touch targets and gesture handling
- **Memory Management** - Aggressive cleanup and monitoring
- **Offline Support** - Service worker with strategic caching

## 🎨 Visual Design

- **Modern UI** - Clean, card-based design with subtle shadows
- **Color Coding** - Green (cheap), amber (moderate), red (expensive)
- **Best Price Highlighting** - Gold badges for lowest prices
- **Responsive Typography** - Optimized for all screen sizes
- **Accessibility** - High contrast and touch-friendly controls

## 🔧 Configuration

### Environment Variables

```bash
# Cache TTL settings (seconds)
FUEL_DATA_TTL=86400        # 24 hours
MAPBOX_DATA_TTL=43200      # 12 hours
BASE_DATA_TTL=3600         # 1 hour
```

### Worker Configuration

```toml
# wrangler.toml
[observability]
enabled = true

[[d1_databases]]
binding = "DB"
database_name = "fuelfeed-prod"

[[kv_namespaces]]
binding = "KV"
id = "your-kv-namespace-id"

[triggers]
crons = ["30 * * * *"]  # Every 30 minutes
```

## 📈 Performance

- **Edge Caching** - 95%+ cache hit rate
- **Global CDN** - Sub-100ms response times worldwide
- **Spatial Optimization** - Tile-based geographic queries
- **Mobile Performance** - <3s load time on 3G networks
- **Memory Efficiency** - <50MB RAM usage on mobile devices

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines

- Use TypeScript for backend code
- Follow existing code style and patterns
- Add tests for new functionality
- Update documentation for API changes
- Ensure mobile compatibility

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **MapTiler** - High-performance mapping platform
- **Cloudflare** - Global edge computing infrastructure
- **UK Fuel Retailers** - Open data provision
- **Open Source Community** - Tools and libraries

## 📞 Support

- **Website**: [fuelaround.me](https://fuelaround.me)
- **Issues**: [GitHub Issues](https://github.com/matthewgall/fuelfeed/issues)
- **Documentation**: [Wiki](https://github.com/matthewgall/fuelfeed/wiki)

---

**Built with ❤️ for UK drivers**
