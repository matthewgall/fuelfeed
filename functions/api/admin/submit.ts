export async function handle({ request, env }) {
    let resp: any = {
        success: false
    }
    if (!['POST', 'DELETE'].includes(request.method)) return new Response(`Not Found`, { status: 405 })
    
    let data: any;
    try {
        data = await request.json();
    }
    catch(e) {
        return new Response(e)
    }

    // Do some validation
    //// First, we'll check for an authorised token
    if (!Object.keys(data).includes('token')) {
        resp.message = "You did not provide a token, or the token provided was not valid"
        return new Response(JSON.stringify(resp))
    }

    if (!env.TOKENS.split(',').includes(data.token)) {
        resp.message = "You did not provide a token, or the token provided was not valid"
        return new Response(JSON.stringify(resp))
    }

    //// Have they provided the data key
    if (!Object.keys(data).includes('data')) {
        resp.message = "You did not provide data, or the data provided was not valid"
        return new Response(JSON.stringify(resp))
    }

    // It's valid, so we'll enqueue it
    let action = 'add'
    if (request.method == 'DELETE') action = 'remove'

    try {
        await env.QUEUE.send({ action: action, data: data })
    }
    catch(e: any) {}

    // And return success
    resp.success = true;
    resp.action = action;
    resp.site_id = data.site_id;
    return new Response(JSON.stringify(resp))
}

export async function onRequest({ request, env }) {
	return await handle({ request, env });
}