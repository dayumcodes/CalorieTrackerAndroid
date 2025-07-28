// Jest setup file for React Native testing

// Mock React Native modules that aren't available in Node.js environment
jest.mock('react-native', () => ({
  Platform: {
    OS: 'android',
    select: jest.fn((obj) => obj.android),
  },
  Dimensions: {
    get: jest.fn(() => ({ width: 375, height: 667 })),
  },
}));

// Mock Expo modules
jest.mock('expo-constants', () => ({
  default: {
    expoConfig: {
      name: 'Test App',
    },
  },
}));

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
  getAllKeys: jest.fn(),
  multiGet: jest.fn(),
  multiSet: jest.fn(),
  multiRemove: jest.fn(),
}));

// Mock react-native-in-app-review
jest.mock('react-native-in-app-review', () => ({
  isAvailable: jest.fn(() => true),
  RequestInAppReview: jest.fn(() => Promise.resolve(true)),
}));

// Global test setup
global.__DEV__ = true;

// Suppress console warnings during tests unless explicitly testing them
const originalWarn = console.warn;
const originalError = console.error;

beforeEach(() => {
  console.warn = jest.fn();
  console.error = jest.fn();
});

afterEach(() => {
  console.warn = originalWarn;
  console.error = originalError;
});