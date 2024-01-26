import Feeds from '../feeds.json'

export default class Fuel {
    async getData() {
        let data = {}

        // Now we iterate through the feeds and download them all
        for (let f of Object.keys(Feeds)) {
            let d = await fetch(Feeds[f], {
                cf: {
                    cacheTtlByStatus: {
                        "200-299": 86400,
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
                    'prices': stn.prices
                }
            }
        }
        return data
    }
}