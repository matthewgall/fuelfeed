import { AutoRouter } from 'itty-router'
import Fuel from './fuel'

const router = AutoRouter()
const responseData = {
    headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
    }
}

async function doSchedule(event:any, env: any) {
    // So, in this function, we're going to fetch all our data and save it to KV
    let data: any = new Fuel;
    data = await data.getData(env);

    // Next, we're going to just dump it to KV (but later we will put it in D1)
    await env.KV.put('fueldata', JSON.stringify(data))
}

router.get('/api/data.json', async (request, env, context) => {
    let data: any = await env.KV.get("fueldata", 'json');
    if (data == null) {
        data = new Fuel;
        data = await data.getData(env);
        // And cache it
        await env.KV.put('fueldata', JSON.stringify(data));
    }
    return new Response(JSON.stringify(data), responseData);
})

router.get('/api/data.mapbox', async (request, env, context) => {
    // First, set some data storage areas
    let resp: any = {
        "type": "FeatureCollection",
        "features": []
    };
    let d: any = {}

    // Next, we try and grab our cached data
    d = await env.KV.get('fueldata', 'json')
    if (d == null) {
        d = new Fuel;
        d = await d.getData(env);
        // And cache it
        await env.KV.put('fueldata', JSON.stringify(d));
    }

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

    return new Response(JSON.stringify(resp), responseData);
})

export default {
    fetch: router.fetch,
    scheduled: doSchedule,
}