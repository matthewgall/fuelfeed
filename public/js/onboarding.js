/**
 * First-time user onboarding overlay for FuelFeed
 * Shows new users how to use the service
 */
class OnboardingOverlay {
    constructor() {
        this.hasSeenOnboarding = localStorage.getItem('fuelaround-onboarding-seen') === 'true';
        this.overlay = null;
    }

    /**
     * Check if user should see onboarding
     */
    shouldShowOnboarding() {
        return !this.hasSeenOnboarding;
    }

    /**
     * Create and show onboarding overlay
     */
    show() {
        if (!this.shouldShowOnboarding()) {
            return;
        }

        this.createOverlay();
        this.overlay.style.display = 'flex';
    }

    /**
     * Hide onboarding and mark as seen
     */
    dismiss() {
        if (this.overlay) {
            this.overlay.style.display = 'none';
        }
        localStorage.setItem('fuelaround-onboarding-seen', 'true');
        this.hasSeenOnboarding = true;
    }

    /**
     * Create the onboarding overlay element
     */
    createOverlay() {
        if (this.overlay) return;

        const overlay = document.createElement('div');
        overlay.id = 'onboarding-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.8);
            backdrop-filter: blur(5px);
            z-index: 10000;
            display: none;
            align-items: center;
            justify-content: center;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        `;

        const content = document.createElement('div');
        content.style.cssText = `
            background: white;
            border-radius: 16px;
            max-width: 400px;
            max-height: 80vh;
            overflow-y: auto;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
            margin: 20px;
            animation: slideIn 0.3s ease-out;
        `;

        content.innerHTML = `
            <div style="padding: 24px;">
                <div style="text-align: center; margin-bottom: 20px;">
                    <span style="font-size: 32px;" class="noto-emoji">⛽</span>
                    <h2 style="margin: 8px 0 0 0; color: #2c3e50; font-size: 24px; font-weight: 700;">
                        Welcome to fuelaround.me
                    </h2>
                    <p style="margin: 8px 0 0 0; color: #7f8c8d; font-size: 14px;">
                        Find the best fuel prices in your area
                    </p>
                </div>

                <div style="margin-bottom: 20px;">
                    <div class="feature-item">
                        <span class="feature-icon noto-emoji">🗺️</span>
                        <div class="feature-text">
                            <strong>Navigate the map</strong>
                            <p>Pan and zoom to explore fuel stations in any area</p>
                        </div>
                    </div>

                    <div class="feature-item">
                        <span class="feature-icon noto-emoji">⛽</span>
                        <div class="feature-text">
                            <strong>Click stations for details</strong>
                            <p>Tap any station marker to see current fuel prices</p>
                        </div>
                    </div>

                    <div class="feature-item">
                        <span class="feature-icon noto-emoji">📊</span>
                        <div class="feature-text">
                            <strong>View price statistics</strong>
                            <p>Use the stats button to see regional price averages</p>
                        </div>
                    </div>

                    <div class="feature-item">
                        <span class="feature-icon noto-emoji">🌡️</span>
                        <div class="feature-text">
                            <strong>Enable price heatmap</strong>
                            <p>Toggle the heatmap to see price zones across the area</p>
                        </div>
                    </div>

                    <div class="feature-item">
                        <span class="feature-icon noto-emoji">📍</span>
                        <div class="feature-text">
                            <strong>Find your location</strong>
                            <p>Allow location access to center map on your area</p>
                        </div>
                    </div>
                </div>

                <div style="display: flex; gap: 12px; margin-top: 20px;">
                    <button id="onboarding-skip" style="
                        flex: 1;
                        padding: 12px 20px;
                        border: 2px solid #3498db;
                        background: transparent;
                        color: #3498db;
                        border-radius: 8px;
                        font-size: 14px;
                        font-weight: 600;
                        cursor: pointer;
                        transition: all 0.2s ease;
                    ">
                        Skip Tutorial
                    </button>
                    <button id="onboarding-start" style="
                        flex: 1;
                        padding: 12px 20px;
                        border: none;
                        background: linear-gradient(135deg, #3498db 0%, #2980b9 100%);
                        color: white;
                        border-radius: 8px;
                        font-size: 14px;
                        font-weight: 600;
                        cursor: pointer;
                        transition: all 0.2s ease;
                        box-shadow: 0 4px 12px rgba(52, 152, 219, 0.3);
                    ">
                        Get Started
                    </button>
                </div>
            </div>
        `;

        // Add CSS for animations and feature items
        const style = document.createElement('style');
        style.textContent = `
            @keyframes slideIn {
                from { 
                    opacity: 0; 
                    transform: translateY(-20px) scale(0.95); 
                }
                to { 
                    opacity: 1; 
                    transform: translateY(0) scale(1); 
                }
            }

            .feature-item {
                display: flex;
                align-items: flex-start;
                gap: 12px;
                margin-bottom: 16px;
                padding: 12px;
                background: rgba(52, 152, 219, 0.05);
                border-radius: 8px;
                border-left: 3px solid #3498db;
            }

            .feature-icon {
                font-size: 20px;
                flex-shrink: 0;
                margin-top: 2px;
                font-family: "Noto Color Emoji", "Apple Color Emoji", "Segoe UI Emoji", emoji, sans-serif;
            }

            .feature-text {
                flex: 1;
            }

            .feature-text strong {
                display: block;
                color: #2c3e50;
                font-size: 14px;
                margin-bottom: 4px;
                font-weight: 600;
            }

            .feature-text p {
                margin: 0;
                color: #7f8c8d;
                font-size: 13px;
                line-height: 1.4;
            }

            #onboarding-skip:hover {
                background: #3498db;
                color: white;
            }

            #onboarding-start:hover {
                transform: translateY(-1px);
                box-shadow: 0 6px 16px rgba(52, 152, 219, 0.4);
            }

            /* Mobile responsive */
            @media (max-width: 768px) {
                #onboarding-overlay > div {
                    max-width: none !important;
                    margin: 10px !important;
                    border-radius: 12px !important;
                }
                
                #onboarding-overlay .feature-item {
                    padding: 10px;
                    margin-bottom: 12px;
                }
                
                #onboarding-overlay .feature-icon {
                    font-size: 18px;
                }
                
                #onboarding-overlay .feature-text strong {
                    font-size: 13px;
                }
                
                #onboarding-overlay .feature-text p {
                    font-size: 12px;
                }
            }
        `;
        
        if (!document.getElementById('onboarding-styles')) {
            style.id = 'onboarding-styles';
            document.head.appendChild(style);
        }

        overlay.appendChild(content);
        document.body.appendChild(overlay);
        this.overlay = overlay;

        // Add event listeners
        document.getElementById('onboarding-skip').addEventListener('click', () => {
            this.dismiss();
        });

        document.getElementById('onboarding-start').addEventListener('click', () => {
            this.dismiss();
        });

        // Allow clicking backdrop to dismiss
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                this.dismiss();
            }
        });

        // Allow ESC key to dismiss
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.overlay && this.overlay.style.display === 'flex') {
                this.dismiss();
            }
        });
    }

    /**
     * Reset onboarding (for testing)
     */
    static reset() {
        localStorage.removeItem('fuelaround-onboarding-seen');
    }
}

// Create global instance
const onboarding = new OnboardingOverlay();
window.onboarding = onboarding;