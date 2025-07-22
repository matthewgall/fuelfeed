/**
 * Emoji Utilities - Noto Color Emoji System
 * Provides consistent emoji display across all platforms using Google Fonts
 */

class EmojiUtils {
    constructor() {
        // Comprehensive emoji mappings with fallbacks
        this.emojiMappings = {
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

        // Ensure Noto Color Emoji CSS is loaded
        this.ensureEmojiStyles();
    }

    /**
     * Ensure emoji styles are loaded in the document
     */
    ensureEmojiStyles() {
        if (document.getElementById('emoji-utils-styles')) return;

        const style = document.createElement('style');
        style.id = 'emoji-utils-styles';
        style.textContent = `
            /* Noto Color Emoji font stack for consistent display */
            .noto-emoji, .emoji {
                font-family: "Noto Color Emoji", "Apple Color Emoji", "Segoe UI Emoji", "Twemoji Mozilla", emoji, sans-serif !important;
                font-style: normal !important;
                font-weight: normal !important;
                text-rendering: optimizeLegibility !important;
                -webkit-font-feature-settings: "liga" off !important;
                font-feature-settings: "liga" off !important;
                display: inline-block;
                vertical-align: middle;
                line-height: 1;
            }
            
            /* Console and log emoji styling */
            .console-emoji {
                font-family: "Noto Color Emoji", "Apple Color Emoji", "Segoe UI Emoji", emoji, monospace !important;
            }
        `;
        document.head.appendChild(style);
    }

    /**
     * Get emoji with proper Noto Color Emoji styling
     */
    getEmoji(key, options = {}) {
        const mapping = this.emojiMappings[key];
        if (!mapping) return options.fallback || '•';

        const {
            size = 16,
            className = 'noto-emoji',
            inline = true,
            fallbackToText = false
        } = options;

        if (fallbackToText && !this.supportsColorEmoji()) {
            return `<span class="emoji-text-fallback" style="font-size: ${size}px;">[${mapping.text}]</span>`;
        }

        const style = `font-size: ${size}px; ${inline ? 'display: inline-block; vertical-align: middle;' : ''}`;
        return `<span class="${className}" style="${style}">${mapping.emoji}</span>`;
    }

    /**
     * Get plain emoji character (for console logs, etc.)
     */
    getPlainEmoji(key) {
        const mapping = this.emojiMappings[key];
        return mapping ? mapping.emoji : '•';
    }

    /**
     * Create emoji element
     */
    createElement(key, options = {}) {
        const mapping = this.emojiMappings[key];
        if (!mapping) return null;

        const {
            size = 16,
            className = 'noto-emoji'
        } = options;

        const span = document.createElement('span');
        span.className = className;
        span.textContent = mapping.emoji;
        span.style.cssText = `
            font-family: "Noto Color Emoji", "Apple Color Emoji", "Segoe UI Emoji", emoji, sans-serif;
            font-size: ${size}px;
            display: inline-block;
            vertical-align: middle;
            line-height: 1;
            font-style: normal;
            font-weight: normal;
            text-rendering: optimizeLegibility;
            -webkit-font-smoothing: antialiased;
            -moz-osx-font-smoothing: grayscale;
        `;

        return span;
    }

    /**
     * Replace emoji placeholders in text
     */
    replaceEmojiPlaceholders(text) {
        return text.replace(/:(\w+):/g, (match, key) => {
            const mapping = this.emojiMappings[key];
            return mapping ? mapping.emoji : match;
        });
    }

    /**
     * Check if browser supports color emoji
     */
    supportsColorEmoji() {
        if (this.emojiSupport !== undefined) {
            return this.emojiSupport;
        }

        try {
            const canvas = document.createElement('canvas');
            canvas.width = 20;
            canvas.height = 20;
            const ctx = canvas.getContext('2d');
            
            if (!ctx) {
                this.emojiSupport = false;
                return false;
            }

            ctx.fillStyle = '#000';
            ctx.textBaseline = 'middle';
            ctx.textAlign = 'center';
            ctx.font = '16px "Noto Color Emoji"';
            ctx.fillText('🎨', 10, 10);
            
            const imageData = ctx.getImageData(0, 0, 20, 20);
            const hasColor = imageData.data.some((channel, i) => 
                i % 4 < 3 && channel !== 0 && channel !== 255
            );
            
            this.emojiSupport = hasColor;
            return this.emojiSupport;
        } catch (e) {
            this.emojiSupport = false;
            return false;
        }
    }

    /**
     * Get all available emoji keys
     */
    getAvailableEmojis() {
        return Object.keys(this.emojiMappings);
    }
}

// Global instance
window.emojiUtils = new EmojiUtils();

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = EmojiUtils;
}