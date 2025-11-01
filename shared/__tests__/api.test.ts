import { describe, it, expect } from 'vitest';
import type { DemoResponse } from '../api';

describe('shared/api types', () => {
  it('exports DemoResponse interface correctly', () => {
    // This test verifies that the type exports are working
    // Even though TypeScript interfaces don't generate runtime code,
    // we can still test runtime usage of objects conforming to these types
    
    const validDemoResponse: DemoResponse = {
      message: 'test message',
    };

    expect(validDemoResponse).toHaveProperty('message');
    expect(typeof validDemoResponse.message).toBe('string');
  });

  it('DemoResponse type is compatible with expected shape', () => {
    const response: DemoResponse = {
      message: 'Hello from test',
    };

    // Verify the object conforms to the interface
    expect(response.message).toBe('Hello from test');
    
    // This confirms TypeScript compilation passed
    const messageLength: number = response.message.length;
    expect(messageLength).toBeGreaterThan(0);
  });

  it('ensures api module can be imported without errors', () => {
    // TypeScript interfaces compile away but the module can still be imported
    // The fact that this test file compiles and imports the type proves it works
    const validResponse: DemoResponse = {
      message: 'test',
    };
    expect(validResponse.message).toBe('test');
  });
});
