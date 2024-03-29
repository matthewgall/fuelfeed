import Fuel from '../../classes/Fuel';

export async function onRequest(context) {
    let ttl = context.env.TTL || 21600;
    let obj = await context.env.KV.get("fueldata-mapbox");
    if (obj !== null) {
        return new Response(obj, {
            headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"
            }
        });
    }

    let resp = {
        "type": "FeatureCollection",
        "features": []
    };
    let f = new Fuel;
    let d = await f.getData();

    for (let brand of Object.keys(d)) {
        for (let s of Object.keys(d[brand])) {
            let stn = d[brand][s];
            let prices = [];
            for (let fuel of Object.keys(stn.prices)) {
                let price = stn.prices[fuel]
                if (price < 5) price = stn.prices[fuel] * 100

                prices.push(`<strong>${fuel}</strong> ${price.toFixed(1)}`);
            }
            resp.features.push({
                "type": "Feature",
                "geometry": {
                    "type": "Point",
                    "coordinates": [stn.location.longitude, stn.location.latitude]
                },
                "properties": {
                    "title": `${stn.address.brand}, ${stn.address.postcode}`,
                    "description": prices.join("<br />"),
                    "updated": stn.updated
                }
            });
        }
    }
    
    // Next, we save the data to KV
    await context.env.KV.put('fueldata-mapbox', JSON.stringify(resp), {expirationTtl: ttl})
    
    return new Response(JSON.stringify(resp), {
        headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
        }
    });
}