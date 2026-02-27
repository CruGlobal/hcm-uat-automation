import dotenv from 'dotenv';

dotenv.config();

export const env = {
  oracle: {
    url: process.env.ORACLE_HCM_URL || 'https://placeholder.oraclecloud.com',
    username: process.env.ORACLE_HCM_USERNAME || '',
    password: (process.env.ORACLE_HCM_PASSWORD || '').replace(/^"|"$/g, ''),
  },
  okta: {
    totpSecret: process.env.OKTA_TOTP_SECRET || '',
  },
  google: {
    sheetId: process.env.GOOGLE_SHEET_ID || '',
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    refreshToken: process.env.GOOGLE_REFRESH_TOKEN || '',
  },
  headless: process.env.HEADLESS !== 'false',
  slowMo: Number(process.env.SLOW_MO) || 0,
} as const;
