import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
    return {
        rules: {
            userAgent: '*',
            allow: '/',
            disallow: ['/api/', '/auth/', '/dashboard/', '/desktop', '/interview', '/login', '/scanner-frame'],
        },
        sitemap: 'https://allyx.vercel.app/sitemap.xml',
        host: 'https://allyx.vercel.app',
    };
}
