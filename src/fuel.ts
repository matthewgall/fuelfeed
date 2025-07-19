/// <reference path="../worker-configuration.d.ts" />
import Feeds from '../feeds.json'
import { PriceNormalizer } from './price-normalizer'

export default class Fuel {
    async getData(env) {
        let data: any = {}

        // Now we iterate through the feeds and download them all
        for (let f of Object.keys(Feeds)) {
            try {
                let d: any = null;

                // First, we check directly
                d = await fetch(Feeds[f], {
                    headers: {
                        'Accept': 'application/json',
                        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                    },
                    cf: {
                        cacheTtlByStatus: {
                            "200-299": 1800,
                            404: 1,
                            "500-599": 0
                        }
                    },
                })
                if (d.status == 200) { 
                    d = await d.json();
                }
                else {
                    // We got a weird response, so we fallback to R2
                    let r2: any = await env.R2.get(`${f}.json`)
                    if (r2 !== null) d = await r2.json();
                }
                
                // Validate required station data structure
                if (!d.stations || !Array.isArray(d.stations)) {
                    console.log(`Invalid stations data for ${f}`);
                    continue;
                }
                
                // Initialize brand data if needed
                if (!data[f]) {
                    data[f] = {};
                }

                // Now, we iterate for each station to get the prices
                for (let stn of d.stations) {
                    try {
                        // Validate required station fields
                        if (!stn.site_id || !stn.brand || !stn.prices) {
                            console.log(`Skipping station with missing required fields in ${f}`);
                            continue;
                        }

                        const normalizedPrices = PriceNormalizer.normalizePrices(stn.prices, stn.brand);
                        
                        // Only store station if we have valid prices
                        if (Object.keys(normalizedPrices).length > 0) {
                            data[f][stn.site_id] = {
                                'address': {
                                    'brand': stn.brand,
                                    'address': stn.address || '',
                                    'postcode': stn.postcode || ''
                                },
                                'location': stn.location || { latitude: 0, longitude: 0 },
                                'prices': normalizedPrices,
                                'updated': d.last_updated || new Date().toISOString()
                            };
                        } else {
                            console.log(`No valid prices for station ${stn.site_id} in ${f}`);
                        }
                    } catch (stationError) {
                        console.log(`Error processing station ${stn.site_id || 'unknown'} in ${f}:`, stationError);
                    }
                }
            }
            catch(e) {
                console.log(`Error fetching feed ${f}:`, e instanceof Error ? e.message : String(e));
                // Try to fallback to R2 cache even if we couldn't reach the main endpoint
                try {
                    let r2: any = await env.R2.get(`${f}.json`);
                    if (r2 !== null) {
                        let fallbackData = await r2.json();
                        console.log(`Successfully loaded fallback data for ${f} from R2`);
                        // Process fallback data same way as above
                        if (fallbackData.stations && Array.isArray(fallbackData.stations)) {
                            if (!data[f]) data[f] = {};
                            
                            for (let stn of fallbackData.stations) {
                                if (stn.site_id && stn.brand && stn.prices) {
                                    const normalizedPrices = PriceNormalizer.normalizePrices(stn.prices, stn.brand);
                                    if (Object.keys(normalizedPrices).length > 0) {
                                        data[f][stn.site_id] = {
                                            'address': {
                                                'brand': stn.brand,
                                                'address': stn.address || '',
                                                'postcode': stn.postcode || ''
                                            },
                                            'location': stn.location || { latitude: 0, longitude: 0 },
                                            'prices': normalizedPrices,
                                            'updated': fallbackData.last_updated || new Date().toISOString()
                                        };
                                    }
                                }
                            }
                        }
                    }
                } catch (r2Error) {
                    console.log(`Failed to load fallback data for ${f}:`, r2Error instanceof Error ? r2Error.message : String(r2Error));
                }
            }
        }
        return data
    }
}