/**
 * Performance monitoring utilities
 */

import type { PerformanceMetrics } from '../types/global';

export class PerformanceMonitor {
  private static performanceIssues = 0;
  private static isLowPerformanceMode = false;
  
  static getMetrics(): PerformanceMetrics {
    const metrics: PerformanceMetrics = {
      performanceIssues: this.performanceIssues,
      isLowPerformanceMode: this.isLowPerformanceMode
    };
    
    // Add memory info if available
    if ('memory' in performance) {
      const memoryInfo = (performance as any).memory;
      if (memoryInfo) {
        const usedMB = memoryInfo.usedJSHeapSize / 1024 / 1024;
        const totalMB = memoryInfo.totalJSHeapSize / 1024 / 1024;
        
        metrics.memoryUsage = {
          used: usedMB,
          total: totalMB,
          percentage: (usedMB / totalMB) * 100
        };
      }
    }
    
    return metrics;
  }
  
  static detectLowPerformanceMode(): boolean {
    const metrics = this.getMetrics();
    
    if (metrics.memoryUsage) {
      // If using more than 80% of available memory or more than 100MB
      if (metrics.memoryUsage.percentage > 80 || metrics.memoryUsage.used > 100) {
        this.performanceIssues++;
        if (this.performanceIssues > 3 && !this.isLowPerformanceMode) {
          console.warn('⚠️ Switching to low performance mode due to memory pressure');
          this.isLowPerformanceMode = true;
          return true;
        }
      }
    }
    
    return false;
  }
  
  static isInLowPerformanceMode(): boolean {
    return this.isLowPerformanceMode;
  }
  
  static resetPerformanceIssues(): void {
    this.performanceIssues = 0;
    this.isLowPerformanceMode = false;
    console.log('🔄 Performance monitoring reset');
  }
  
  static logPerformanceInfo(): void {
    const metrics = this.getMetrics();
    console.log('📊 Performance metrics:', metrics);
  }
}