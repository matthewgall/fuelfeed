/**
 * Emoji Utilities for TypeScript/Node.js
 * Provides consistent emoji definitions for server-side rendering
 */

export interface EmojiMapping {
    emoji: string;
    text: string;
}

export class EmojiUtils {
    private static emojiMappings: Record<string, EmojiMapping> = {
        // Analytics and Statistics
        chart: { emoji: '📊', text: 'STATS' },
        thermometer: { emoji: '🌡️', text: 'HEAT' },
        
        // Fuel Types
        fuel: { emoji: '⛽', text: 'FUEL' },
        truck: { emoji: '🚛', text: 'DIESEL' },
        diamond: { emoji: '💎', text: 'SUPER' },
        dieselSuper: { emoji: '🚛💎', text: 'D+' },
        
        // Status and Quality
        star: { emoji: '⭐', text: 'GOOD' },
        trophy: { emoji: '🏆', text: 'BEST' },
        warning: { emoji: '⚠️', text: 'WARN' },
        target: { emoji: '🎯', text: 'OK' },
        
        // Actions and Tools
        money: { emoji: '💰', text: 'SAVE' },
        search: { emoji: '🔍', text: 'FIND' },
        bulb: { emoji: '💡', text: 'TIP' },
        location: { emoji: '📍', text: 'LOC' },
        
        // Trends
        trendUp: { emoji: '📈', text: 'UP' },
        trendDown: { emoji: '📉', text: 'DOWN' },
        trendFlat: { emoji: '➡️', text: 'SAME' },
        
        // UI Elements
        mobile: { emoji: '📱', text: 'APP' },
        close: { emoji: '✕', text: 'X' },
        
        // System and Performance
        trash: { emoji: '🗑️', text: 'DEL' },
        refresh: { emoji: '🔄', text: 'SYNC' },
        rocket: { emoji: '🚀', text: 'GO' },
        
        // Additional fuel types
        fire: { emoji: '🔥', text: 'LPG' }
    };

    /**
     * Get emoji character
     */
    static getEmoji(key: keyof typeof EmojiUtils.emojiMappings): string {
        const mapping = this.emojiMappings[key];
        return mapping ? mapping.emoji : '•';
    }

    /**
     * Get text fallback
     */
    static getText(key: keyof typeof EmojiUtils.emojiMappings): string {
        const mapping = this.emojiMappings[key];
        return mapping ? mapping.text : 'UNKNOWN';
    }

    /**
     * Get HTML with Noto Color Emoji styling
     */
    static getHTML(key: keyof typeof EmojiUtils.emojiMappings, size: number = 16): string {
        const mapping = this.emojiMappings[key];
        if (!mapping) return '•';

        return `<span class="noto-emoji" style="font-family: 'Noto Color Emoji', 'Apple Color Emoji', 'Segoe UI Emoji', emoji, sans-serif; font-size: ${size}px; display: inline-block; vertical-align: middle; line-height: 1;">${mapping.emoji}</span>`;
    }

    /**
     * Get all available emoji keys
     */
    static getAvailableEmojis(): string[] {
        return Object.keys(this.emojiMappings);
    }
}

export default EmojiUtils;