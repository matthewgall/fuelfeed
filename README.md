# ⛽ FuelFeed

**A real-time UK fuel price aggregator and mapping service**

[![Deploy](https://img.shields.io/badge/deploy-Cloudflare%20Workers-orange)](https://fuelaround.me)
[![Version](https://img.shields.io/badge/version-2024.11.0-blue)](https://github.com/matthewgall/fuelfeed)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![MapTiler](https://img.shields.io/badge/MapTiler-v3.6.0-green)](https://www.maptiler.com/)

## 🌟 Features

### Core Functionality
- **🗺️ Interactive Map** - Explore fuel stations across the UK with real-time price data
- **📍 Geolocation Support** - Automatically centers map on your location with one-tap positioning
- **🔗 Shareable Links** - URL state management for bookmarking and sharing specific map positions
- **💰 Best Price Highlighting** - Automatically identifies and highlights the cheapest fuel stations
- **🔄 Real-time Updates** - Aggregates data from 15+ major UK fuel retailers every 30 minutes

### Smart Pricing & Display
- **🎯 Consistent Fuel Ordering** - Standardized display: Unleaded → Diesel → Premium for easy comparison
- **🧠 Dynamic Price Analysis** - Market-based thresholds that adapt to current fuel price trends  
- **🏆 Competitive Analysis** - Advanced algorithms for best price detection with tie-breaking logic
- **🎨 Smart Filtering** - Fuel type categorization with color-coded pricing (green/amber/red)

### Performance & Experience
- **⚡ Lazy Loading** - Station details load on-demand for faster map performance
- **📱 Mobile Optimized** - Device-aware rendering with touch controls and performance limits
- **🌐 Offline Support** - Comprehensive offline functionality with cached fuel data and map tiles
- **💾 Smart Caching** - Multi-tier caching with popular region pre-warming
- **🔧 Viewport Persistence** - Remembers your last viewed location and returns you there on reload

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

Note: Fuel Finder API/CSV changes are tracked in the official release notes: https://www.developer.fuel-finder.service.gov.uk/release-notes

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
├── src/                           # Backend TypeScript source
│   ├── index.ts                  # Main Worker entry point & API routes
│   ├── cache-manager.ts          # Multi-tier caching with spatial tiling
│   ├── fuel-categorizer.ts       # Fuel type classification & ordering
│   ├── brand-standardizer.ts     # Brand name normalization
│   ├── popup-generator.ts        # Server-side popup HTML generation
│   ├── geographic-filter.ts      # Device-aware geographic optimization
│   ├── dynamic-pricing.ts        # Market-based price analysis
│   ├── cache-invalidator.ts      # Smart cache management
│   ├── constants.ts              # Configuration constants
│   └── fuel.ts                   # Core fuel data processing
├── public/                       # Frontend assets
│   ├── js/
│   │   └── app.js               # Complete application with geolocation & lazy loading
│   ├── css/
│   │   └── styles.css           # Responsive styling
│   ├── icons/                   # App icons for PWA
│   ├── manifest.json            # PWA manifest
│   ├── service-worker.js        # Offline functionality
│   └── index.html              # Main application page
├── test/                         # Test suite
├── mirror.mjs                    # Data mirroring script
├── feeds.json                    # Data source configuration
├── wrangler.toml                # Cloudflare Worker configuration
└── worker-configuration.d.ts    # TypeScript definitions
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

#### **Offline Functionality**
- **Intelligent Caching** - Multi-tier caching system with different TTL strategies
- **Fuel Data Cache** - 6-hour cache for fuel prices with geographic indexing
- **Map Tile Cache** - 30-day cache for MapTiler tiles with stale-while-revalidate
- **Background Sync** - Automatic data updates when network is restored
- **Offline Indicator** - Visual feedback for offline/cached data modes

### API Endpoints

```bash
# Get all fuel data (complete dataset)
GET /api/data.json

# Get map-optimized GeoJSON data
GET /api/data.mapbox

# Get data for specific bounding box with geographic filtering
GET /api/data.mapbox?bbox=west,south,east,north

# Get limited results for mobile devices
GET /api/data.mapbox?limit=300

# Get data with center point for proximity sorting
GET /api/data.mapbox?center=lng,lat

# Get individual station details (lazy loading)
GET /api/station/:stationId

# Get cache statistics and performance metrics
GET /api/cache/stats
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
# Browser console commands for location & viewport management
resetViewport()        # Clear saved location and reload
getViewportInfo()      # View stored vs current viewport
getCurrentLocation()   # Test geolocation functionality
clearLocationCache()   # Clear cached location data

# Station and cache management  
getCacheStatus()       # View cache statistics and storage usage
clearStationCache()    # Clear cached station details
refreshStations()      # Refresh station data for current view
clearFuelCache()       # Clear cached fuel data
forceFuelUpdate()      # Force background fuel data update

# URL state management
window.location.href = '?lat=51.5074&lng=-0.1278&zoom=12'  # Test shareable links
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
