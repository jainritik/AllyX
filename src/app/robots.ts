import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
    return {
        rules: {
            userAgent: '*',
            allow: '/',
            disallow: ['/api/', '/_next/', '/static/', '/auth/', '/dashboard/', '/interview', '/login', '/scanner-frame'],
        },
        sitemap: 'https://allyx.vercel.app/sitemap.xml',
    };
}
