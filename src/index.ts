import { AutoRouter } from 'itty-router'
import Fuel from './fuel'

const router = AutoRouter()

router.get('/api/data.json', async (request, env, context) => {
    let ttl: any = env.TTL || 21600;
    let obj: any = await env.KV.get("fueldata-json");
    if (obj !== null) {
        return new Response(obj, {
            headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"
            }
        });
    }

    let f = new Fuel;
    let d = await f.getData();

    // Next, we save the data to KV
    await env.KV.put('fueldata-json', JSON.stringify(d), {expirationTtl: ttl})
    
    return new Response(JSON.stringify(d), {
        headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
        }
    });
})

router.get('/api/data.mapbox', async (request, env, context) => {
    let ttl: any = env.TTL || 21600;
    let obj: any = await env.KV.get("fueldata-mapbox");
    if (obj !== null) {
        return new Response(obj, {
            headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"
            }
        });
    }

    // Otherwise, let's go fetch it
    let resp: any = {
        "type": "FeatureCollection",
        "features": []
    };
    let f: any = new Fuel;
    let d: any = await f.getData();

    for (let brand of Object.keys(d)) {
        for (let s of Object.keys(d[brand])) {
            let stn: any = d[brand][s];
            let prices: any = [];
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
    await env.KV.put('fueldata-mapbox', JSON.stringify(resp), {expirationTtl: ttl})
    
    return new Response(JSON.stringify(resp), {
        headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
        }
    });
})

export default router