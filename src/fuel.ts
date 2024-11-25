import Feeds from '../feeds.json'

export default class Fuel {
    async getData() {
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
                console.log(`Encountered an error while fetching ${f}`)
            }
        }
        return data
    }
}