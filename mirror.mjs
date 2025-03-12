import axios from 'axios';
import fs from 'node:fs';
import { pathToFileURL } from 'url';
import Feeds from './feeds.json' with { type: "json" };

let feeds = Feeds;
let axiosConfig = {
    headers: {
        'User-Agent': 'fuelaround.me/builder'
    }
}
let fueldata = {}

async function downloadLists() {
    // Next, we download all the feeds
    for (let t of Object.keys(feeds)) {
        await axios.get(feeds[t], axiosConfig).then(function (resp) {
            if(resp.status == 200) {
                // Next, we append it to our data
                fueldata[t] = resp.data
            }
        }).catch(function (error) {})
    }
    // And return it
    return fueldata;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    let data = await downloadLists();

    // And write it to our data folder
    fs.writeFileSync(`data/fueldata.json`, JSON.stringify(data));
}
