jest.mock('expo-crypto', () => {
  const nodeCrypto = require('node:crypto') as typeof import('node:crypto');
  return {
    CryptoDigestAlgorithm: { SHA1: 'SHA-1', SHA256: 'SHA-256' },
    randomUUID: () => nodeCrypto.randomUUID(),
    digestStringAsync: async (algorithm: string, data: string) =>
      nodeCrypto
        .createHash(algorithm === 'SHA-1' ? 'sha1' : 'sha256')
        .update(data)
        .digest('hex'),
  };
});

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
