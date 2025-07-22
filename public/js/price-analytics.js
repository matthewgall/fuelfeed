/**
 * Price Analytics Module for FuelFeed
 * Displays average prices, statistics, and trends on the map
 */

class PriceAnalytics {
    constructor() {
        this.priceData = new Map();
        this.regionalStats = new Map();
        this.overlayVisible = false;
        this.currentZoomLevel = 6;
        this.updateInterval = null;
        this.map = null;
        
        // Lucide icon mappings (using kebab-case names)
        this.icons = {
            chart: 'chart-bar',
            thermometer: 'thermometer',
            fuel: 'fuel', 
            truck: 'truck',
            diamond: 'gem',
            star: 'star',
            warning: 'alert-triangle',
            target: 'target',
            money: 'pound-sterling',
            trophy: 'trophy',
            search: 'search',
            bulb: 'lightbulb',
            trendUp: 'trending-up',
            trendDown: 'trending-down',
            trendFlat: 'minus'
        };
    }

    /**
     * Get Lucide icon HTML
     */
    getIcon(key, size = 16) {
        const iconName = this.icons[key];
        if (!iconName) return '';
        
        // Check if Lucide is available and has the icon
        if (typeof lucide !== 'undefined' && lucide.icons && lucide.icons[iconName]) {
            try {
                // Use the proper Lucide API
                const iconHtml = lucide.icons[iconName].toSvg({
                    width: size,
                    height: size,
                    'stroke-width': 2
                });
                return iconHtml;
            } catch (e) {
                console.warn(`Failed to create Lucide icon: ${iconName}`, e);
            }
        }
        
        // Fallback to emojis
        const fallbacks = {
            chart: '📊',
            thermometer: '🌡️',
            fuel: '⛽',
            truck: '🚛',
            diamond: '💎',
            star: '⭐',
            warning: '⚠️',
            target: '🎯',
            money: '💰',
            trophy: '🏆',
            search: '🔍',
            bulb: '💡',
            trendUp: '📈',
            trendDown: '📉',
            trendFlat: '➡️'
        };
        return fallbacks[key] || '•';
    }

    /**
     * Create icon element for buttons
     */
    createIconElement(key, size = 20) {
        const iconName = this.icons[key];
        if (!iconName) return null;
        
        const container = document.createElement('span');
        container.style.display = 'flex';
        container.style.alignItems = 'center';
        container.style.justifyContent = 'center';
        
        // Check if Lucide is available and has the icon
        if (typeof lucide !== 'undefined' && lucide.icons && lucide.icons[iconName]) {
            try {
                // Use the proper Lucide API to create SVG string
                const iconHtml = lucide.icons[iconName].toSvg({
                    width: size,
                    height: size,
                    'stroke-width': 2
                });
                container.innerHTML = iconHtml;
                return container;
            } catch (e) {
                console.warn(`Failed to create Lucide icon element: ${iconName}`, e);
            }
        }
        
        // Fallback to emoji
        container.innerHTML = this.getIcon(key, size);
        container.style.fontSize = `${size}px`;
        return container;
    }

    /**
     * Calculate statistics from station data
     */
    calculateStatistics(stations) {
        if (!stations || !stations.features) return null;

        const stats = {
            unleaded: { prices: [], avg: 0, min: 0, max: 0, count: 0 },
            diesel: { prices: [], avg: 0, min: 0, max: 0, count: 0 },
            superUnleaded: { prices: [], avg: 0, min: 0, max: 0, count: 0 },
            all: { prices: [], avg: 0, min: 0, max: 0, count: 0, stationCount: 0 }
        };

        let totalStations = 0;
        
        stations.features.forEach(station => {
            if (!station.properties || !station.properties.prices) return;
            
            totalStations++;
            const prices = station.properties.prices;
            
            // Process unleaded variants (E10, unleaded, petrol)
            const unleadedPrice = this.getBestPrice(prices, ['E10', 'unleaded', 'petrol', 'gasoline']);
            if (unleadedPrice > 0) {
                stats.unleaded.prices.push(unleadedPrice);
                stats.all.prices.push(unleadedPrice);
            }
            
            // Process diesel variants (B7, diesel)
            const dieselPrice = this.getBestPrice(prices, ['B7', 'diesel', 'gasoil']);
            if (dieselPrice > 0) {
                stats.diesel.prices.push(dieselPrice);
                stats.all.prices.push(dieselPrice);
            }
            
            // Process super unleaded variants (E5, super unleaded)
            const superPrice = this.getBestPrice(prices, ['E5', 'super unleaded', 'premium unleaded', 'v-power unleaded']);
            if (superPrice > 0) {
                stats.superUnleaded.prices.push(superPrice);
                stats.all.prices.push(superPrice);
            }
        });

        // Calculate statistics for each fuel type
        Object.keys(stats).forEach(fuelType => {
            const fuelStats = stats[fuelType];
            if (fuelStats.prices.length > 0) {
                fuelStats.avg = this.calculateAverage(fuelStats.prices);
                fuelStats.min = Math.min(...fuelStats.prices);
                fuelStats.max = Math.max(...fuelStats.prices);
                fuelStats.count = fuelStats.prices.length;
            }
        });

        stats.all.stationCount = totalStations;
        
        return stats;
    }

    /**
     * Get the best (lowest) price from a list of fuel type variants
     */
    getBestPrice(prices, fuelTypes) {
        let bestPrice = Infinity;
        let found = false;
        
        fuelTypes.forEach(fuelType => {
            Object.keys(prices).forEach(key => {
                if (key.toLowerCase().includes(fuelType.toLowerCase())) {
                    const price = parseFloat(prices[key]);
                    if (!isNaN(price) && price > 0 && price < bestPrice) {
                        bestPrice = price;
                        found = true;
                    }
                }
            });
        });
        
        return found ? bestPrice : 0;
    }

    /**
     * Calculate average from array of numbers
     */
    calculateAverage(numbers) {
        if (!numbers || numbers.length === 0) return 0;
        const sum = numbers.reduce((total, num) => total + num, 0);
        return Math.round((sum / numbers.length) * 100) / 100; // Round to 2 decimal places
    }

    /**
     * Calculate regional statistics based on bounding box
     */
    calculateRegionalStats(stations, bounds) {
        const regionKey = `${bounds.west.toFixed(2)}_${bounds.south.toFixed(2)}_${bounds.east.toFixed(2)}_${bounds.north.toFixed(2)}`;
        
        // Check if we already have stats for this region
        if (this.regionalStats.has(regionKey)) {
            return this.regionalStats.get(regionKey);
        }

        const stats = this.calculateStatistics(stations);
        if (stats) {
            stats.bounds = bounds;
            stats.timestamp = Date.now();
            this.regionalStats.set(regionKey, stats);
        }

        return stats;
    }

    /**
     * Create and display price statistics overlay
     */
    createStatsOverlay(map, stats) {
        if (!stats || stats.all.stationCount === 0) return;

        const overlayDiv = document.getElementById('price-stats-overlay') || this.createOverlayElement();
        
        // Get regional comparison data
        const regionComparison = this.getRegionalComparison(stats);
        const zoomLevel = map.getZoom();
        const regionType = this.getRegionType(zoomLevel);
        
        const html = `
            <div class="stats-header">
                <h3>${this.getIcon('chart')} ${regionType} Price Statistics</h3>
                <span class="station-count">${stats.all.stationCount} stations</span>
            </div>
            <div class="stats-grid">
                ${this.createFuelStatsHTML(`${this.getIcon('fuel')} Unleaded`, stats.unleaded, 'unleaded')}
                ${this.createFuelStatsHTML(`${this.getIcon('truck')} Diesel`, stats.diesel, 'diesel')}
                ${this.createFuelStatsHTML(`${this.getIcon('diamond')} Super`, stats.superUnleaded, 'super')}
            </div>
            <div class="stats-summary">
                <div class="summary-item">
                    <span class="label">Overall Average:</span>
                    <span class="value">£${stats.all.avg}</span>
                </div>
                <div class="summary-item">
                    <span class="label">Price Range:</span>
                    <span class="value">£${stats.all.min} - £${stats.all.max}</span>
                </div>
                ${regionComparison ? this.createRegionalComparisonHTML(regionComparison) : ''}
            </div>
            ${this.createPriceTrendsHTML(stats)}
        `;

        overlayDiv.innerHTML = html;
        overlayDiv.style.display = 'block';
    }

    /**
     * Create HTML for individual fuel type statistics
     */
    createFuelStatsHTML(title, fuelStats, type) {
        if (fuelStats.count === 0) {
            return `
                <div class="fuel-stat ${type}">
                    <div class="fuel-title">${title}</div>
                    <div class="no-data">No data</div>
                </div>
            `;
        }

        const spread = fuelStats.max - fuelStats.min;
        const spreadClass = spread > 0.10 ? 'high-spread' : spread > 0.05 ? 'medium-spread' : 'low-spread';

        return `
            <div class="fuel-stat ${type}">
                <div class="fuel-title">${title}</div>
                <div class="fuel-avg">£${fuelStats.avg}</div>
                <div class="fuel-range ${spreadClass}">
                    <span class="min">£${fuelStats.min}</span>
                    <span class="separator">-</span>
                    <span class="max">£${fuelStats.max}</span>
                </div>
                <div class="fuel-count">${fuelStats.count} stations</div>
            </div>
        `;
    }

    /**
     * Create the overlay DOM element
     */
    createOverlayElement() {
        const overlay = document.createElement('div');
        overlay.id = 'price-stats-overlay';
        overlay.className = 'price-stats-overlay';
        overlay.style.cssText = `
            position: fixed;
            bottom: 80px;
            left: 20px;
            background: rgba(255, 255, 255, 0.95);
            backdrop-filter: blur(10px);
            border-radius: 12px;
            padding: 16px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: 14px;
            max-width: 300px;
            min-width: 250px;
            z-index: 1000;
            display: none;
            border: 1px solid rgba(255, 255, 255, 0.3);
        `;

        // Add CSS styles
        const style = document.createElement('style');
        style.textContent = `
            .price-stats-overlay .stats-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 12px;
                border-bottom: 1px solid rgba(0, 0, 0, 0.1);
                padding-bottom: 8px;
            }
            .price-stats-overlay h3 {
                margin: 0;
                font-size: 16px;
                color: #2c3e50;
                font-weight: 600;
            }
            .price-stats-overlay .station-count {
                font-size: 12px;
                color: #7f8c8d;
                background: rgba(52, 152, 219, 0.1);
                padding: 2px 8px;
                border-radius: 12px;
            }
            .price-stats-overlay .stats-grid {
                display: grid;
                gap: 8px;
                margin-bottom: 12px;
            }
            .price-stats-overlay .fuel-stat {
                background: rgba(255, 255, 255, 0.7);
                border-radius: 8px;
                padding: 10px;
                border-left: 4px solid #3498db;
            }
            .price-stats-overlay .fuel-stat.diesel {
                border-left-color: #e74c3c;
            }
            .price-stats-overlay .fuel-stat.super {
                border-left-color: #f39c12;
            }
            .price-stats-overlay .fuel-title {
                font-weight: 600;
                color: #2c3e50;
                margin-bottom: 4px;
            }
            .price-stats-overlay .fuel-avg {
                font-size: 18px;
                font-weight: 700;
                color: #27ae60;
                margin-bottom: 4px;
            }
            .price-stats-overlay .fuel-range {
                font-size: 12px;
                color: #7f8c8d;
                margin-bottom: 4px;
            }
            .price-stats-overlay .fuel-range.high-spread {
                color: #e74c3c;
            }
            .price-stats-overlay .fuel-range.medium-spread {
                color: #f39c12;
            }
            .price-stats-overlay .fuel-range.low-spread {
                color: #27ae60;
            }
            .price-stats-overlay .fuel-count {
                font-size: 11px;
                color: #95a5a6;
            }
            .price-stats-overlay .no-data {
                color: #bdc3c7;
                font-style: italic;
                text-align: center;
                padding: 8px 0;
            }
            .price-stats-overlay .stats-summary {
                border-top: 1px solid rgba(0, 0, 0, 0.1);
                padding-top: 8px;
            }
            .price-stats-overlay .summary-item {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 4px;
            }
            .price-stats-overlay .summary-item:last-child {
                margin-bottom: 0;
            }
            .price-stats-overlay .summary-item .label {
                font-size: 12px;
                color: #7f8c8d;
            }
            .price-stats-overlay .summary-item .value {
                font-weight: 600;
                color: #2c3e50;
            }
            .price-stats-overlay .price-insights {
                margin-top: 12px;
                padding-top: 12px;
                border-top: 1px solid rgba(0, 0, 0, 0.1);
            }
            .price-stats-overlay .price-insights h4 {
                margin: 0 0 8px 0;
                font-size: 14px;
                color: #2c3e50;
                font-weight: 600;
            }
            .price-stats-overlay .insights-list {
                display: grid;
                gap: 6px;
            }
            .price-stats-overlay .insight-item {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 6px 8px;
                background: rgba(52, 152, 219, 0.08);
                border-radius: 6px;
                font-size: 12px;
            }
            .price-stats-overlay .insight-icon {
                font-size: 14px;
                flex-shrink: 0;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                font-weight: 600;
                min-width: 20px;
                text-align: center;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            .price-stats-overlay .insight-icon svg {
                width: 14px;
                height: 14px;
                stroke: currentColor;
                stroke-width: 2;
            }
            .price-stats-overlay .insight-text {
                color: #34495e;
                line-height: 1.3;
            }
            .price-stats-overlay .regional-comparison .value {
                display: flex;
                align-items: center;
                gap: 4px;
                font-size: 13px;
            }
            
            /* Mobile responsive */
            @media (max-width: 768px) {
                .price-stats-overlay {
                    position: fixed !important;
                    bottom: 80px !important;
                    left: 10px !important;
                    right: 10px !important;
                    max-width: none !important;
                    min-width: 0 !important;
                    width: auto !important;
                    font-size: 13px;
                    padding: 12px;
                    transform: none !important;
                    z-index: 1001 !important;
                }
                .price-stats-overlay .stats-header h3 {
                    font-size: 14px;
                }
                .price-stats-overlay .fuel-avg {
                    font-size: 16px;
                }
                .price-stats-overlay .insight-item {
                    font-size: 11px;
                    padding: 6px 8px;
                    min-height: 32px;
                    display: flex;
                    align-items: center;
                }
                .price-stats-overlay .insight-icon {
                    font-size: 14px;
                    min-width: 20px;
                }
                .price-stats-overlay .summary-item {
                    margin-bottom: 6px;
                    min-height: 24px;
                    display: flex;
                    align-items: center;
                }
                .price-stats-overlay .fuel-stat {
                    padding: 12px;
                    margin-bottom: 8px;
                }
                #stats-toggle-button {
                    position: fixed !important;
                    bottom: 15px !important;
                    left: 15px !important;
                    width: 48px !important;
                    height: 48px !important;
                    font-size: 20px !important;
                    min-width: 48px !important;
                    min-height: 48px !important;
                    z-index: 1000 !important;
                }
                #heatmap-toggle-button {
                    position: fixed !important;
                    bottom: 15px !important;
                    left: 70px !important;
                    width: 48px !important;
                    height: 48px !important;
                    font-size: 18px !important;
                    min-width: 48px !important;
                    min-height: 48px !important;
                    z-index: 1000 !important;
                }
            }
            
            /* Extra small mobile devices */
            @media (max-width: 480px) {
                .price-stats-overlay {
                    bottom: 70px !important;
                    left: 5px !important;
                    right: 5px !important;
                    padding: 10px;
                    font-size: 12px;
                    max-height: 70vh !important;
                    overflow-y: auto !important;
                }
                .price-stats-overlay .stats-header h3 {
                    font-size: 13px;
                }
                .price-stats-overlay .fuel-avg {
                    font-size: 15px;
                }
                .price-stats-overlay .insight-item {
                    font-size: 10px;
                    padding: 4px 6px;
                    min-height: 28px;
                }
                .price-stats-overlay .insight-icon {
                    font-size: 12px;
                    min-width: 18px;
                }
                .price-stats-overlay .fuel-stat {
                    padding: 8px;
                    margin-bottom: 6px;
                }
                #stats-toggle-button {
                    bottom: 10px !important;
                    left: 10px !important;
                    width: 44px !important;
                    height: 44px !important;
                    font-size: 18px !important;
                    min-width: 44px !important;
                    min-height: 44px !important;
                }
                #heatmap-toggle-button {
                    bottom: 10px !important;
                    left: 60px !important;
                    width: 44px !important;
                    height: 44px !important;
                    font-size: 16px !important;
                    min-width: 44px !important;
                    min-height: 44px !important;
                }
            }
            
            /* Landscape orientation on mobile */
            @media (max-width: 896px) and (orientation: landscape) {
                .price-stats-overlay {
                    bottom: 60px !important;
                    max-height: 60vh !important;
                    overflow-y: auto !important;
                }
                #stats-toggle-button {
                    bottom: 10px !important;
                }
                #heatmap-toggle-button {
                    bottom: 10px !important;
                }
            }
            
            /* Icon styling */
            #stats-toggle-button svg,
            #heatmap-toggle-button svg {
                stroke: currentColor;
                stroke-width: 2;
                fill: none;
            }
        `;
        
        if (!document.getElementById('price-analytics-styles')) {
            style.id = 'price-analytics-styles';
            document.head.appendChild(style);
        }

        document.body.appendChild(overlay);
        return overlay;
    }

    /**
     * Toggle the statistics overlay visibility
     */
    toggleOverlay() {
        console.log('📊 toggleOverlay called, current state:', this.overlayVisible);
        this.overlayVisible = !this.overlayVisible;
        let overlay = document.getElementById('price-stats-overlay');
        
        if (this.overlayVisible) {
            console.log('📊 Showing overlay, existing overlay:', !!overlay);
            // Show overlay - create it if it doesn't exist
            if (!overlay) {
                // Try to get current station data to show stats
                if (window.lastStationData) {
                    console.log('📊 Using lastStationData with', window.lastStationData.features?.length || 0, 'stations');
                    this.updateStatistics(window.lastStationData);
                } else {
                    console.log('📊 No station data, creating empty overlay');
                    // Create empty overlay with message
                    this.createEmptyOverlay();
                }
                overlay = document.getElementById('price-stats-overlay');
            }
            if (overlay) {
                overlay.style.display = 'block';
            }
        } else {
            // Hide overlay
            if (overlay) {
                overlay.style.display = 'none';
            }
        }
        
        return this.overlayVisible;
    }

    /**
     * Create empty overlay when no data is available
     */
    createEmptyOverlay() {
        console.log('📊 Creating empty overlay');
        const overlay = document.createElement('div');
        overlay.id = 'price-stats-overlay';
        overlay.className = 'price-stats-overlay';
        overlay.style.display = 'block';
        overlay.innerHTML = `
            <div class="stats-header">
                <h3>${this.getIcon('chart')} Price Statistics</h3>
            </div>
            <div style="text-align: center; padding: 20px; color: #666;">
                <p>Move the map to view stations and generate price statistics.</p>
                <p style="font-size: 12px; margin-top: 10px;">Statistics will appear automatically when fuel stations are loaded.</p>
            </div>
        `;
        document.body.appendChild(overlay);
        console.log('📊 Empty overlay created and added to body');
    }

    /**
     * Generate bounds from station data when bounds are not provided
     */
    generateBoundsFromStations(stations) {
        if (!stations || !stations.features || stations.features.length === 0) {
            // Default to UK bounds if no stations
            return {
                west: -8.0,
                south: 49.5,
                east: 2.0,
                north: 59.0
            };
        }

        let minLng = Infinity, minLat = Infinity;
        let maxLng = -Infinity, maxLat = -Infinity;

        stations.features.forEach(station => {
            if (station.geometry && station.geometry.coordinates) {
                const [lng, lat] = station.geometry.coordinates;
                minLng = Math.min(minLng, lng);
                maxLng = Math.max(maxLng, lng);
                minLat = Math.min(minLat, lat);
                maxLat = Math.max(maxLat, lat);
            }
        });

        // Add small padding to bounds
        const padding = 0.01;
        return {
            west: minLng - padding,
            south: minLat - padding,
            east: maxLng + padding,
            north: maxLat + padding
        };
    }

    /**
     * Update statistics when map data changes
     */
    updateStatistics(stations, bounds = null) {
        if (!stations) return;

        // Generate bounds if not provided
        if (!bounds) {
            bounds = this.generateBoundsFromStations(stations);
        }

        const stats = this.calculateRegionalStats(stations, bounds);
        if (stats) {
            this.createStatsOverlay(this.map, stats);
        }
    }

    /**
     * Create toggle button for stats overlay
     */
    createToggleButton(map) {
        const button = document.createElement('button');
        button.id = 'stats-toggle-button';
        const iconElement = this.createIconElement('chart', 20);
        if (iconElement) {
            button.appendChild(iconElement);
        } else {
            button.innerHTML = this.getIcon('chart', 20);
        }
        button.title = 'Toggle Price Statistics';
        button.style.cssText = `
            position: fixed;
            bottom: 20px;
            left: 20px;
            width: 44px;
            height: 44px;
            background: rgba(255, 255, 255, 0.9);
            border: none;
            border-radius: 8px;
            font-size: 20px;
            cursor: pointer;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
            z-index: 999;
            backdrop-filter: blur(10px);
            transition: all 0.2s ease;
            -webkit-tap-highlight-color: transparent;
            touch-action: manipulation;
            user-select: none;
            -webkit-user-select: none;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-weight: 600;
            line-height: 1;
            display: flex;
            align-items: center;
            justify-content: center;
        `;

        button.addEventListener('mouseenter', () => {
            button.style.background = 'rgba(255, 255, 255, 1)';
            button.style.transform = 'scale(1.05)';
        });

        button.addEventListener('mouseleave', () => {
            button.style.background = 'rgba(255, 255, 255, 0.9)';
            button.style.transform = 'scale(1)';
        });

        button.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('📊 Statistics button clicked, lastStationData available:', !!window.lastStationData);
            const isVisible = this.toggleOverlay();
            button.style.background = isVisible ? 'rgba(52, 152, 219, 0.9)' : 'rgba(255, 255, 255, 0.9)';
            button.style.color = isVisible ? 'white' : 'black';
        });

        // Add touch events for better mobile interaction
        button.addEventListener('touchstart', (e) => {
            e.preventDefault();
            button.style.background = 'rgba(255, 255, 255, 1)';
            button.style.transform = 'scale(1.05)';
        });

        button.addEventListener('touchend', (e) => {
            e.preventDefault();
            const isActive = this.overlayVisible;
            button.style.background = isActive ? 'rgba(52, 152, 219, 0.9)' : 'rgba(255, 255, 255, 0.9)';
            button.style.transform = 'scale(1)';
        });

        document.body.appendChild(button);
        return button;
    }

    /**
     * Get region type based on zoom level
     */
    getRegionType(zoomLevel) {
        if (zoomLevel <= 6) return 'National';
        if (zoomLevel <= 8) return 'Regional';
        if (zoomLevel <= 10) return 'Local Area';
        if (zoomLevel <= 12) return 'Neighborhood';
        return 'Local';
    }

    /**
     * Create regional comparison HTML
     */
    createRegionalComparisonHTML(comparison) {
        if (!comparison) return '';
        
        const trendIcon = comparison.trend > 0.02 ? this.getIcon('trendUp') : 
                         comparison.trend < -0.02 ? this.getIcon('trendDown') : this.getIcon('trendFlat');
        const trendColor = comparison.trend > 0.02 ? '#e74c3c' : 
                          comparison.trend < -0.02 ? '#27ae60' : '#95a5a6';
        
        return `
            <div class="summary-item regional-comparison">
                <span class="label">vs. UK Average:</span>
                <span class="value" style="color: ${trendColor}">
                    ${trendIcon} ${comparison.difference > 0 ? '+' : ''}£${Math.abs(comparison.difference).toFixed(3)}
                </span>
            </div>
        `;
    }

    /**
     * Get regional comparison data
     */
    getRegionalComparison(stats) {
        // UK average prices (these would ideally come from a national dataset)
        const ukAverages = {
            unleaded: 1.45,
            diesel: 1.52,
            superUnleaded: 1.58
        };
        
        if (stats.all.avg === 0) return null;
        
        const difference = stats.all.avg - ((ukAverages.unleaded + ukAverages.diesel) / 2);
        const trend = difference; // Simplified trend calculation
        
        return {
            difference: difference,
            trend: trend
        };
    }

    /**
     * Create price trends HTML
     */
    createPriceTrendsHTML(stats) {
        if (!stats || stats.all.stationCount < 5) return '';
        
        const insights = this.generatePriceInsights(stats);
        
        return `
            <div class="price-insights">
                <h4>${this.getIcon('bulb')} Price Insights</h4>
                <div class="insights-list">
                    ${insights.map(insight => `
                        <div class="insight-item">
                            <span class="insight-icon">${insight.icon}</span>
                            <span class="insight-text">${insight.text}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    /**
     * Generate price insights
     */
    generatePriceInsights(stats) {
        const insights = [];
        
        // Price spread analysis
        const spread = stats.all.max - stats.all.min;
        if (spread > 0.15) {
            insights.push({
                icon: this.getIcon('money'),
                text: `High price variation: Save up to £${(spread * 50).toFixed(0)} on 50L tank`
            });
        } else if (spread < 0.05) {
            insights.push({
                icon: this.getIcon('target'),
                text: 'Consistent pricing in this area'
            });
        }
        
        // Best fuel type analysis
        let bestFuel = 'unleaded';
        if (stats.diesel.count > 0 && stats.unleaded.count > 0) {
            const dieselRatio = stats.diesel.avg / stats.unleaded.avg;
            if (dieselRatio < 1.03) {
                insights.push({
                    icon: this.getIcon('truck'),
                    text: 'Diesel particularly competitive here'
                });
            }
        }
        
        // Station density
        if (stats.all.stationCount > 20) {
            insights.push({
                icon: this.getIcon('trophy'),
                text: `${stats.all.stationCount} stations - great choice available`
            });
        } else if (stats.all.stationCount < 5) {
            insights.push({
                icon: this.getIcon('search'),
                text: 'Limited options - consider wider search'
            });
        }
        
        // Price quality assessment
        if (stats.all.avg < 1.40) {
            insights.push({
                icon: this.getIcon('star'),
                text: 'Excellent prices in this area!'
            });
        } else if (stats.all.avg > 1.55) {
            insights.push({
                icon: this.getIcon('warning'),
                text: 'Above average prices - consider alternatives'
            });
        }
        
        return insights.slice(0, 3); // Limit to 3 insights
    }

    /**
     * Create price zone heatmap overlay
     */
    createPriceHeatmap(map, stations) {
        if (!stations || !stations.features || stations.features.length < 10) return;
        
        // Remove existing heatmap
        if (map.getSource('price-heatmap')) {
            map.removeLayer('price-heatmap-layer');
            map.removeSource('price-heatmap');
        }
        
        // Create grid of price zones
        const bounds = map.getBounds();
        const gridSize = 0.02; // Adjust based on zoom level
        const priceGrid = this.createPriceGrid(stations.features, bounds, gridSize);
        
        if (priceGrid.features.length === 0) return;
        
        // Add heatmap source
        map.addSource('price-heatmap', {
            type: 'geojson',
            data: priceGrid
        });
        
        // Add heatmap layer
        map.addLayer({
            id: 'price-heatmap-layer',
            type: 'fill',
            source: 'price-heatmap',
            layout: {},
            paint: {
                'fill-color': [
                    'interpolate',
                    ['linear'],
                    ['get', 'avgPrice'],
                    1.35, '#27ae60',
                    1.40, '#f1c40f',
                    1.45, '#e67e22',
                    1.50, '#e74c3c'
                ],
                'fill-opacity': 0.3
            }
        }, 'stations-layer'); // Add below stations layer
    }

    /**
     * Create price grid for heatmap
     */
    createPriceGrid(stations, bounds, gridSize) {
        const grid = new Map();
        
        stations.forEach(station => {
            if (!station.geometry || !station.properties || !station.properties.prices) return;
            
            const [lng, lat] = station.geometry.coordinates;
            const gridX = Math.floor(lng / gridSize);
            const gridY = Math.floor(lat / gridSize);
            const gridKey = `${gridX}_${gridY}`;
            
            // Get lowest price for this station
            const prices = Object.values(station.properties.prices);
            const validPrices = prices.filter(p => typeof p === 'number' && p > 0);
            
            if (validPrices.length === 0) return;
            
            const lowestPrice = Math.min(...validPrices);
            
            if (!grid.has(gridKey)) {
                grid.set(gridKey, {
                    prices: [],
                    bounds: {
                        west: gridX * gridSize,
                        south: gridY * gridSize,
                        east: (gridX + 1) * gridSize,
                        north: (gridY + 1) * gridSize
                    }
                });
            }
            
            grid.get(gridKey).prices.push(lowestPrice);
        });
        
        // Convert grid to GeoJSON
        const features = [];
        grid.forEach((data, key) => {
            if (data.prices.length < 2) return; // Need at least 2 stations for meaningful average
            
            const avgPrice = data.prices.reduce((sum, price) => sum + price, 0) / data.prices.length;
            
            features.push({
                type: 'Feature',
                geometry: {
                    type: 'Polygon',
                    coordinates: [[
                        [data.bounds.west, data.bounds.south],
                        [data.bounds.east, data.bounds.south],
                        [data.bounds.east, data.bounds.north],
                        [data.bounds.west, data.bounds.north],
                        [data.bounds.west, data.bounds.south]
                    ]]
                },
                properties: {
                    avgPrice: Math.round(avgPrice * 100) / 100,
                    stationCount: data.prices.length
                }
            });
        });
        
        return {
            type: 'FeatureCollection',
            features: features
        };
    }

    /**
     * Toggle price heatmap
     */
    toggleHeatmap(map) {
        if (map.getSource('price-heatmap')) {
            // Remove heatmap
            try {
                map.removeLayer('price-heatmap-layer');
                map.removeSource('price-heatmap');
                console.log('🌡️ Price heatmap hidden');
                return false;
            } catch (e) {
                console.warn('Error removing heatmap:', e);
                return false;
            }
        } else {
            // Add heatmap if we have data
            if (window.lastStationData && window.lastStationData.features && window.lastStationData.features.length > 0) {
                try {
                    this.createPriceHeatmap(map, window.lastStationData);
                    console.log('🌡️ Price heatmap shown');
                    return true;
                } catch (e) {
                    console.warn('Error creating heatmap:', e);
                    return false;
                }
            } else {
                // Show message if no data available
                this.showHeatmapMessage('Move the map to load fuel stations for heatmap visualization.');
                console.log('🌡️ No station data available for heatmap');
                return false;
            }
        }
    }

    /**
     * Show temporary message for heatmap status
     */
    showHeatmapMessage(message) {
        // Remove any existing message
        const existingMessage = document.getElementById('heatmap-message');
        if (existingMessage) {
            existingMessage.remove();
        }

        // Create temporary message overlay
        const messageDiv = document.createElement('div');
        messageDiv.id = 'heatmap-message';
        messageDiv.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 15px 20px;
            border-radius: 8px;
            font-size: 14px;
            z-index: 10000;
            max-width: 300px;
            text-align: center;
            backdrop-filter: blur(10px);
        `;
        messageDiv.textContent = message;
        
        document.body.appendChild(messageDiv);
        
        // Auto-remove after 3 seconds
        setTimeout(() => {
            if (messageDiv && messageDiv.parentNode) {
                messageDiv.remove();
            }
        }, 3000);
    }

    /**
     * Check if device is mobile
     */
    isMobileDevice() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || 
               window.innerWidth <= 768 ||
               ('ontouchstart' in window);
    }

    /**
     * Initialize price analytics
     */
    init(map) {
        // Store map reference
        this.map = map;
        
        // Add mobile-specific viewport meta tag if not present
        if (this.isMobileDevice() && !document.querySelector('meta[name="viewport"]')) {
            const viewport = document.createElement('meta');
            viewport.name = 'viewport';
            viewport.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no';
            document.head.appendChild(viewport);
        }

        this.createToggleButton(map);
        this.createHeatmapButton(map);
        
        // Auto-update stats when map moves (debounced)
        let updateTimeout;
        const debounceDelay = this.isMobileDevice() ? 1500 : 1000; // Longer delay on mobile
        
        map.on('moveend', () => {
            clearTimeout(updateTimeout);
            updateTimeout = setTimeout(() => {
                const bounds = map.getBounds();
                if (bounds) {
                    const boundsObj = {
                        west: bounds.getWest(),
                        south: bounds.getSouth(),
                        east: bounds.getEast(),
                        north: bounds.getNorth()
                    };
                    
                    // Trigger stats update if overlay is visible
                    if (this.overlayVisible && window.lastStationData) {
                        this.updateStatistics(window.lastStationData, boundsObj);
                    }
                    
                    // Update heatmap if visible
                    if (map.getSource('price-heatmap') && window.lastStationData) {
                        this.createPriceHeatmap(map, window.lastStationData);
                    }
                }
            }, debounceDelay);
        });

        // Add orientation change listener for mobile
        if (this.isMobileDevice()) {
            window.addEventListener('orientationchange', () => {
                setTimeout(() => {
                    const overlay = document.getElementById('price-stats-overlay');
                    if (overlay && this.overlayVisible) {
                        // Force layout recalculation
                        overlay.style.display = 'none';
                        setTimeout(() => {
                            overlay.style.display = 'block';
                        }, 100);
                    }
                }, 500);
            });
        }
        
        console.log('📊 Price Analytics initialized' + (this.isMobileDevice() ? ' (Mobile mode)' : ''));
    }

    /**
     * Create heatmap toggle button
     */
    createHeatmapButton(map) {
        const button = document.createElement('button');
        button.id = 'heatmap-toggle-button';
        const iconElement = this.createIconElement('thermometer', 18);
        if (iconElement) {
            button.appendChild(iconElement);
        } else {
            button.innerHTML = this.getIcon('thermometer', 18);
        }
        button.title = 'Toggle Price Heatmap';
        button.style.cssText = `
            position: fixed;
            bottom: 20px;
            left: 70px;
            width: 44px;
            height: 44px;
            background: rgba(255, 255, 255, 0.9);
            border: none;
            border-radius: 8px;
            font-size: 18px;
            cursor: pointer;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
            z-index: 999;
            backdrop-filter: blur(10px);
            transition: all 0.2s ease;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-weight: 600;
            line-height: 1;
            display: flex;
            align-items: center;
            justify-content: center;
        `;

        button.addEventListener('mouseenter', () => {
            button.style.background = 'rgba(255, 255, 255, 1)';
            button.style.transform = 'scale(1.05)';
        });

        button.addEventListener('mouseleave', () => {
            const isActive = map.getSource('price-heatmap');
            button.style.background = isActive ? 'rgba(241, 196, 15, 0.9)' : 'rgba(255, 255, 255, 0.9)';
            button.style.transform = 'scale(1)';
        });

        button.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('🌡️ Heatmap button clicked, lastStationData available:', !!window.lastStationData);
            const isVisible = this.toggleHeatmap(map);
            button.style.background = isVisible ? 'rgba(241, 196, 15, 0.9)' : 'rgba(255, 255, 255, 0.9)';
            button.style.color = isVisible ? 'white' : 'black';
        });

        // Add touch events for better mobile interaction
        button.addEventListener('touchstart', (e) => {
            e.preventDefault();
            button.style.background = 'rgba(255, 255, 255, 1)';
            button.style.transform = 'scale(1.05)';
        });

        button.addEventListener('touchend', (e) => {
            e.preventDefault();
            const isActive = map.getSource('price-heatmap');
            button.style.background = isActive ? 'rgba(241, 196, 15, 0.9)' : 'rgba(255, 255, 255, 0.9)';
            button.style.transform = 'scale(1)';
        });

        document.body.appendChild(button);
        return button;
    }
}

// Global instance
const priceAnalytics = new PriceAnalytics();

// Make it globally accessible
window.priceAnalytics = priceAnalytics;