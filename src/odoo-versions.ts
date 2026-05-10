export const supportedOdooVersions = ['19.0', '18.0', '17.0', '16.0'] as const;

export type SupportedOdooVersion = (typeof supportedOdooVersions)[number];
