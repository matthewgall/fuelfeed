import Fuel from '../../classes/Fuel';

export async function onRequest(context) {
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
                prices.push(`<strong>${fuel}</strong> ${stn.prices[fuel]}`);
            }
            resp.features.push({
                "type": "Feature",
                "geometry": {
                    "type": "Point",
                    "coordinates": [stn.location.longitude, stn.location.latitude]
                },
                "properties": {
                    "title": `${stn.address.brand}, ${stn.address.postcode}`,
                    "description": prices.join("<br />")
                }
            });
        }
    }
    
    // Next, we save the data to KV
    await context.env.KV.put('fueldata-mapbox', JSON.stringify(resp), {expirationTtl: 21600})
    
    return new Response(JSON.stringify(resp), {
        headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
        }
    });
}