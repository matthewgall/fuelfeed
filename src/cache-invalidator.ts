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
                }\n            }\n            \n            console.log(`Invalidated ${deletedCount} stale cache entries`);\n        } catch (error) {\n            console.log('Error invalidating stale cache:', error);\n        }\n        \n        return deletedCount;\n    }\n\n    static async invalidateByDependency(env: any, dependency: string): Promise<number> {\n        let deletedCount = 0;\n        \n        const affectedRules = this.INVALIDATION_RULES.filter(rule => \n            rule.dependencies.includes(dependency)\n        );\n        \n        for (const rule of affectedRules) {\n            deletedCount += await this.invalidateByPattern(env, rule.pattern);\n        }\n        \n        return deletedCount;\n    }\n\n    static async smartInvalidation(env: any, trigger: string): Promise<{ deleted: number, reason: string }> {\n        let totalDeleted = 0;\n        let reason = '';\n        \n        switch (trigger) {\n            case 'scheduled-update':\n                // When scheduled update runs, invalidate all mapbox caches but keep base data cache\n                totalDeleted += await this.invalidateByPattern(env, 'mapbox-');\n                totalDeleted += await this.invalidateByPattern(env, 'tile-');\n                reason = 'Scheduled data update - invalidated derived caches';\n                break;\n                \n            case 'manual-refresh':\n                // Manual refresh invalidates everything\n                totalDeleted += await this.invalidateByPattern(env, 'fueldata');\n                totalDeleted += await this.invalidateByPattern(env, 'mapbox-');\n                totalDeleted += await this.invalidateByPattern(env, 'tile-');\n                reason = 'Manual refresh - full cache invalidation';\n                break;\n                \n            case 'cleanup':\n                // Regular cleanup of stale entries\n                totalDeleted += await this.invalidateStale(env);\n                reason = 'Scheduled cleanup of stale entries';\n                break;\n                \n            default:\n                reason = 'Unknown trigger - no action taken';\n        }\n        \n        return { deleted: totalDeleted, reason };\n    }\n\n    static async getCacheStats(env: any): Promise<{ totalKeys: number, sizeEstimate: number, oldestEntry: number }> {\n        try {\n            const list = await env.KV.list();\n            let totalSize = 0;\n            let oldestTimestamp = Date.now();\n            \n            for (const key of list.keys) {\n                // Estimate size (KV doesn't provide actual sizes)\n                totalSize += key.name.length * 2; // Rough estimate\n                \n                const metadata = key.metadata as any;\n                if (metadata && metadata.timestamp && metadata.timestamp < oldestTimestamp) {\n                    oldestTimestamp = metadata.timestamp;\n                }\n            }\n            \n            return {\n                totalKeys: list.keys.length,\n                sizeEstimate: totalSize,\n                oldestEntry: Date.now() - oldestTimestamp\n            };\n        } catch (error) {\n            console.log('Error getting cache stats:', error);\n            return { totalKeys: 0, sizeEstimate: 0, oldestEntry: 0 };\n        }\n    }\n}