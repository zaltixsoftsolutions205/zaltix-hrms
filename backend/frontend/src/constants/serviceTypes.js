export const SERVICE_TYPES = [
  { value: 'automated-systems', label: 'Automated Systems' },
  { value: 'web-mobile-apps', label: 'Web and Mobile Apps' },
  { value: 'digital-marketing', label: 'Digital Marketing' },
  { value: 'outsourcing', label: 'Outsourcing' },
  { value: 'eshcul', label: 'Eshcul' },
];

export const SERVICE_TYPE_MAP = Object.fromEntries(SERVICE_TYPES.map(s => [s.value, s.label]));
