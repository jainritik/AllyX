import { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
    const baseUrl = 'https://allyx.vercel.app';
    const lastModified = new Date('2026-10-07T00:00:00.000Z');

    return [
        { url: `${baseUrl}/`, lastModified, changeFrequency: 'weekly', priority: 1 },
        { url: `${baseUrl}/about`, lastModified, changeFrequency: 'monthly', priority: 0.7 },
        { url: `${baseUrl}/download`, lastModified, changeFrequency: 'weekly', priority: 0.9 },
        { url: `${baseUrl}/privacy`, lastModified, changeFrequency: 'yearly', priority: 0.3 },
        { url: `${baseUrl}/terms`, lastModified, changeFrequency: 'yearly', priority: 0.3 },
    ];
}
