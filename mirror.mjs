import axios from 'axios';
import fs from 'node:fs';
import { pathToFileURL } from 'url';
import Feeds from './feeds.json' with { type: "json" };

let feeds = Feeds;
let axiosConfig = {
    headers: {
        'User-Agent': 'fuelaround.me/builder'
    },
    timeout: 10000, // Increased timeout for reliability
    validateStatus: function (status) {
        return status >= 200 && status < 300;
    }
}

const RETRY_ATTEMPTS = 3;
const RETRY_DELAY = 2000; // 2 seconds
const MAX_CONCURRENT = 5; // Limit concurrent downloads

// Download statistics
let stats = {
    total: 0,
    success: 0,
    failed: 0,
    retries: 0,
    startTime: null,
    endTime: null
};

// Sleep function for retry delays
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Validate downloaded data structure
function validateFeedData(data, feedName) {
    if (!data || typeof data !== 'object') {
        throw new Error('Invalid data format: not an object');
    }
    
    if (!data.stations || !Array.isArray(data.stations)) {
        throw new Error('Invalid data format: missing or invalid stations array');
    }
    
    if (data.stations.length === 0) {
        throw new Error('No stations found in feed data');
    }
    
    // Basic station validation
    const invalidStations = data.stations.filter(station => 
        !station.site_id || !station.brand || !station.prices
    ).length;
    
    if (invalidStations > data.stations.length * 0.5) {
        throw new Error(`Too many invalid stations: ${invalidStations}/${data.stations.length}`);
    }
    
    console.log(`✓ ${feedName}: ${data.stations.length} stations validated`);
    return true;
}

// Download single feed with retry logic
async function downloadFeed(feedName, url, attempt = 1) {
    try {
        console.log(`[${attempt}/${RETRY_ATTEMPTS}] Downloading ${feedName}...`);
        
        const response = await axios.get(url, axiosConfig);
        
        // Validate response data
        validateFeedData(response.data, feedName);
        
        // Write data to file
        const filename = `data/${feedName}.json`;
        fs.writeFileSync(filename, JSON.stringify(response.data, null, 2));
        
        // Verify file was written correctly
        const fileSize = fs.statSync(filename).size;
        if (fileSize < 100) {
            throw new Error('Written file is too small, possibly corrupted');
        }
        
        console.log(`✓ ${feedName}: ${fileSize} bytes written successfully`);
        stats.success++;
        return true;
        
    } catch (error) {
        console.log(`✗ ${feedName} (attempt ${attempt}): ${error.message}`);
        
        if (attempt < RETRY_ATTEMPTS) {
            stats.retries++;
            console.log(`⏳ Retrying ${feedName} in ${RETRY_DELAY/1000}s...`);
            await sleep(RETRY_DELAY * attempt); // Exponential backoff
            return downloadFeed(feedName, url, attempt + 1);
        } else {
            console.log(`❌ ${feedName}: Failed after ${RETRY_ATTEMPTS} attempts`);
            stats.failed++;
            return false;
        }
    }
}

// Process feeds in controlled batches
async function processBatch(feedEntries) {
    const promises = feedEntries.map(([feedName, url]) => 
        downloadFeed(feedName, url)
    );
    
    return Promise.allSettled(promises);
}

// Main download function with improved error handling and monitoring
async function downloadLists() {
    stats.startTime = new Date();
    stats.total = Object.keys(feeds).length;
    
    console.log(`🚀 Starting download of ${stats.total} feeds...\n`);
    
    // Ensure data directory exists
    if (!fs.existsSync('data')) {
        fs.mkdirSync('data', { recursive: true });
        console.log('📁 Created data directory');
    }
    
    // Process feeds in batches to avoid overwhelming servers
    const feedEntries = Object.entries(feeds);
    const batches = [];
    
    for (let i = 0; i < feedEntries.length; i += MAX_CONCURRENT) {
        batches.push(feedEntries.slice(i, i + MAX_CONCURRENT));
    }
    
    // Process each batch
    for (let i = 0; i < batches.length; i++) {
        console.log(`\n📦 Processing batch ${i + 1}/${batches.length}...`);
        await processBatch(batches[i]);
        
        // Small delay between batches
        if (i < batches.length - 1) {
            await sleep(1000);
        }
    }
    
    stats.endTime = new Date();
    const duration = (stats.endTime - stats.startTime) / 1000;
    
    console.log(`\n📊 Download Summary:`);
    console.log(`   Total feeds: ${stats.total}`);
    console.log(`   ✅ Successful: ${stats.success}`);
    console.log(`   ❌ Failed: ${stats.failed}`);
    console.log(`   🔄 Retries: ${stats.retries}`);
    console.log(`   ⏱️  Duration: ${duration.toFixed(1)}s`);
    console.log(`   📈 Success rate: ${((stats.success / stats.total) * 100).toFixed(1)}%`);
    
    if (stats.failed > 0) {
        console.log(`\n⚠️  ${stats.failed} feeds failed to download. Check logs above for details.`);
        process.exit(1);
    } else {
        console.log(`\n🎉 All feeds downloaded successfully!`);
    }
}

// Export functions for testing
export { downloadLists, downloadFeed, validateFeedData };

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    try {
        await downloadLists();
    } catch (error) {
        console.error('❌ Mirror script failed:', error.message);
        process.exit(1);
    }
}
