import Fuel from '../../classes/Fuel';

export async function onRequest(context) {
    let ttl = context.env.TTL || 21600;
    let obj = await context.env.KV.get("fueldata-json");
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
    await context.env.KV.put('fueldata-json', JSON.stringify(resp), {expirationTtl: ttl})
    
    return new Response(JSON.stringify(d), {
        headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
        }
    });
}