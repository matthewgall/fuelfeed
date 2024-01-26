import Fuel from '../../classes/Fuel';

export async function onRequest(context) {
    let f = new Fuel;
    let d = await f.getData();

    return new Response(JSON.stringify(d), {
        headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
        }
    });
}