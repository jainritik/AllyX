export type Testimonial = {
    quote: string;
    reviewer: string;
    role: string;
    rating: 1 | 2 | 3 | 4 | 5;
};

// Add only permissioned, attributable customer feedback here. Keeping this empty
// prevents the public site from presenting invented reviews or ratings as genuine.
export const testimonials: Testimonial[] = [];
