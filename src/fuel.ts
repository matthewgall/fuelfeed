/// <reference path="../worker-configuration.d.ts" />
import Feeds from '../feeds.json'
import { PriceNormalizer } from './price-normalizer'

export default class Fuel {
    async getData(env) {
        let data: any = {}

        const processFeedStations = (feedKey: string, feedData: any) => {
            if (!feedData?.stations || !Array.isArray(feedData.stations)) {
                console.log(`Invalid stations data for ${feedKey}`)
                return
            }

            if (!data[feedKey]) {
                data[feedKey] = {}
            }

            for (let stn of feedData.stations) {
                try {
                    if (!stn.site_id || !stn.brand || !stn.prices) {
                        console.log(`Skipping station with missing required fields in ${feedKey}`)
                        continue
                    }

                    const normalizedPrices = PriceNormalizer.normalizePrices(stn.prices, stn.brand)
                    if (Object.keys(normalizedPrices).length > 0) {
                        data[feedKey][stn.site_id] = {
                            'address': {
                                'brand': stn.brand,
                                'address': stn.address || '',
                                'postcode': stn.postcode || ''
                            },
                            'location': stn.location || { latitude: 0, longitude: 0 },
                            'prices': normalizedPrices,
                            'updated': feedData.last_updated || new Date().toISOString()
                        }
                    } else {
                        console.log(`No valid prices for station ${stn.site_id} in ${feedKey}`)
                    }
                } catch (stationError) {
                    console.log(`Error processing station ${stn.site_id || 'unknown'} in ${feedKey}:`, stationError)
                }
            }
        }

        try {
            const fuelFinderSnapshot = await env.R2.get('fuel-finder.json')
            if (fuelFinderSnapshot !== null) {
                const snapshotData = await fuelFinderSnapshot.json()
                processFeedStations('fuel_finder', snapshotData)
                return data
            }
        } catch (error) {
            console.log('Failed to load fuel-finder snapshot from R2:', error instanceof Error ? error.message : String(error))
        }

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
                
                processFeedStations(f, d)
            }
            catch(e) {
                console.log(`Error fetching feed ${f}:`, e instanceof Error ? e.message : String(e));
                // Try to fallback to R2 cache even if we couldn't reach the main endpoint
                try {
                    let r2: any = await env.R2.get(`${f}.json`);
                    if (r2 !== null) {
                        let fallbackData = await r2.json();
                        console.log(`Successfully loaded fallback data for ${f} from R2`);
                        processFeedStations(f, fallbackData)
                    }
                } catch (r2Error) {
                    console.log(`Failed to load fallback data for ${f}:`, r2Error instanceof Error ? r2Error.message : String(r2Error));
                }
            }
        }
        return data
    }
}
