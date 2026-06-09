const SERVICE_TYPES = [
  { value: 'automated-systems', label: 'Automated Systems' },
  { value: 'web-mobile-apps', label: 'Web and Mobile Apps' },
  { value: 'digital-marketing', label: 'Digital Marketing' },
  { value: 'outsourcing', label: 'Outsourcing' },
  { value: 'eshcul', label: 'Eshcul' },
];

const SERVICE_TYPE_VALUES = SERVICE_TYPES.map(s => s.value);

module.exports = { SERVICE_TYPES, SERVICE_TYPE_VALUES };
