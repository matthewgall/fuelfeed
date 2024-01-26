import Feeds from './feeds.json'

export function onRequest(context) {
    return new Response(JSON.stringify(Feeds), { headers: { 'Content-Type': 'application/json' }})
}