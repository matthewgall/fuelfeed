/// <reference path="../worker-configuration.d.ts" />

export interface InvalidationRule {
    pattern: string;
    maxAge: number;
    dependencies: string[];
}

export class CacheInvalidator {
    private static readonly INVALIDATION_RULES: InvalidationRule[] = [
        {
            pattern: 'fueldata*',
            maxAge: 3600, // 1 hour
            dependencies: ['scheduled-update', 'manual-refresh']
        },
        {
            pattern: 'mapbox-*',
            maxAge: 900, // 15 minutes
            dependencies: ['fueldata', 'bbox-change']
        },
        {
            pattern: 'tile-*',
            maxAge: 1800, // 30 minutes
            dependencies: ['fueldata']
        }
    ];

    static async invalidateByPattern(env: any, pattern: string): Promise<number> {
        let deletedCount = 0;
        
        try {
            // List all keys (note: KV has a 1000 key limit per list operation)
            const list = await env.KV.list({ prefix: pattern.replace('*', '') });
            
            for (const key of list.keys) {
                await env.KV.delete(key.name);
                deletedCount++;
            }
            
            console.log(`Invalidated ${deletedCount} cache entries matching pattern: ${pattern}`);
        } catch (error) {
            console.log(`Error invalidating cache pattern ${pattern}:`, error);
        }
        
        return deletedCount;
    }

    static async invalidateStale(env: any): Promise<number> {
        let deletedCount = 0;
        const now = Date.now();
        
        try {
            // Check for stale entries based on our rules
            const list = await env.KV.list();
            
            for (const key of list.keys) {
                const rule = this.INVALIDATION_RULES.find(r => 
                    key.name.match(r.pattern.replace('*', '.*'))
                );
                
                if (rule) {
                    // Check if the key has expired based on our rules
                    const metadata = key.metadata as any;
                    if (metadata && metadata.timestamp) {
                        const age = now - metadata.timestamp;
                        if (age > rule.maxAge * 1000) {
                            await env.KV.delete(key.name);
                            deletedCount++;
                        }
                    }
                }
            }
            
            console.log(`Invalidated ${deletedCount} stale cache entries`);
        } catch (error) {
            console.log('Error invalidating stale cache:', error);
        }
        
        return deletedCount;
    }

    static async invalidateByDependency(env: any, dependency: string): Promise<number> {
        let deletedCount = 0;
        
        const affectedRules = this.INVALIDATION_RULES.filter(rule => 
            rule.dependencies.includes(dependency)
        );
        
        for (const rule of affectedRules) {
            deletedCount += await this.invalidateByPattern(env, rule.pattern);
        }
        
        return deletedCount;
    }

    static async smartInvalidation(env: any, trigger: string): Promise<{ deleted: number, reason: string }> {
        let totalDeleted = 0;
        let reason = '';
        
        switch (trigger) {
            case 'scheduled-update':
                // When scheduled update runs, invalidate all mapbox caches but keep base data cache
                totalDeleted += await this.invalidateByPattern(env, 'mapbox-');
                totalDeleted += await this.invalidateByPattern(env, 'tile-');
                reason = 'Scheduled data update - invalidated derived caches';
                break;
                
            case 'manual-refresh':
                // Manual refresh invalidates everything
                totalDeleted += await this.invalidateByPattern(env, 'fueldata');
                totalDeleted += await this.invalidateByPattern(env, 'mapbox-');
                totalDeleted += await this.invalidateByPattern(env, 'tile-');
                reason = 'Manual refresh - full cache invalidation';
                break;
                
            case 'cleanup':
                // Regular cleanup of stale entries
                totalDeleted += await this.invalidateStale(env);
                reason = 'Scheduled cleanup of stale entries';
                break;
                
            default:
                reason = 'Unknown trigger - no action taken';
        }
        
        return { deleted: totalDeleted, reason };
    }

    static async getCacheStats(env: any): Promise<{ totalKeys: number, sizeEstimate: number, oldestEntry: number }> {
        try {
            const list = await env.KV.list();
            let totalSize = 0;
            let oldestTimestamp = Date.now();
            
            for (const key of list.keys) {
                // Estimate size (KV doesn't provide actual sizes)
                totalSize += key.name.length * 2; // Rough estimate
                
                const metadata = key.metadata as any;
                if (metadata && metadata.timestamp && metadata.timestamp < oldestTimestamp) {
                    oldestTimestamp = metadata.timestamp;
                }
            }
            
            return {
                totalKeys: list.keys.length,
                sizeEstimate: totalSize,
                oldestEntry: Date.now() - oldestTimestamp
            };
        } catch (error) {
            console.log('Error getting cache stats:', error);
            return { totalKeys: 0, sizeEstimate: 0, oldestEntry: 0 };
        }
    }
}