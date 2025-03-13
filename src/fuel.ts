import Feeds from '../feeds.json'

export default class Fuel {
    async getData(env) {
        let data: any = {}

        // Now we iterate through the feeds and download them all
        for (let f of Object.keys(Feeds)) {
            try {
                let d: any = await fetch(Feeds[f], {
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
        
                d = await d.json();
        
                // Now, we iterate for each station to get the prices
                for (let stn of d.stations) {
                    try {
                        data[f][stn.site_id] = {}
                    }
                    catch(e) {
                        data[f] = {}
                        data[f][stn.site_id] = {}
                    }
        
                    data[f][stn.site_id] = {
                        'address': {
                            'brand': stn.brand,
                            'address': stn.address,
                            'postcode': stn.postcode
                        },
                        'location': stn.location,
                        'prices': stn.prices,
                        'updated': d.last_updated
                    }
                }
            }
            catch(e) {
                // If we encountered an error, means we probably hit a block, let's grab it from R2
                try {
                    let r2: any = await env.R2.get('fueldata.json')
                    if (r2 !== null) {
                        // We have the data, so read it in
                        r2 = await r2.json()
                        // And set data[f] to r2[f]
                        data[f] = r2[f].stations
                    }
                }
                catch(e) {
                    console.log(e);
                    console.log(`Encountered an error while fetching ${f}`)
                }
            }
        }
        return data
    }
}