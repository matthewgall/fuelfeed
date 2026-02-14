const URL_REGEX = /https?:\/\/[^\s<>"']+/gi;
const TRAILING_PUNCTUATION = /[)\]}.;,!?]+$/;
const FUEL_FINDER_CSV_URL = 'https://www.fuel-finder.service.gov.uk/internal/v1.0.2/csv/get-latest-fuel-prices-csv';
const FUEL_FINDER_CSV_PREFIX = 'fuel-finder/csv';

type ExtractedEmailUrls = {
    urls: string[];
    fuelFinderCsvUrl: string | null;
    subject: string | null;
    messageId: string | null;
    from: string;
    to: string;
    rawSize: number;
    preview: string;
    rawText: string;
};

function cleanUrl(rawUrl: string): string {
    let cleaned = rawUrl.trim();
    cleaned = cleaned.replace(/^<|>$/g, '');
    cleaned = cleaned.replace(TRAILING_PUNCTUATION, '');
    return cleaned;
}

export function extractUrlsFromText(text: string): string[] {
    if (!text) return [];

    const matches = text.match(URL_REGEX) ?? [];
    const cleaned = matches.map(cleanUrl).filter(Boolean);
    return Array.from(new Set(cleaned));
}

function detectFuelFinderCsvUrl(urls: string[]): string | null {
    if (urls.includes(FUEL_FINDER_CSV_URL)) return FUEL_FINDER_CSV_URL;
    return urls.find((url) => url.startsWith(FUEL_FINDER_CSV_URL)) ?? null;
}

function getSubject(headers: Headers): string | null {
    return headers.get('subject') ?? headers.get('Subject');
}

function getMessageId(headers: Headers): string | null {
    return headers.get('message-id') ?? headers.get('Message-Id') ?? headers.get('Message-ID');
}

function buildPreview(rawText: string, limit: number = 500): string {
    if (!rawText) return '';
    const trimmed = rawText.replace(/\s+/g, ' ').trim();
    return trimmed.length > limit ? `${trimmed.slice(0, limit)}...` : trimmed;
}

function sanitizeMessageId(messageId: string): string {
    return messageId.replace(/[<>]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '_');
}

export function buildEmailR2Key(extracted: ExtractedEmailUrls, fallbackId?: string): string {
    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, '-');
    const idSource = extracted.messageId || fallbackId || 'unknown';
    const safeId = sanitizeMessageId(idSource);
    return `email/${timestamp}-${safeId}.eml`;
}

export function buildFuelFinderCsvR2Key(suffix?: string): string {
    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, '-');
    const extra = suffix ? `-${sanitizeMessageId(suffix)}` : '';
    return `${FUEL_FINDER_CSV_PREFIX}/${timestamp}${extra}.csv`;
}

export async function extractEmailUrls(message: ForwardableEmailMessage): Promise<ExtractedEmailUrls> {
    const rawText = await new Response(message.raw).text();
    const urls = extractUrlsFromText(rawText);
    const fuelFinderCsvUrl = detectFuelFinderCsvUrl(urls);

    return {
        urls,
        fuelFinderCsvUrl,
        subject: getSubject(message.headers),
        messageId: getMessageId(message.headers),
        from: message.from,
        to: message.to,
        rawSize: message.rawSize,
        preview: buildPreview(rawText),
        rawText
    };
}

export async function storeEmailUrls(
    env: Env,
    extracted: ExtractedEmailUrls,
    r2Key?: string
): Promise<void> {
    const payload = {
        urls: extracted.urls,
        fuelFinderCsvUrl: extracted.fuelFinderCsvUrl,
        subject: extracted.subject,
        messageId: extracted.messageId,
        from: extracted.from,
        to: extracted.to,
        rawSize: extracted.rawSize,
        preview: extracted.preview,
        urlCount: extracted.urls.length,
        capturedAt: new Date().toISOString(),
        r2Key
    };

    await env.KV.put('fuel-finder-email:last', JSON.stringify(payload));
}

export async function storeEmailBody(
    env: Env,
    extracted: ExtractedEmailUrls,
    r2Key: string
): Promise<void> {
    await env.R2.put(r2Key, extracted.rawText, {
        httpMetadata: {
            contentType: 'text/plain; charset=utf-8'
        }
    });
}

export type FuelFinderCsvDownload = {
    url: string;
    r2Key: string;
    status: number;
    bytes: number;
    contentType: string | null;
};

export async function downloadFuelFinderCsv(
    env: Env,
    url: string,
    r2Key: string
): Promise<FuelFinderCsvDownload> {
    const response = await fetch(url, {
        headers: {
            Accept: 'text/csv,application/octet-stream;q=0.9,*/*;q=0.8'
        }
    });

    const contentType = response.headers.get('content-type');
    if (!response.ok) {
        return {
            url,
            r2Key,
            status: response.status,
            bytes: 0,
            contentType
        };
    }

    const data = await response.arrayBuffer();
    const bytes = data.byteLength;

    await env.R2.put(r2Key, data, {
        httpMetadata: {
            contentType: contentType || 'text/csv'
        }
    });

    return {
        url,
        r2Key,
        status: response.status,
        bytes,
        contentType
    };
}
