/**
 * Device detection utilities with TypeScript support
 */

import type { DeviceCapabilities } from '../types/global';

export class DeviceDetection {
  static get isMobile(): boolean {
    return window.innerWidth <= 768;
  }
  
  static get isLowEndMobile(): boolean {
    return window.innerWidth <= 480 || navigator.hardwareConcurrency <= 2;
  }
  
  static get isUltraLowEnd(): boolean {
    return window.innerWidth <= 320 || navigator.hardwareConcurrency <= 1;
  }
  
  static get clientSafetyLimit(): number {
    if (this.isUltraLowEnd) {
      return 50; // Ultra low-end mobile devices
    } else if (this.isLowEndMobile) {
      return 100; // Low-end mobile devices
    } else if (this.isMobile) {
      return 300; // Standard mobile devices  
    } else {
      return 1000; // Desktop/laptop devices
    }
  }
  
  static getCapabilities(): DeviceCapabilities {
    return {
      isMobile: this.isMobile,
      isLowEndMobile: this.isLowEndMobile,
      maxStations: this.clientSafetyLimit,
      clientSafetyLimit: this.clientSafetyLimit
    };
  }
  
  static getDebounceDelay(): number {
    if (this.isUltraLowEnd) {
      return 4000; // Very long delay for ultra low-end devices
    } else if (this.isLowEndMobile) {
      return 2000; // Longer delay for low-end mobile
    } else if (this.isMobile) {
      return 1500; // Moderate delay for mobile
    } else {
      return 500; // Fast response for desktop
    }
  }
  
  static getRequestTimeout(): number {
    if (this.isUltraLowEnd) {
      return 20000; // 20 seconds for ultra low-end devices
    } else if (this.isLowEndMobile) {
      return 15000; // 15 seconds for low-end mobile
    } else if (this.isMobile) {
      return 10000; // 10 seconds for mobile
    } else {
      return 0; // No timeout for desktop
    }
  }
  
  static logCapabilities(): void {
    const caps = this.getCapabilities();
    console.log('Device capabilities:', caps);
    console.log(`Debounce delay: ${this.getDebounceDelay()}ms`);
    console.log(`Request timeout: ${this.getRequestTimeout()}ms`);
  }
}