import * as crypto from 'crypto';

export interface PresignR2Options {
  accountId: string;
  bucketName: string;
  key: string;
  accessKeyId: string;
  secretAccessKey: string;
  expiresInSeconds?: number;
}

function hmac(key: Buffer | string, data: string): Buffer {
  return crypto.createHmac('sha256', key).update(data, 'utf8').digest();
}

function sha256Hex(data: string): string {
  return crypto.createHash('sha256').update(data, 'utf8').digest('hex');
}

/**
 * Generates an AWS Signature Version 4 presigned GET URL for Cloudflare R2
 * using native Node.js crypto (zero external npm dependencies).
 */
export function generateR2PresignedUrl(options: PresignR2Options): string {
  const {
    accountId,
    bucketName,
    key,
    accessKeyId,
    secretAccessKey,
    expiresInSeconds = 7200,
  } = options;

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, ''); // YYYYMMDDTHHMMSSZ
  const dateStamp = amzDate.substring(0, 8); // YYYYMMDD
  const region = 'auto';
  const service = 's3';

  // Cloudflare R2 S3 endpoint host
  const host = `${accountId}.r2.cloudflarestorage.com`;

  // Encode URI path (each path segment encoded, preserving slashes)
  const cleanKey = key.replace(/^\/+/, '');
  const encodedKey = cleanKey
    .split('/')
    .map(encodeURIComponent)
    .join('/');
  const canonicalUri = `/${bucketName}/${encodedKey}`;

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;

  // Canonical query parameters (MUST be sorted by key)
  const queryParams: Record<string, string> = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${accessKeyId}/${credentialScope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': expiresInSeconds.toString(),
    'X-Amz-SignedHeaders': 'host',
  };

  const canonicalQueryString = Object.keys(queryParams)
    .sort()
    .map(
      (k) =>
        `${encodeURIComponent(k)}=${encodeURIComponent(queryParams[k])}`,
    )
    .join('&');

  const canonicalHeaders = `host:${host}\n`;
  const signedHeaders = 'host';
  const payloadHash = 'UNSIGNED-PAYLOAD';

  const canonicalRequest = [
    'GET',
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n');

  // Derive signing key
  const kDate = hmac(Buffer.from('AWS4' + secretAccessKey, 'utf8'), dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  const kSigning = hmac(kService, 'aws4_request');
  const signature = hmac(kSigning, stringToSign).toString('hex');

  return `https://${host}${canonicalUri}?${canonicalQueryString}&X-Amz-Signature=${signature}`;
}
