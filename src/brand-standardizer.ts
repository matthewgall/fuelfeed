/**
 * Brand name standardization for consistent display
 */
export class BrandStandardizer {
    private static readonly brandMappings: Record<string, string> = {
        'TESCO': 'Tesco',
        'ASDA': 'Asda',
        'BP': 'BP', // Keep BP as acronym
        'SHELL': 'Shell',
        'ESSO': 'Esso',
        'MORRISONS': 'Morrisons',
        "SAINSBURY'S": "Sainsbury's",
        'SAINSBURYS': "Sainsbury's",
        'TEXACO': 'Texaco',
        'JET': 'Jet',
        'GULF': 'Gulf',
        'APPLEGREEN': 'Applegreen',
        'ASCONA': 'Ascona',
        'EURO GARAGES': 'Euro Garages',
        'MFG': 'MFG',
        'PRAX': 'Prax'
    };

    /**
     * Standardize brand name to sentence case for consistent display
     */
    static standardize(brandName: string): string {
        if (!brandName) return 'Station';
        
        const upperBrand = brandName.toUpperCase();
        if (this.brandMappings[upperBrand]) {
            return this.brandMappings[upperBrand];
        }
        
        // For unknown brands, convert to sentence case
        return brandName.toLowerCase()
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    }
}