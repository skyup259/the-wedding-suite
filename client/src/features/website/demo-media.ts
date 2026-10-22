// Temporary public artwork from the supplied UX references. Replace these
// entries with approved customer media when the managed photo flow is ready.
const image = (name: string) => `/images/demo/${name}.jpg`;
export const demoMedia = {
  covers: {
    traditional: image('couple-traditional'),
    floral: image('couple-floral'),
    minimal: image('couple-champagne'),
  },
  planning: image('palace-courtyard'),
  stationery: image('invitation-stationery'),
  ceremonies: [
    image('mehendi-canopy'),
    image('palace-evening'),
    image('wedding-mandap'),
  ],
  inspiration: [
    {
      src: image('henna-detail'),
      alt: 'Sample photograph of intricate bridal henna',
    },
    {
      src: image('celebration-dancing'),
      alt: 'Sample photograph of a festive dance celebration',
    },
    {
      src: image('wedding-mandap'),
      alt: 'Sample photograph of a flower-decorated wedding mandap',
    },
  ],
};
