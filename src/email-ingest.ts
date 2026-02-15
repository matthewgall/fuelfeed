/// <reference path="../worker-configuration.d.ts" />
type ExtractedEmailDetails = {
    subject: string | null;
    messageId: string | null;
    from: string;
    to: string;
    rawSize: number;
    preview: string;
    rawText: string;
};

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

export function buildEmailR2Key(extracted: ExtractedEmailDetails, fallbackId?: string): string {
    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, '-');
    const idSource = extracted.messageId || fallbackId || 'unknown';
    const safeId = sanitizeMessageId(idSource);
    return `email/${timestamp}-${safeId}.eml`;
}

export async function extractEmailDetails(message: ForwardableEmailMessage): Promise<ExtractedEmailDetails> {
    const rawText = await new Response(message.raw).text();

    return {
        subject: getSubject(message.headers),
        messageId: getMessageId(message.headers),
        from: message.from,
        to: message.to,
        rawSize: message.rawSize,
        preview: buildPreview(rawText),
        rawText
    };
}

export async function storeEmailDetails(
    env: Env,
    extracted: ExtractedEmailDetails,
    r2Key?: string
): Promise<void> {
    const payload = {
        subject: extracted.subject,
        messageId: extracted.messageId,
        from: extracted.from,
        to: extracted.to,
        rawSize: extracted.rawSize,
        preview: extracted.preview,
        capturedAt: new Date().toISOString(),
        r2Key
    };

    await env.KV.put('fuel-finder-email:last', JSON.stringify(payload));
}

export async function storeEmailBody(
    env: Env,
    extracted: ExtractedEmailDetails,
    r2Key: string
): Promise<void> {
    await env.R2.put(r2Key, extracted.rawText, {
        httpMetadata: {
            contentType: 'text/plain; charset=utf-8'
        }
    });
}
