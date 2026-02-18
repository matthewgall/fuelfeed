const FUEL_FINDER_CSV_URL = 'https://www.fuel-finder.service.gov.uk/internal/v1.0.2/csv/get-latest-fuel-prices-csv';
const FUEL_FINDER_ARCHIVE_URL = 'https://raw.githubusercontent.com/matthewgall/fuelfinder-archive/refs/heads/main/data.csv';
const FUEL_FINDER_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/csv,application/octet-stream;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-GB,en;q=0.9',
    'Referer': 'https://www.gov.uk/guidance/access-fuel-price-data',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache'
};

type FuelFinderStation = {
    site_id: string;
    brand: string;
    address: string;
    postcode: string;
    location: {
        latitude: number;
        longitude: number;
    };
    prices: Record<string, number>;
    updated: string;
};

type FuelFinderData = {
    last_updated: string;
    stations: FuelFinderStation[];
};

type FuelFinderStats = {
    totalRows: number;
    storedRows: number;
    skippedRows: number;
    skippedMissingCoords: number;
};

type FuelFinderParseResult = {
    data: FuelFinderData;
    stats: FuelFinderStats;
};

const URL_REGEX = /https?:\/\/[^\s<>"']+/gi;

function parseCsvLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i += 1) {
        const char = line[i];

        if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
                current += '"';
                i += 1;
            } else {
                inQuotes = !inQuotes;
            }
            continue;
        }

        if (char === ',' && !inQuotes) {
            result.push(current);
            current = '';
            continue;
        }

        current += char;
    }

    result.push(current);
    return result;
}

function cleanValue(value: unknown): string {
    if (value === undefined || value === null) return '';
    let cleaned = String(value).trim();
    if (!cleaned) return '';

    if (cleaned.startsWith('"') && cleaned.endsWith('"')) {
        cleaned = cleaned.slice(1, -1);
    }

    if (cleaned.startsWith("'") && cleaned.length > 1) {
        cleaned = cleaned.slice(1);
    }

    return cleaned.trim();
}

function parseNumber(value: unknown): number | null {
    const cleaned = cleanValue(value);
    if (!cleaned) return null;
    const parsed = Number.parseFloat(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
}

function parseTimestamp(value: unknown): { iso: string; date: Date | null } {
    const cleaned = cleanValue(value);
    if (!cleaned) return { iso: '', date: null };
    const parsed = new Date(cleaned);
    if (Number.isNaN(parsed.getTime())) {
        return { iso: cleaned, date: null };
    }
    return { iso: parsed.toISOString(), date: parsed };
}

function normalizeBrand(value: unknown): string {
    const cleaned = cleanValue(value);
    if (!cleaned) return '';

    const preserveUpper = new Set(['BP', 'ASDA']);
    const words = cleaned.split(/\s+/g).filter(Boolean);

    const normalized = words.map((word) => {
        const trimmed = word.trim();
        if (preserveUpper.has(trimmed.toUpperCase())) {
            return trimmed.toUpperCase();
        }

        const lower = trimmed.toLowerCase();
        return lower.charAt(0).toUpperCase() + lower.slice(1);
    });

    return normalized.join(' ');
}

function buildAddress(record: Record<string, string>): string {
    const parts = [
        cleanValue(record['forecourts.trading_name']),
        cleanValue(record['forecourts.location.address_line_1']),
        cleanValue(record['forecourts.location.address_line_2']),
        cleanValue(record['forecourts.location.city']),
        cleanValue(record['forecourts.location.county']),
        cleanValue(record['forecourts.location.country'])
    ].filter((part) => part);

    return parts.join(', ');
}

function extractPrices(record: Record<string, string>): Record<string, number> {
    const priceFields = {
        E5: 'forecourts.fuel_price.E5',
        E10: 'forecourts.fuel_price.E10',
        B7P: 'forecourts.fuel_price.B7P',
        B7S: 'forecourts.fuel_price.B7S',
        B10: 'forecourts.fuel_price.B10',
        HVO: 'forecourts.fuel_price.HVO'
    };

    const prices: Record<string, number> = {};
    for (const [fuelType, column] of Object.entries(priceFields)) {
        const priceValue = parseNumber(record[column]);
        if (priceValue !== null && priceValue > 0) {
            prices[fuelType] = priceValue;
        }
    }

    return prices;
}

function parseFuelFinderCsvText(csvText: string): FuelFinderParseResult {
    const lines = csvText.split('\n');
    let headers: string[] | null = null;
    const stations: FuelFinderStation[] = [];
    let latestDate: Date | null = null;

    const stats: FuelFinderStats = {
        totalRows: 0,
        storedRows: 0,
        skippedRows: 0,
        skippedMissingCoords: 0
    };

    for (const rawLine of lines) {
        const line = rawLine.replace(/\r$/, '');
        if (!line.trim()) continue;

        if (!headers) {
            headers = parseCsvLine(line).map((header) => header.trim());
            continue;
        }

        stats.totalRows += 1;
        const values = parseCsvLine(line);
        const record: Record<string, string> = {};

        for (let i = 0; i < headers.length; i += 1) {
            record[headers[i]] = values[i] ?? '';
        }

        const nodeId = cleanValue(record['forecourts.node_id']);
        if (!nodeId) {
            stats.skippedRows += 1;
            continue;
        }

        const latitude = parseNumber(record['forecourts.location.latitude']);
        const longitude = parseNumber(record['forecourts.location.longitude']);
        if (latitude === null || longitude === null) {
            stats.skippedRows += 1;
            stats.skippedMissingCoords += 1;
            continue;
        }

        const prices = extractPrices(record);
        if (Object.keys(prices).length === 0) {
            stats.skippedRows += 1;
            continue;
        }

        const brandName = normalizeBrand(record['forecourts.brand_name'])
            || normalizeBrand(record['forecourts.trading_name'])
            || normalizeBrand(record['mft.name'])
            || 'Station';

        const postcode = cleanValue(record['forecourts.location.postcode']);
        const updated = parseTimestamp(record['latest_update_timestamp']);
        if (updated.date && (!latestDate || updated.date > latestDate)) {
            latestDate = updated.date;
        }

        stations.push({
            site_id: nodeId,
            brand: brandName,
            address: buildAddress(record),
            postcode: postcode,
            location: {
                latitude: latitude,
                longitude: longitude
            },
            prices: prices,
            updated: updated.iso
        });

        stats.storedRows += 1;
    }

    const lastUpdated = latestDate ? latestDate.toISOString() : new Date().toISOString();

    return {
        data: {
            last_updated: lastUpdated,
            stations: stations
        },
        stats
    };
}

async function fetchFuelFinderCsv(url: string, maxRedirects: number = 3) {
    let currentUrl = url;
    let response: Response;

    for (let attempt = 0; attempt <= maxRedirects; attempt += 1) {
        response = await fetch(currentUrl, {
            headers: FUEL_FINDER_HEADERS,
            redirect: 'manual'
        });

        if (response.status >= 300 && response.status < 400) {
            const location = response.headers.get('location');
            if (!location) break;
            currentUrl = new URL(location, currentUrl).toString();
            continue;
        }

        return { response, finalUrl: currentUrl };
    }

    return { response: response!, finalUrl: currentUrl };
}

export async function updateFuelFinderSnapshot(env: any) {
    let response: Response | undefined;
    let finalUrl = FUEL_FINDER_CSV_URL;
    let usedFallback = false;

    try {
        const result = await fetchFuelFinderCsv(FUEL_FINDER_CSV_URL);
        response = result.response;
        finalUrl = result.finalUrl;
        if (!response.ok) {
            throw new Error(`Fuel Finder CSV download failed with status ${response.status}`);
        }
    } catch (error) {
        usedFallback = true;
        const fallbackResponse = await fetch(FUEL_FINDER_ARCHIVE_URL, {
            headers: FUEL_FINDER_HEADERS
        });
        if (!fallbackResponse.ok) {
            throw new Error(
                `Fuel Finder CSV fallback failed with status ${fallbackResponse.status}`
            );
        }
        response = fallbackResponse;
        finalUrl = FUEL_FINDER_ARCHIVE_URL;
    }

    const csvText = await response.text();
    const { data, stats } = parseFuelFinderCsvText(csvText);

    await env.R2.put('fuel-finder.json', JSON.stringify(data), {
        httpMetadata: {
            contentType: 'application/json; charset=utf-8'
        }
    });

    await env.KV.put('fuel-finder:last', JSON.stringify({
        stats,
        lastUpdated: data.last_updated,
        capturedAt: new Date().toISOString(),
        sourceUrl: FUEL_FINDER_CSV_URL,
        finalUrl,
        usedFallback
    }));

    return { stats, lastUpdated: data.last_updated };
}

export function extractUrlsFromText(text: string): string[] {
    if (!text) return [];
    const matches = text.match(URL_REGEX) ?? [];
    return Array.from(new Set(matches.map((url) => url.trim()).filter(Boolean)));
}
