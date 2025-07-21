/**
 * Memory management utilities
 */

export class MemoryManager {
  private static readonly CLEANUP_THRESHOLD = 50; // Items before cleanup
  
  static cleanupMemory(): void {
    // Trigger manual garbage collection if available (Chrome DevTools)
    if (window.gc) {
      try {
        window.gc();
        console.log('🗑️ Manual garbage collection triggered');
      } catch (e) {
        // Ignore if GC not available
      }
    }
    
    // Clear detail cache for stations not visible
    this.clearStationCaches();
  }
  
  static clearStationCaches(): void {
    // Clear global station caches if they exist
    if (typeof (window as any).stationDetailCache !== 'undefined') {
      const cache = (window as any).stationDetailCache;
      if (cache && typeof cache.size === 'number' && cache.size > this.CLEANUP_THRESHOLD) {
        console.log('🧹 Clearing station detail cache for memory management');
        cache.clear();
      }
    }
    
    if (typeof (window as any).detailLoadingCache !== 'undefined') {
      const loadingCache = (window as any).detailLoadingCache;
      if (loadingCache && typeof loadingCache.clear === 'function') {
        loadingCache.clear();
      }
    }
  }
  
  static aggressiveCleanup(): void {
    // Clear all caches aggressively
    if (typeof (window as any).stationDetailCache !== 'undefined') {
      (window as any).stationDetailCache.clear();
    }
    
    if (typeof (window as any).detailLoadingCache !== 'undefined') {
      (window as any).detailLoadingCache.clear();
    }
    
    if (typeof (window as any).stationCache !== 'undefined') {
      const stationCache = (window as any).stationCache;
      if (stationCache && typeof stationCache.clear === 'function') {
        stationCache.clear();
      }
    }
    
    // Trigger memory cleanup
    this.cleanupMemory();
    console.log('🧼 Aggressive memory cleanup completed');
  }
  
  static getMemoryUsage(): { used: number; total: number; percentage: number } | null {
    if ('memory' in performance) {
      const memoryInfo = (performance as any).memory;
      if (memoryInfo) {
        const used = memoryInfo.usedJSHeapSize / 1024 / 1024; // MB
        const total = memoryInfo.totalJSHeapSize / 1024 / 1024; // MB
        return {
          used: Math.round(used * 100) / 100,
          total: Math.round(total * 100) / 100,
          percentage: Math.round((used / total) * 100 * 100) / 100
        };
      }
    }
    return null;
  }
  
  static shouldCleanup(): boolean {
    const usage = this.getMemoryUsage();
    return usage ? usage.percentage > 75 : false; // Cleanup when over 75% memory usage
  }
  
  static autoCleanupIfNeeded(): void {
    if (this.shouldCleanup()) {
      console.log('📊 Memory usage high, triggering cleanup...');
      this.cleanupMemory();
    }
  }
}